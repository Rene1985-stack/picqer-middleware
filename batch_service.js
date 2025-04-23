/**
 * Fixed Batch Service with Corrected Offset Management
 * 
 * This file fixes the issues with batch synchronization:
 * 1. Corrects the API endpoint path from '/picklist/batches' to '/picklists/batches'
 * 2. Fixes the offset tracking logic to prevent inconsistent offset values
 * 3. Adds proper database connection pool handling
 * 4. Implements missing methods (getCount, getLastSyncDate, initialize)
 * 5. Adds a reset function to start fresh when needed
 */

const axios = require('axios');
const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');
const batchesSchema = require('./batches_schema');

class BatchService {
  constructor(apiKey, baseUrl, sqlConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    
    // Enhanced sqlConfig handling with complete safeguards
    if (sqlConfig) {
      this.sqlConfig = {
        ...sqlConfig,
        server: sqlConfig.server || process.env.SQL_SERVER,
        port: sqlConfig.port || parseInt(process.env.SQL_PORT || '1433', 10),
        database: sqlConfig.database || process.env.SQL_DATABASE,
        user: sqlConfig.user || process.env.SQL_USER,
        password: sqlConfig.password || process.env.SQL_PASSWORD,
        options: {
          ...(sqlConfig.options || {}),
          encrypt: true
        }
      };
    } else {
      // Create config from environment variables if sqlConfig is null
      this.sqlConfig = {
        server: process.env.SQL_SERVER,
        port: parseInt(process.env.SQL_PORT || '1433', 10),
        database: process.env.SQL_DATABASE,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        options: {
          encrypt: true
        }
      };
    }
    
    // Verify essential properties
    if (!this.sqlConfig.server) {
      console.error('WARNING: SQL Server not defined in configuration or environment variables');
    }
    
    if (!this.sqlConfig.database) {
      console.error('WARNING: SQL Database not defined in configuration or environment variables');
    }
    
    // Log configuration for debugging (without password)
    console.log('BatchService database config:', {
      server: this.sqlConfig.server,
      port: this.sqlConfig.port,
      database: this.sqlConfig.database,
      user: this.sqlConfig.user
    });
    
    this.pool = null;
    this.batchSize = 100;
    
    // Create Base64 encoded credentials (apiKey + ":")
    const credentials = `${this.apiKey}:`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');
    
    // Create client with Basic Authentication header
    this.apiClient = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Basic ${encodedCredentials}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PicqerMiddleware (middleware@skapa-global.com)'
      }
    });
    
    // Add request interceptor for debugging
    this.apiClient.interceptors.request.use(request => {
      console.log('Making request to:', request.baseURL + request.url);
      return request;
    });
    
    // Add response interceptor for debugging
    this.apiClient.interceptors.response.use(
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
    
    console.log('BatchService initialized with rate-limited Picqer API client');
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
        console.log('Initializing pool in BatchService...');
        this.pool = await this.initializePool();
      }
      
      // Initialize database schema
      await this.initializeBatchesDatabase();
      
      console.log('BatchService fully initialized');
      return true;
    } catch (error) {
      console.error('Error initializing BatchService:', error.message);
      return false;
    }
  }

  /**
   * Initialize the database connection pool with retry logic
   * @returns {Promise<sql.ConnectionPool>} - SQL connection pool
   */
  async initializePool() {
    if (!this.pool) {
      // Verify sqlConfig is properly defined with all required properties
      if (!this.sqlConfig) {
        console.error('Cannot initialize pool: sqlConfig is null or undefined');
        
        // Create config from environment variables as last resort
        this.sqlConfig = {
          server: process.env.SQL_SERVER,
          port: parseInt(process.env.SQL_PORT || '1433', 10),
          database: process.env.SQL_DATABASE,
          user: process.env.SQL_USER,
          password: process.env.SQL_PASSWORD,
          options: {
            encrypt: true
          }
        };
        
        if (!this.sqlConfig.server) {
          throw new Error('Database server configuration is missing');
        }
      }
      
      // Ensure all required properties are defined
      if (!this.sqlConfig.server) {
        console.error('Server not defined in sqlConfig');
        throw new Error('Database server configuration is missing');
      }
      
      if (!this.sqlConfig.database) {
        console.error('Database not defined in sqlConfig');
        throw new Error('Database name configuration is missing');
      }
      
      if (!this.sqlConfig.user) {
        console.error('User not defined in sqlConfig');
        throw new Error('Database user configuration is missing');
      }
      
      if (!this.sqlConfig.password) {
        console.error('Password not defined in sqlConfig');
        throw new Error('Database password configuration is missing');
      }
      
      // Ensure port is defined
      if (!this.sqlConfig.port) {
        console.log('Port not defined in sqlConfig, setting default port 1433');
        this.sqlConfig.port = 1433;
      }
      
      // Ensure options are defined
      if (!this.sqlConfig.options) {
        this.sqlConfig.options = { encrypt: true };
      } else if (this.sqlConfig.options.encrypt === undefined) {
        this.sqlConfig.options.encrypt = true;
      }
      
      // Log the configuration being used (without password)
      console.log('Initializing pool with config:', {
        server: this.sqlConfig.server,
        port: this.sqlConfig.port,
        database: this.sqlConfig.database,
        user: this.sqlConfig.user,
        options: {
          encrypt: this.sqlConfig.options.encrypt
        }
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
   * Get the total count of batches in the database
   * @returns {Promise<number>} - Total count of batches
   */
  async getCount() {
    try {
      // Ensure pool is initialized
      if (!this.pool) {
        console.log('Initializing pool for getCount() in BatchService...');
        this.pool = await this.initializePool();
      }
      
      const result = await this.pool.request().query('SELECT COUNT(*) AS count FROM Batches');
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting batch count:', error.message);
      // Return a default value instead of throwing an error
      return 0;
    }
  }

  /**
   * Get the last sync date for batches
   * @returns {Promise<Date|null>} - Last sync date
   */
  async getLastSyncDate() {
    try {
      // Ensure pool is initialized
      if (!this.pool) {
        console.log('Initializing pool for getLastSyncDate() in BatchService...');
        this.pool = await this.initializePool();
      }
      
      const result = await this.pool.request().query(`
        SELECT last_sync_date 
        FROM SyncStatus 
        WHERE entity_name = 'batches'
      `);
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      // Fallback: Get the most recent last_sync_date from Batches table
      try {
        // Ensure pool is still available for fallback
        if (!this.pool) {
          console.log('Reinitializing pool for fallback last sync date in BatchService...');
          this.pool = await this.initializePool();
        }
        
        const fallbackResult = await this.pool.request().query(`
          SELECT MAX(last_sync_date) AS last_sync_date 
          FROM Batches
        `);
        
        if (fallbackResult.recordset.length > 0 && fallbackResult.recordset[0].last_sync_date) {
          return new Date(fallbackResult.recordset[0].last_sync_date);
        }
      } catch (fallbackError) {
        console.error('Error getting fallback last sync date for batches:', fallbackError.message);
      }
      
      // If all else fails, return a date 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return thirtyDaysAgo;
    } catch (error) {
      console.error('Error getting last sync date for batches:', error.message);
      
      // Return a date 30 days ago as a fallback
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return thirtyDaysAgo;
    }
  }

  /**
   * Initialize the database with batches schema
   * @returns {Promise<boolean>} - Success status
   */
  async initializeBatchesDatabase() {
    try {
      console.log('Initializing database with batches schema...');
      
      // Ensure pool is initialized with enhanced error handling
      if (!this.pool) {
        try {
          this.pool = await this.initializePool();
        } catch (poolError) {
          console.error('Failed to initialize pool for batches schema:', poolError.message);
          
          // Create a complete fallback configuration from environment variables
          console.log('Creating complete fallback configuration from environment variables');
          this.sqlConfig = {
            server: process.env.SQL_SERVER,
            port: parseInt(process.env.SQL_PORT || '1433', 10),
            database: process.env.SQL_DATABASE,
            user: process.env.SQL_USER,
            password: process.env.SQL_PASSWORD,
            options: {
              encrypt: true
            }
          };
          
          // Verify essential properties
          if (!this.sqlConfig.server) {
            throw new Error('Database server not defined in environment variables');
          }
          
          if (!this.sqlConfig.database) {
            throw new Error('Database name not defined in environment variables');
          }
          
          if (!this.sqlConfig.user) {
            throw new Error('Database user not defined in environment variables');
          }
          
          if (!this.sqlConfig.password) {
            throw new Error('Database password not defined in environment variables');
          }
          
          console.log('Attempting connection with fallback configuration:', {
            server: this.sqlConfig.server,
            port: this.sqlConfig.port,
            database: this.sqlConfig.database,
            user: this.sqlConfig.user
          });
          
          this.pool = await new sql.ConnectionPool(this.sqlConfig).connect();
          console.log('Successfully connected with fallback configuration');
        }
      }
      
      // Create Batches table
      await this.pool.request().query(batchesSchema.createBatchesTableSQL);
      
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
          // Check if batches entity already exists in SyncStatus with entity_type
          const entityTypeResult = await this.pool.request().query(`
            SELECT COUNT(*) AS entityExists 
            FROM SyncStatus 
            WHERE entity_type = 'batches'
          `);
          
          const entityTypeExists = entityTypeResult.recordset[0].entityExists > 0;
          
          if (entityTypeExists) {
            // Entity with this entity_type already exists, update it instead of inserting
            await this.pool.request().query(`
              UPDATE SyncStatus 
              SET entity_name = 'batches', last_sync_date = '2020-01-01T00:00:00.000Z'
              WHERE entity_type = 'batches'
            `);
            console.log('Updated existing batches entity in SyncStatus');
          } else {
            // Check if batches entity exists by name
            const entityNameResult = await this.pool.request().query(`
              SELECT COUNT(*) AS entityExists 
              FROM SyncStatus 
              WHERE entity_name = 'batches'
            `);
            
            const entityNameExists = entityNameResult.recordset[0].entityExists > 0;
            
            if (entityNameExists) {
              // Entity with this name exists, update it
              await this.pool.request().query(`
                UPDATE SyncStatus 
                SET entity_type = 'batches', last_sync_date = '2020-01-01T00:00:00.000Z'
                WHERE entity_name = 'batches'
              `);
              console.log('Updated existing batches entity in SyncStatus');
            } else {
              // No entity exists, insert new one
              await this.pool.request().query(`
                INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
                VALUES ('batches', 'batches', '2020-01-01T00:00:00.000Z');
              `);
              console.log('Inserted new batches entity in SyncStatus');
            }
          }
        } else {
          // No entity_type column, check by entity_name only
          const entityResult = await this.pool.request().query(`
            SELECT COUNT(*) AS entityExists 
            FROM SyncStatus 
            WHERE entity_name = 'batches'
          `);
          
          const entityExists = entityResult.recordset[0].entityExists > 0;
          
          if (entityExists) {
            // Entity exists, update it
            await this.pool.request().query(`
              UPDATE SyncStatus 
              SET last_sync_date = '2020-01-01T00:00:00.000Z'
              WHERE entity_name = 'batches'
            `);
            console.log('Updated existing batches entity in SyncStatus');
          } else {
            // No entity exists, insert new one
            await this.pool.request().query(`
              INSERT INTO SyncStatus (entity_name, last_sync_date)
              VALUES ('batches', '2020-01-01T00:00:00.000Z');
            `);
            console.log('Inserted new batches entity in SyncStatus');
          }
        }
      }
      
      console.log('✅ Batches database schema initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing batches database schema:', error.message);
      throw error;
    }
  }

  /**
   * Reset the sync offset to start fresh
   * @returns {Promise<Object>} - Result of the reset operation
   */
  async resetSyncOffset() {
    try {
      console.log('Resetting batch sync offset...');
      
      // Ensure pool is initialized
      if (!this.pool) {
        console.log('Initializing pool for resetSyncOffset()...');
        this.pool = await this.initializePool();
      }
      
      // Reset the last_sync_date in SyncStatus table
      await this.pool.request().query(`
        UPDATE SyncStatus
        SET last_sync_date = '2020-01-01T00:00:00.000Z'
        WHERE entity_name = 'batches'
      `);
      
      console.log('Batch sync offset reset successfully');
      return {
        success: true,
        message: 'Batch sync offset reset successfully'
      };
    } catch (error) {
      console.error('Error resetting batch sync offset:', error.message);
      return {
        success: false,
        message: `Error resetting batch sync offset: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Get all batches from Picqer with pagination
   * @param {number} offset - Offset for pagination
   * @param {number} limit - Limit for pagination
   * @returns {Promise<Object>} - Batches data
   */
  async getAllBatches(offset = 0, limit = 100) {
    try {
      // FIXED: Changed from '/picklist/batches' to '/picklists/batches'
      const params = {
        offset: offset,
        limit: limit
      };
      
      const response = await this.apiClient.get('/picklists/batches', { params });
      return response.data;
    } catch (error) {
      console.error('Error getting batches:', error.message);
      throw error;
    }
  }

  /**
   * Get batch details from Picqer
   * @param {string} idpicklist_batch - Batch ID
   * @returns {Promise<Object>} - Batch details
   */
  async getBatchDetails(idpicklist_batch) {
    try {
      // FIXED: Changed from '/picklist/batches/' to '/picklists/batches/'
      const response = await this.apiClient.get(`/picklists/batches/${idpicklist_batch}`);
      return response.data;
    } catch (error) {
      console.error(`Error getting batch details for ${idpicklist_batch}:`, error.message);
      throw error;
    }
  }

  /**
   * Sync batches from Picqer to the database
   * @param {boolean} [fullSync=false] - Whether to perform a full sync
   * @returns {Promise<Object>} - Result of the sync operation
   */
  async syncBatches(fullSync = false) {
    try {
      console.log(`Starting ${fullSync ? 'full' : 'incremental'} batch sync...`);
      
      // Ensure pool is initialized
      if (!this.pool) {
        console.log('Initializing pool for syncBatches()...');
        this.pool = await this.initializePool();
      }
      
      // Get last sync date
      let lastSyncDate = null;
      if (!fullSync) {
        lastSyncDate = await this.getLastSyncDate();
        console.log(`Last batch sync date: ${lastSyncDate.toISOString()}`);
      }
      
      // Track sync progress
      const syncId = uuidv4();
      const startTime = new Date();
      let totalBatches = 0;
      let newBatches = 0;
      let uniqueBatches = new Set();
      
      // FIXED: Start with offset 0 and use a consistent increment
      let offset = 0;
      const limit = this.batchSize;
      let hasMore = true;
      
      // Create a transaction for batch inserts
      const transaction = new sql.Transaction(this.pool);
      await transaction.begin();
      
      try {
        while (hasMore) {
          console.log(`Fetching batches with offset ${offset}...`);
          
          // Get batches from Picqer
          const batchesData = await this.getAllBatches(offset, limit);
          
          // Check if we have more batches to fetch
          hasMore = batchesData.length === limit;
          
          // Process batches
          for (const batch of batchesData) {
            // Skip if we've already processed this batch in this sync
            if (uniqueBatches.has(batch.idpicklist_batch)) {
              continue;
            }
            
            // Add to unique batches set
            uniqueBatches.add(batch.idpicklist_batch);
            totalBatches++;
            
            // Check if batch is newer than last sync date
            const batchDate = new Date(batch.created);
            if (!fullSync && batchDate <= lastSyncDate) {
              continue;
            }
            
            // Get batch details
            const batchDetails = await this.getBatchDetails(batch.idpicklist_batch);
            
            // Insert or update batch in database
            await transaction.request()
              .input('idpicklist_batch', sql.NVarChar, batch.idpicklist_batch)
              .input('idpicklist', sql.NVarChar, batch.idpicklist)
              .input('idcustomer', sql.NVarChar, batch.idcustomer || null)
              .input('iduser', sql.NVarChar, batch.iduser || null)
              .input('idwarehouse', sql.NVarChar, batch.idwarehouse || null)
              .input('created', sql.DateTime, new Date(batch.created))
              .input('finished', sql.DateTime, batch.finished ? new Date(batch.finished) : null)
              .input('status', sql.NVarChar, batch.status)
              .input('last_sync_date', sql.DateTime, new Date())
              .query(`
                MERGE INTO Batches AS target
                USING (SELECT @idpicklist_batch AS idpicklist_batch) AS source
                ON target.idpicklist_batch = source.idpicklist_batch
                WHEN MATCHED THEN
                  UPDATE SET
                    idpicklist = @idpicklist,
                    idcustomer = @idcustomer,
                    iduser = @iduser,
                    idwarehouse = @idwarehouse,
                    created = @created,
                    finished = @finished,
                    status = @status,
                    last_sync_date = @last_sync_date
                WHEN NOT MATCHED THEN
                  INSERT (
                    idpicklist_batch,
                    idpicklist,
                    idcustomer,
                    iduser,
                    idwarehouse,
                    created,
                    finished,
                    status,
                    last_sync_date
                  )
                  VALUES (
                    @idpicklist_batch,
                    @idpicklist,
                    @idcustomer,
                    @iduser,
                    @idwarehouse,
                    @created,
                    @finished,
                    @status,
                    @last_sync_date
                  );
              `);
            
            newBatches++;
          }
          
          // FIXED: Consistently increment offset by the limit
          offset += limit;
          
          console.log(`Retrieved ${batchesData.length} batches (total unique: ${uniqueBatches.size})`);
          
          // Break if we have no more batches
          if (batchesData.length === 0) {
            hasMore = false;
          }
        }
        
        // Commit transaction
        await transaction.commit();
        
        // Update last sync date
        await this.pool.request()
          .input('last_sync_date', sql.DateTime, new Date())
          .query(`
            UPDATE SyncStatus
            SET last_sync_date = @last_sync_date
            WHERE entity_name = 'batches'
          `);
        
        const endTime = new Date();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`Batch sync completed in ${duration} seconds`);
        console.log(`Total batches processed: ${totalBatches}`);
        console.log(`New batches added/updated: ${newBatches}`);
        
        return {
          success: true,
          syncId,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          duration,
          totalBatches,
          newBatches
        };
      } catch (error) {
        // Rollback transaction on error
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      console.error('Error syncing batches:', error.message);
      return {
        success: false,
        message: `Error syncing batches: ${error.message}`,
        error: error.message
      };
    }
  }
}

module.exports = BatchService;
