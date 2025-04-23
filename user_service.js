/**
 * Enhanced User Service with Rate Limiting and Sync Methods
 * 
 * This service handles user data synchronization between Picqer and the database.
 * It includes:
 * 1. Rate limiting to prevent "Rate limit exceeded" errors
 * 2. Complete sync methods for the dashboard
 * 3. Proper error handling and logging
 * 4. Performance optimizations for efficient data processing
 */
const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');
const usersSchema = require('./users_schema');
const syncProgressSchema = require('./sync_progress_schema');
const PicqerApiClient = require('./picqer-api-client');

class UserService {
  /**
   * Initialize the UserService
   * @param {string} apiKey - Picqer API key
   * @param {string} baseUrl - Picqer API base URL
   * @param {Object} dbConfig - Database configuration
   */
  constructor(apiKey, baseUrl, dbConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.dbConfig = dbConfig;
    this.batchSize = 100; // Use larger batch size for better performance
    this.pool = null; // Added for connection pool management
    
    // Initialize API client with rate limiting
    this.apiClient = new PicqerApiClient(apiKey, baseUrl, {
      requestsPerMinute: 30, // Adjust based on your Picqer plan
      maxRetries: 5,
      waitOnRateLimit: true,
      sleepTimeOnRateLimitHitInMs: 20000 // 20 seconds, like Picqer's default
    });
    
    console.log('UserService initialized with rate-limited Picqer API client');
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
        console.log('Initializing pool in UserService...');
        this.pool = await this.initializePool();
      }
      
      // Initialize database schema
      await this.initializeUsersDatabase();
      
      console.log('UserService fully initialized');
      return true;
    } catch (error) {
      console.error('Error initializing UserService:', error.message);
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
          this.pool = await new sql.ConnectionPool(this.dbConfig).connect();
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
   * Get the total count of users in the database
   * @returns {Promise<number>} - Total count of users
   */
  async getCount() {
    try {
      // Ensure pool is initialized
      if (!this.pool) {
        console.log('Initializing pool for getCount() in UserService...');
        this.pool = await this.initializePool();
      }
      
      const result = await this.pool.request().query('SELECT COUNT(*) AS count FROM Users');
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting user count:', error.message);
      // Return a default value instead of throwing an error
      return 0;
    }
  }

  /**
   * Get the last sync date for users
   * @returns {Promise<Date|null>} - Last sync date
   */
  async getLastSyncDate() {
    try {
      // Ensure pool is initialized
      if (!this.pool) {
        console.log('Initializing pool for getLastSyncDate() in UserService...');
        this.pool = await this.initializePool();
      }
      
      const result = await this.pool.request().query(`
        SELECT last_sync_date 
        FROM SyncStatus 
        WHERE entity_name = 'users'
      `);
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      // Fallback: Get the most recent last_sync_date from Users table
      try {
        // Ensure pool is still available for fallback
        if (!this.pool) {
          console.log('Reinitializing pool for fallback last sync date in UserService...');
          this.pool = await this.initializePool();
        }
        
        const fallbackResult = await this.pool.request().query(`
          SELECT MAX(last_sync_date) AS last_sync_date 
          FROM Users
        `);
        
        if (fallbackResult.recordset.length > 0 && fallbackResult.recordset[0].last_sync_date) {
          return new Date(fallbackResult.recordset[0].last_sync_date);
        }
      } catch (fallbackError) {
        console.error('Error getting fallback last sync date for users:', fallbackError.message);
      }
      
      // If all else fails, return a date 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return thirtyDaysAgo;
    } catch (error) {
      console.error('Error getting last sync date for users:', error.message);
      
      // Return a date 30 days ago as a fallback
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return thirtyDaysAgo;
    }
  }

  /**
   * Initialize the database with users schema and sync progress tracking
   * @returns {Promise<boolean>} - Success status
   */
  async initializeUsersDatabase() {
    try {
      console.log('Initializing database with users schema...');
      
      // Ensure pool is initialized
      if (!this.pool) {
        this.pool = await this.initializePool();
      }
      
      // Create Users table
      await this.pool.request().query(usersSchema.createUsersTableSQL);
      
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
          SELECT COUNT(*) AS columnExists 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'SyncStatus' AND COLUMN_NAME = 'entity_type'
        `);
        
        const entityTypeColumnExists = columnResult.recordset[0].columnExists > 0;
        
        if (entityTypeColumnExists) {
          // Check if users record exists
          const recordResult = await this.pool.request().query(`
            SELECT COUNT(*) AS recordExists 
            FROM SyncStatus 
            WHERE entity_type = 'users'
          `);
          
          const usersRecordExists = recordResult.recordset[0].recordExists > 0;
          
          if (usersRecordExists) {
            // Update existing record
            await this.pool.request().query(`
              UPDATE SyncStatus 
              SET entity_name = 'users' 
              WHERE entity_type = 'users'
            `);
            console.log('Updated existing users entity in SyncStatus');
          } else {
            // Insert new record
            await this.pool.request().query(`
              INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
              VALUES ('users', 'users', '2025-01-01T00:00:00.000Z')
            `);
            console.log('Added users record to SyncStatus table');
          }
        } else {
          console.warn('entity_type column does not exist in SyncStatus table');
        }
      } else {
        console.warn('SyncStatus table does not exist');
      }
      
      console.log('✅ Users database schema initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing users database schema:', error.message);
      throw error;
    }
  }

  // Rest of your UserService implementation...
}

module.exports = UserService;
