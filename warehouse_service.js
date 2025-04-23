/**
 * Optimized Warehouse service with performance enhancements
 * Includes performance optimizations:
 * 1. 30-day rolling window for incremental syncs
 * 2. Increased batch size for database operations
 * 3. Optimized database operations with bulk inserts
 * 4. Newest-first processing to prioritize recent data
 * 5. Resumable sync to continue from last position after restarts
 */
const axios = require('axios');
const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');
const warehousesSchema = require('./warehouses_schema');
const syncProgressSchema = require('./sync_progress_schema');

class WarehouseService {
  constructor(apiKey, baseUrl, sqlConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.sqlConfig = sqlConfig;
    this.batchSize = 100; // Use larger batch size for better performance
    this.pool = null; // Added for connection pool management
    
    // Create Base64 encoded credentials (apiKey + ":")
    const credentials = `${this.apiKey}:`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');
    
    // Create client with Basic Authentication header
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Basic ${encodedCredentials}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PicqerMiddleware (middleware@skapa-global.com)'
      }
    });
    
    // Add request interceptor for debugging
    this.client.interceptors.request.use(request => {
      console.log('Making request to:', request.baseURL + request.url);
      return request;
    });
    
    // Add response interceptor for debugging
    this.client.interceptors.response.use(
      response => {
        console.log('Response status:', response.status);
        return response;
      },
      error => {
        console.error('Request failed:');
        if (error.response) {
          console.error('Response status:', error.response.status);
        } else if (error.request) {
          console.error('No response received');
        } else {
          console.error('Error message:', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Initialize the service
   * Establishes database connection early in the lifecycle
   * @returns {Promise<boolean>} - Success status
   */
  async initialize() {
    try {
      // Initialize the pool as early as possible
      if (!this.pool) {
        console.log('Initializing pool in WarehouseService...');
        this.pool = await this.initializePool();
      }
      
      // Initialize database schema
      await this.initializeWarehousesDatabase();
      
      console.log('WarehouseService fully initialized');
      return true;
    } catch (error) {
      console.error('Error initializing WarehouseService:', error.message);
      return false;
    }
  }

  /**
   * Initialize the database connection pool with retry logic
   * @returns {Promise<sql.ConnectionPool>} - SQL connection pool
   */
  async initializePool() {
    if (!this.pool) {
      let retries = 3;
      let lastError = null;
      
      while (retries > 0) {
        try {
          console.log(`Attempting to initialize database connection pool (${retries} retries left)...`);
          this.pool = await new sql.ConnectionPool(this.sqlConfig).connect();
          console.log('Database connection pool initialized successfully');
          return this.pool;
        } catch (error) {
          lastError = error;
          console.error(`Error initializing database connection pool (retrying): ${error.message}`);
          retries--;
          
          if (retries > 0) {
            // Wait before retrying (exponential backoff)
            const waitTime = (4 - retries) * 1000; // 1s, 2s, 3s
            console.log(`Waiting ${waitTime}ms before retrying...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }
      
      console.error('Failed to initialize database connection pool after multiple attempts');
      throw lastError;
    }
    
    return this.pool;
  }

  /**
   * Get the total count of warehouses in the database
   * @returns {Promise<number>} - Total count of warehouses
   */
  async getCount() {
    try {
      // Ensure pool is initialized
      if (!this.pool) {
        console.log('Initializing pool for getCount() in WarehouseService...');
        this.pool = await this.initializePool();
      }
      
      const result = await this.pool.request().query('SELECT COUNT(*) AS count FROM Warehouses');
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting warehouse count:', error.message);
      // Return a default value instead of throwing an error
      return 0;
    }
  }

  /**
   * Get the last sync date for warehouses
   * @returns {Promise<Date|null>} - Last sync date
   */
  async getLastSyncDate() {
    try {
      // Ensure pool is initialized
      if (!this.pool) {
        console.log('Initializing pool for getLastSyncDate() in WarehouseService...');
        this.pool = await this.initializePool();
      }
      
      const result = await this.pool.request().query(`
        SELECT last_sync_date 
        FROM SyncStatus 
        WHERE entity_name = 'warehouses'
      `);
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      // Fallback: Get the most recent last_sync_date from Warehouses table
      try {
        // Ensure pool is still available for fallback
        if (!this.pool) {
          console.log('Reinitializing pool for fallback last sync date in WarehouseService...');
          this.pool = await this.initializePool();
        }
        
        const fallbackResult = await this.pool.request().query(`
          SELECT MAX(last_sync_date) AS last_sync_date 
          FROM Warehouses
        `);
        
        if (fallbackResult.recordset.length > 0 && fallbackResult.recordset[0].last_sync_date) {
          return new Date(fallbackResult.recordset[0].last_sync_date);
        }
      } catch (fallbackError) {
        console.error('Error getting fallback last sync date for warehouses:', fallbackError.message);
      }
      
      // If all else fails, return a date 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return thirtyDaysAgo;
    } catch (error) {
      console.error('Error getting last sync date for warehouses:', error.message);
      
      // Return a date 30 days ago as a fallback
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return thirtyDaysAgo;
    }
  }

  /**
   * Initialize the database with warehouses schema and sync progress tracking
   * @returns {Promise<boolean>} - Success status
   */
  async initializeWarehousesDatabase() {
    try {
      console.log('Initializing database with warehouses schema...');
      
      // Ensure pool is initialized
      if (!this.pool) {
        this.pool = await this.initializePool();
      }
      
      // Create Warehouses table
      await this.pool.request().query(warehousesSchema.createWarehousesTableSQL);
      
      // Create WarehouseStock table
      await this.pool.request().query(warehousesSchema.createWarehouseStockTableSQL);
      
      // Create SyncProgress table for resumable sync if it doesn't exist
      await this.pool.request().query(syncProgressSchema.createSyncProgressTableSQL);
      console.log('✅ Created/verified SyncProgress table for resumable sync functionality');
      
      // Check if SyncStatus table exists
      const tableResult = await this.pool.request().query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'SyncStatus'
      `);
      
      const syncTableExists = tableResult.recordset[0].tableExists > 0;
      
      if (syncTableExists) {
        // Check if entity_type column exists in SyncStatus
        const columnResult = await this.pool.request().query(`
          SELECT COUNT(*) AS columnExists 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'SyncStatus' AND COLUMN_NAME = 'entity_type'
        `);
        
        const entityTypeColumnExists = columnResult.recordset[0].columnExists > 0;
        
        if (entityTypeColumnExists) {
          // Check if warehouses record exists
          const recordResult = await this.pool.request().query(`
            SELECT COUNT(*) AS recordExists 
            FROM SyncStatus 
            WHERE entity_type = 'warehouses'
          `);
          
          const warehousesRecordExists = recordResult.recordset[0].recordExists > 0;
          
          if (warehousesRecordExists) {
            // Update existing record
            await this.pool.request().query(`
              UPDATE SyncStatus 
              SET entity_name = 'warehouses' 
              WHERE entity_type = 'warehouses'
            `);
            console.log('Updated existing warehouses entity in SyncStatus');
          } else {
            // Insert new record
            await this.pool.request().query(`
              INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
              VALUES ('warehouses', 'warehouses', '2025-01-01T00:00:00.000Z')
            `);
            console.log('Added warehouses record to SyncStatus table');
          }
        } else {
          console.warn('entity_type column does not exist in SyncStatus table');
        }
      } else {
        console.warn('SyncStatus table does not exist');
      }
      
      console.log('✅ Warehouses database schema initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing warehouses database schema:', error.message);
      throw error;
    }
  }

  // Rest of your WarehouseService implementation...
}

module.exports = WarehouseService;
