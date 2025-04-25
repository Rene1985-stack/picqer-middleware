/**
 * Updated Picklist Service
 * 
 * This service handles all picklist-related operations between Picqer and SQL database.
 * It includes methods for fetching picklists from Picqer and saving them to the database.
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
      
      // Ensure pool is initialized
      if (!this.pool) {
        this.pool = await this.initializePool();
      }
      
      // Create Picklists table
      await this.pool.request().query(picklistsSchema.createPicklistsTableSQL);
      
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
          // Check if picklists record exists
          const recordResult = await this.pool.request().query(`
            SELECT COUNT(*) AS recordExists 
            FROM SyncStatus 
            WHERE entity_type = 'picklists'
          `);
          
          const picklistsRecordExists = recordResult.recordset[0].recordExists > 0;
          
          if (picklistsRecordExists) {
            // Update existing record
            await this.pool.request().query(`
              UPDATE SyncStatus 
              SET entity_name = 'picklists' 
              WHERE entity_type = 'picklists'
            `);
            console.log('Updated existing picklists entity in SyncStatus');
          } else {
            // Insert new record
            await this.pool.request().query(`
              INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
              VALUES ('picklists', 'picklists', '2025-01-01T00:00:00.000Z')
            `);
            console.log('Added picklists record to SyncStatus table');
          }
        } else {
          console.warn('entity_type column does not exist in SyncStatus table');
        }
      } else {
        console.warn('SyncStatus table does not exist');
      }
      
      console.log('✅ Picklists database schema initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing picklists database schema:', error.message);
      throw error;
    }
  }

  /**
   * Fetch picklists from Picqer API
   * @returns {Promise<Array>} - Array of picklist objects
   */
  async fetchPicklists() {
    try {
      console.log('Fetching picklists from Picqer API...');
      
      // Get picklists from Picqer
      const response = await this.client.get('/picklists');
      
      if (!response.data || !response.data.data) {
        console.error('Invalid response format from Picqer API');
        return [];
      }
      
      const picklists = response.data.data;
      console.log(`Fetched ${picklists.length} picklists from Picqer API`);
      
      return picklists;
    } catch (error) {
      console.error('Error fetching picklists from Picqer:', error.message);
      throw error;
    }
  }

  /**
   * Save a picklist to the database
   * @param {Object} picklist - Picklist object from Picqer
   * @returns {Promise<boolean>} - Success status
   */
  async savePicklist(picklist) {
    try {
      // Ensure pool is initialized
      if (!this.pool) {
        console.log('Initializing pool for savePicklist() in PicklistService...');
        this.pool = await this.initializePool();
      }
      
      // Check if picklist already exists
      const existingPicklist = await this.pool.request()
        .input('picklistId', sql.VarChar, picklist.idpicklist)
        .query(`
          SELECT idpicklist
          FROM Picklists
          WHERE idpicklist = @picklistId
        `);
      
      if (existingPicklist.recordset.length > 0) {
        // Update existing picklist
        await this.pool.request()
          .input('picklistId', sql.VarChar, picklist.idpicklist)
          .input('status', sql.NVarChar, picklist.status || '')
          .input('updatedAt', sql.DateTimeOffset, new Date())
          .input('data', sql.NVarChar, JSON.stringify(picklist))
          .input('lastSyncDate', sql.DateTimeOffset, new Date())
          .query(`
            UPDATE Picklists
            SET status = @status,
                updated = @updatedAt,
                data = @data,
                last_sync_date = @lastSyncDate
            WHERE idpicklist = @picklistId
          `);
        
        console.log(`Updated picklist ${picklist.idpicklist} in database`);
      } else {
        // Insert new picklist
        await this.pool.request()
          .input('picklistId', sql.VarChar, picklist.idpicklist)
          .input('status', sql.NVarChar, picklist.status || '')
          .input('createdAt', sql.DateTimeOffset, new Date())
          .input('updatedAt', sql.DateTimeOffset, new Date())
          .input('data', sql.NVarChar, JSON.stringify(picklist))
          .input('lastSyncDate', sql.DateTimeOffset, new Date())
          .query(`
            INSERT INTO Picklists (idpicklist, status, created, updated, data, last_sync_date)
            VALUES (@picklistId, @status, @createdAt, @updatedAt, @data, @lastSyncDate)
          `);
        
        console.log(`Inserted new picklist ${picklist.idpicklist} into database`);
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving picklist ${picklist.idpicklist}:`, error.message);
      throw error;
    }
  }
}

module.exports = PicklistService;
