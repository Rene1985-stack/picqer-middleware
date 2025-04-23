/**
 * Optimized Picklist service with resumable sync functionality
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
const picklistsSchema = require('./picklists_schema');
const syncProgressSchema = require('./sync_progress_schema');

class PicklistService {
  constructor(apiKey, baseUrl, sqlConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    
    // Enhanced sqlConfig handling with port safeguard
    this.sqlConfig = sqlConfig ? {
      ...sqlConfig,
      port: sqlConfig.port || 1433 // Ensure port is always defined with default 1433
    } : null;
    
    // Log configuration for debugging (without password)
    if (this.sqlConfig) {
      console.log('PicklistService database config:', {
        server: this.sqlConfig.server,
        port: this.sqlConfig.port,
        database: this.sqlConfig.database,
        user: this.sqlConfig.user
      });
    } else {
      console.warn('PicklistService initialized with null or undefined sqlConfig');
    }
    
    this.batchSize = 100; // Increased from 20 to 100 for better performance
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
        console.log('Initializing pool in PicklistService...');
        this.pool = await this.initializePool();
      }
      
      // Initialize database schema
      await this.initializePicklistsDatabase();
      
      console.log('PicklistService fully initialized');
      return true;
    } catch (error) {
      console.error('Error initializing PicklistService:', error.message);
      return false;
    }
  }

  /**
   * Initialize the database connection pool with retry logic
   * @returns {Promise<sql.ConnectionPool>} - SQL connection pool
   */
  async initializePool() {
    if (!this.pool) {
      // Verify sqlConfig is properly defined
      if (!this.sqlConfig) {
        console.error('Cannot initialize pool: sqlConfig is null or undefined');
        throw new Error('Database configuration is missing');
      }
      
      // Ensure port is defined
      if (!this.sqlConfig.port) {
        console.log('Port not defined in sqlConfig, setting default port 1433');
        this.sqlConfig.port = 1433;
      }
      
      // Log the configuration being used (without password)
      console.log('Initializing pool with config:', {
        server: this.sqlConfig.server,
        port: this.sqlConfig.port,
        database: this.sqlConfig.database,
        user: this.sqlConfig.user
      });
      
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
   * Get the total count of picklists in the database
   * @returns {Promise<number>} - Total count of picklists
   */
  async getCount() {
    try {
      // Ensure pool is initialized
      if (!this.pool) {
        console.log('Initializing pool for getCount() in PicklistService...');
        this.pool = await this.initializePool();
      }
      
      const result = await this.pool.request().query('SELECT COUNT(*) AS count FROM Picklists');
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting picklist count:', error.message);
      // Return a default value instead of throwing an error
      return 0;
    }
  }

  /**
   * Get the last sync date for picklists
   * @returns {Promise<Date|null>} - Last sync date
   */
  async getLastSyncDate() {
    try {
      // Ensure pool is initialized
      if (!this.pool) {
        console.log('Initializing pool for getLastSyncDate() in PicklistService...');
        this.pool = await this.initializePool();
      }
      
      const result = await this.pool.request().query(`
        SELECT last_sync_date 
        FROM SyncStatus 
        WHERE entity_name = 'picklists'
      `);
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      // Fallback: Get the most recent last_sync_date from Picklists table
      try {
        // Ensure pool is still available for fallback
        if (!this.pool) {
          console.log('Reinitializing pool for fallback last sync date in PicklistService...');
          this.pool = await this.initializePool();
        }
        
        const fallbackResult = await this.pool.request().query(`
          SELECT MAX(last_sync_date) AS last_sync_date 
          FROM Picklists
        `);
        
        if (fallbackResult.recordset.length > 0 && fallbackResult.recordset[0].last_sync_date) {
          return new Date(fallbackResult.recordset[0].last_sync_date);
        }
      } catch (fallbackError) {
        console.error('Error getting fallback last sync date for picklists:', fallbackError.message);
      }
      
      // If all else fails, return a date 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return thirtyDaysAgo;
    } catch (error) {
      console.error('Error getting last sync date for picklists:', error.message);
      
      // Return a date 30 days ago as a fallback
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return thirtyDaysAgo;
    }
  }

  /**
   * Initialize the database with picklists schema and sync progress tracking
   * @returns {Promise<boolean>} - Success status
   */
  async initializePicklistsDatabase() {
    try {
      console.log('Initializing database with picklists schema...');
      
      // Ensure pool is initialized with enhanced error handling
      if (!this.pool) {
        try {
          this.pool = await this.initializePool();
        } catch (poolError) {
          console.error('Failed to initialize pool for picklists schema:', poolError.message);
          // Create a fallback configuration if needed
          if (!this.sqlConfig || !this.sqlConfig.port) {
            console.log('Creating fallback configuration with default port 1433');
            this.sqlConfig = {
              ...(this.sqlConfig || {}),
              port: 1433,
              options: {
                ...(this.sqlConfig?.options || {}),
                encrypt: true
              }
            };
            this.pool = await new sql.ConnectionPool(this.sqlConfig).connect();
          } else {
            throw poolError; // Re-throw if we can't recover
          }
        }
      }
      
      // Create Picklists table
      await this.pool.request().query(picklistsSchema.createPicklistsTableSQL);
      
      // Create PicklistProducts table
      await this.pool.request().query(picklistsSchema.createPicklistProductsTableSQL);
      
      // Create PicklistProductLocations table
      await this.pool.request().query(picklistsSchema.createPicklistProductLocationsTableSQL);
      
      // Create SyncProgress table for resumable sync
      await this.pool.request().query(syncProgressSchema.createSyncProgressTableSQL);
      console.log('✅ Created SyncProgress table for resumable sync functionality');
      
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
          SELECT 
            COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE 
            TABLE_NAME = 'SyncStatus' AND 
            COLUMN_NAME = 'entity_type'
        `);
        
        const hasEntityTypeColumn = columnResult.recordset.length > 0;
        
        if (hasEntityTypeColumn) {
          // Check if picklists entity already exists in SyncStatus with entity_type
          const entityTypeResult = await this.pool.request().query(`
            SELECT COUNT(*) AS entityExists 
            FROM SyncStatus 
            WHERE entity_type = 'picklists'
          `);
          
          const entityTypeExists = entityTypeResult.recordset[0].entityExists > 0;
          
          if (entityTypeExists) {
            // Entity with this entity_type already exists, update it instead of inserting
            await this.pool.request().query(`
              UPDATE SyncStatus 
              SET entity_name = 'picklists', last_sync_date = '2025-01-01T00:00:00.000Z'
              WHERE entity_type = 'picklists'
            `);
            console.log('Updated existing picklists entity in SyncStatus');
          } else {
            // Check if picklists entity exists by name
            const entityNameResult = await this.pool.request().query(`
              SELECT COUNT(*) AS entityExists 
              FROM SyncStatus 
              WHERE entity_name = 'picklists'
            `);
            
            const entityNameExists = entityNameResult.recordset[0].entityExists > 0;
            
            if (entityNameExists) {
              // Entity with this name exists, update it
              await this.pool.request().query(`
                UPDATE SyncStatus 
                SET entity_type = 'picklists', last_sync_date = '2025-01-01T00:00:00.000Z'
                WHERE entity_name = 'picklists'
              `);
              console.log('Updated existing picklists entity in SyncStatus');
            } else {
              // No entity exists, insert new one
              await this.pool.request().query(`
                INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
                VALUES ('picklists', 'picklists', '2025-01-01T00:00:00.000Z');
              `);
              console.log('Inserted new picklists entity in SyncStatus');
            }
          }
        } else {
          // No entity_type column, check by entity_name only
          const entityResult = await this.pool.request().query(`
            SELECT COUNT(*) AS entityExists 
            FROM SyncStatus 
            WHERE entity_name = 'picklists'
          `);
          
          const entityExists = entityResult.recordset[0].entityExists > 0;
          
          if (entityExists) {
            // Entity exists, update it
            await this.pool.request().query(`
              UPDATE SyncStatus 
              SET last_sync_date = '2025-01-01T00:00:00.000Z'
              WHERE entity_name = 'picklists'
            `);
            console.log('Updated existing picklists entity in SyncStatus');
          } else {
            // No entity exists, insert new one
            await this.pool.request().query(`
              INSERT INTO SyncStatus (entity_name, last_sync_date)
              VALUES ('picklists', '2025-01-01T00:00:00.000Z');
            `);
            console.log('Inserted new picklists entity in SyncStatus');
          }
        }
      }
      
      console.log('✅ Picklists database schema initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing picklists database schema:', error.message);
      throw error;
    }
  }

  // Rest of your PicklistService implementation...
}

module.exports = PicklistService;
