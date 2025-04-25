/**
 * Updated User Service
 * 
 * This service handles all user-related operations between Picqer and SQL database.
 * It includes methods for fetching users from Picqer and saving them to the database.
 */
const axios = require('axios');
const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');
const usersSchema = require('./users_schema');
const syncProgressSchema = require('./sync_progress_schema');

class UserService {
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

  /**
   * Fetch users from Picqer API
   * @returns {Promise<Array>} - Array of user objects
   */
  async fetchUsers() {
    try {
      console.log('Fetching users from Picqer API...');
      
      // Get users from Picqer
      const response = await this.client.get('/users');
      
      if (!response.data || !response.data.data) {
        console.error('Invalid response format from Picqer API');
        return [];
      }
      
      const users = response.data.data;
      console.log(`Fetched ${users.length} users from Picqer API`);
      
      return users;
    } catch (error) {
      console.error('Error fetching users from Picqer:', error.message);
      throw error;
    }
  }

  /**
   * Save a user to the database
   * @param {Object} user - User object from Picqer
   * @returns {Promise<boolean>} - Success status
   */
  async saveUser(user) {
    try {
      // Ensure pool is initialized
      if (!this.pool) {
        console.log('Initializing pool for saveUser() in UserService...');
        this.pool = await this.initializePool();
      }
      
      // Check if user already exists
      const existingUser = await this.pool.request()
        .input('userId', sql.VarChar, user.iduser)
        .query(`
          SELECT iduser
          FROM Users
          WHERE iduser = @userId
        `);
      
      if (existingUser.recordset.length > 0) {
        // Update existing user
        await this.pool.request()
          .input('userId', sql.VarChar, user.iduser)
          .input('name', sql.NVarChar, user.name || '')
          .input('email', sql.NVarChar, user.email || '')
          .input('updatedAt', sql.DateTimeOffset, new Date())
          .input('data', sql.NVarChar, JSON.stringify(user))
          .input('lastSyncDate', sql.DateTimeOffset, new Date())
          .query(`
            UPDATE Users
            SET name = @name,
                email = @email,
                updated = @updatedAt,
                data = @data,
                last_sync_date = @lastSyncDate
            WHERE iduser = @userId
          `);
        
        console.log(`Updated user ${user.iduser} in database`);
      } else {
        // Insert new user
        await this.pool.request()
          .input('userId', sql.VarChar, user.iduser)
          .input('name', sql.NVarChar, user.name || '')
          .input('email', sql.NVarChar, user.email || '')
          .input('createdAt', sql.DateTimeOffset, new Date())
          .input('updatedAt', sql.DateTimeOffset, new Date())
          .input('data', sql.NVarChar, JSON.stringify(user))
          .input('lastSyncDate', sql.DateTimeOffset, new Date())
          .query(`
            INSERT INTO Users (iduser, name, email, created, updated, data, last_sync_date)
            VALUES (@userId, @name, @email, @createdAt, @updatedAt, @data, @lastSyncDate)
          `);
        
        console.log(`Inserted new user ${user.iduser} into database`);
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving user ${user.iduser}:`, error.message);
      throw error;
    }
  }
}

module.exports = UserService;
