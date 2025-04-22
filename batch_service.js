/**
 * Enhanced Batch Service with Rate Limiting and Sync Methods
 * 
 * This service handles batch data synchronization between Picqer and the database.
 * It includes:
 * 1. Rate limiting to prevent "Rate limit exceeded" errors
 * 2. Complete sync methods for the dashboard
 * 3. Proper error handling and logging
 * 4. Performance optimizations for efficient data processing
 */
const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');
const PicqerApiClient = require('./picqer-api-client');

class BatchService {
  /**
   * Initialize the BatchService
   * @param {string} apiKey - Picqer API key
   * @param {string} baseUrl - Picqer API base URL
   * @param {Object} dbConfig - Database configuration
   */
  constructor(apiKey, baseUrl, dbConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.dbConfig = dbConfig;
    this.pool = null;
    
    // Initialize API client with rate limiting
    this.apiClient = new PicqerApiClient(apiKey, baseUrl, {
      requestsPerMinute: 30, // Adjust based on your Picqer plan
      maxRetries: 5,
      waitOnRateLimit: true,
      sleepTimeOnRateLimitHitInMs: 20000 // 20 seconds, like Picqer's default
    });
    
    console.log('BatchService initialized with rate-limited Picqer API client');
  }

  /**
   * Initialize the database connection pool
   * @returns {Promise<sql.ConnectionPool>} - SQL connection pool
   */
  async initializePool() {
    if (!this.pool) {
      try {
        this.pool = await new sql.ConnectionPool(this.dbConfig).connect();
        console.log('BatchService database connection pool initialized');
      } catch (error) {
        console.error('Error initializing BatchService database connection pool:', error.message);
        throw error;
      }
    }
    return this.pool;
  }

  /**
   * Initialize the batches database schema
   * @returns {Promise<void>}
   */
  async initializeBatchesDatabase() {
    try {
      console.log('Initializing batches database schema...');
      
      // Initialize pool if not already initialized
      await this.initializePool();
      
      // Create Batches table if it doesn't exist
      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Batches')
        BEGIN
          CREATE TABLE Batches (
            id INT IDENTITY(1,1) PRIMARY KEY,
            idpicklist_batch INT,
            picklist_batchid NVARCHAR(255),
            idwarehouse INT,
            type NVARCHAR(50),
            status NVARCHAR(50),
            assigned_to_iduser INT,
            assigned_to_name NVARCHAR(255),
            completed_by_iduser INT,
            completed_by_name NVARCHAR(255),
            total_products INT,
            total_picklists INT,
            completed_at DATETIME,
            created_at DATETIME,
            updated_at DATETIME,
            last_sync_date DATETIME
          )
        END
      `);
      
      // Add columns if they don't exist
      const columns = [
        { name: 'idpicklist_batch', type: 'INT' },
        { name: 'picklist_batchid', type: 'NVARCHAR(255)' },
        { name: 'idwarehouse', type: 'INT' },
        { name: 'type', type: 'NVARCHAR(50)' },
        { name: 'status', type: 'NVARCHAR(50)' },
        { name: 'assigned_to_iduser', type: 'INT' },
        { name: 'assigned_to_name', type: 'NVARCHAR(255)' },
        { name: 'completed_by_iduser', type: 'INT' },
        { name: 'completed_by_name', type: 'NVARCHAR(255)' },
        { name: 'total_products', type: 'INT' },
        { name: 'total_picklists', type: 'INT' },
        { name: 'completed_at', type: 'DATETIME' },
        { name: 'created_at', type: 'DATETIME' },
        { name: 'updated_at', type: 'DATETIME' },
        { name: 'last_sync_date', type: 'DATETIME' }
      ];
      
      for (const column of columns) {
        try {
          const columnExists = await this.pool.request().query(`
            SELECT COUNT(*) AS count
            FROM sys.columns
            WHERE Name = '${column.name}'
            AND Object_ID = Object_ID('Batches')
          `);
          
          if (columnExists.recordset[0].count === 0) {
            console.log(`Adding column ${column.name} to table Batches...`);
            await this.pool.request().query(`
              ALTER TABLE Batches
              ADD ${column.name} ${column.type}
            `);
            console.log(`Column ${column.name} added to table Batches successfully.`);
          } else {
            console.log(`Column ${column.name} already exists in table Batches.`);
          }
        } catch (error) {
          console.error(`Error adding column ${column.name} to Batches table:`, error.message);
        }
      }
      
      // Add idpicklist_batch column to Picklists table if it doesn't exist
      try {
        const columnExists = await this.pool.request().query(`
          SELECT COUNT(*) AS count
          FROM sys.columns
          WHERE Name = 'idpicklist_batch'
          AND Object_ID = Object_ID('Picklists')
        `);
        
        if (columnExists.recordset[0].count === 0) {
          console.log('Adding column idpicklist_batch to table Picklists...');
          await this.pool.request().query(`
            ALTER TABLE Picklists
            ADD idpicklist_batch INT
          `);
          console.log('Column idpicklist_batch added to table Picklists successfully.');
        } else {
          console.log('Column idpicklist_batch already exists in table Picklists.');
        }
      } catch (error) {
        console.error('Error adding column idpicklist_batch to Picklists table:', error.message);
      }
      
      // Update SyncStatus table to include batches entity
      try {
        // Check if SyncStatus table exists
        const tableExists = await this.pool.request().query(`
          SELECT COUNT(*) AS count
          FROM sys.tables
          WHERE name = 'SyncStatus'
        `);
        
        if (tableExists.recordset[0].count === 0) {
          // Create SyncStatus table if it doesn't exist
          await this.pool.request().query(`
            CREATE TABLE SyncStatus (
              id INT IDENTITY(1,1) PRIMARY KEY,
              entity_name NVARCHAR(50) NOT NULL,
              entity_type NVARCHAR(50) NOT NULL,
              last_sync_date DATETIME NULL,
              last_sync_count INT NULL,
              total_count INT NULL
            )
          `);
          console.log('Created SyncStatus table');
        }
        
        const entityExists = await this.pool.request().query(`
          SELECT COUNT(*) AS count
          FROM SyncStatus
          WHERE entity_name = 'batches'
        `);
        
        if (entityExists.recordset[0].count === 0) {
          await this.pool.request().query(`
            INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date, last_sync_count, total_count)
            VALUES ('batches', 'batches', GETDATE(), 0, 0)
          `);
          console.log('Added batches entity to SyncStatus');
        } else {
          await this.pool.request().query(`
            UPDATE SyncStatus
            SET entity_type = 'batches'
            WHERE entity_name = 'batches'
          `);
          console.log('Updated existing batches entity in SyncStatus');
        }
      } catch (error) {
        console.error('Error updating SyncStatus table:', error.message);
      }
      
      console.log('Batches database schema initialized successfully');
    } catch (error) {
      console.error('Error initializing batches database schema:', error.message);
      throw error;
    }
  }

  /**
   * Get all batches from Picqer API with pagination
   * @param {Date|null} updatedSince - Only get batches updated since this date
   * @returns {Promise<Array>} - Array of batches
   */
  async getAllBatches(updatedSince = null) {
    try {
      const limit = 100; // Number of batches per page
      let offset = 0;
      let hasMoreBatches = true;
      let allBatches = [];
      
      // Format date for API request if provided
      let updatedSinceParam = null;
      if (updatedSince) {
        updatedSinceParam = updatedSince.toISOString();
        console.log(`Fetching batches updated since: ${updatedSinceParam}`);
      } else {
        console.log('Fetching all batches from Picqer...');
      }
      
      // Continue fetching until we have all batches
      while (hasMoreBatches) {
        console.log(`Fetching batches with offset ${offset}...`);
        
        // Build request parameters
        const params = { 
          offset,
          limit
        };
        
        // Add updated_since parameter if provided
        if (updatedSinceParam) {
          params.updated_since = updatedSinceParam;
        }
        
        // FIXED: Using the correct endpoint with plural "picklists" instead of singular "picklist"
        // Note: Since baseUrl already includes /api/v1, we don't include it in the path
        const response = await this.apiClient.get('/picklists/batches', { params });
        
        if (response && Array.isArray(response) && response.length > 0) {
          // Filter out duplicates by idpicklist_batch
          const existingIds = new Set(allBatches.map(b => b.idpicklist_batch));
          const newBatches = response.filter(batch => {
            return !existingIds.has(batch.idpicklist_batch);
          });
          
          allBatches = [...allBatches, ...newBatches];
          console.log(`Retrieved ${newBatches.length} new batches (total unique: ${allBatches.length})`);
          
          // Check if we have more batches
          hasMoreBatches = response.length === limit;
          
          // Increment offset for next page
          offset += limit;
        } else {
          hasMoreBatches = false;
        }
      }
      
      // Sort batches by updated_at in descending order (newest first)
      allBatches.sort((a, b) => {
        const dateA = a.updated_at ? new Date(a.updated_at) : new Date(0);
        const dateB = b.updated_at ? new Date(b.updated_at) : new Date(0);
        return dateB - dateA; // Descending order (newest first)
      });
      
      console.log('Sorted batches with most recently updated first for priority processing');
      console.log(`✅ Retrieved ${allBatches.length} unique batches from Picqer`);
      
      return allBatches;
    } catch (error) {
      console.error('Error fetching batches from Picqer:', error.message);
      throw error;
    }
  }

  /**
   * Get batch details from Picqer API
   * @param {number} idpicklist_batch - Batch ID
   * @returns {Promise<Object>} - Batch details
   */
  async getBatchDetails(idpicklist_batch) {
    try {
      console.log(`Fetching details for batch ${idpicklist_batch}...`);
      
      // FIXED: Using the correct endpoint with plural "picklists" instead of singular "picklist"
      // Note: Since baseUrl already includes /api/v1, we don't include it in the path
      const response = await this.apiClient.get(`/picklists/batches/${idpicklist_batch}`);
      
      if (response) {
        console.log(`Retrieved details for batch ${idpicklist_batch}`);
        return response;
      }
      
      return null;
    } catch (error) {
      console.error(`Error fetching details for batch ${idpicklist_batch}:`, error.message);
      return null;
    }
  }

  /**
   * Get batches updated since a specific date
   * For incremental syncs, use a 30-day rolling window
   * @param {Date} date - The date to check updates from
   * @returns {Promise<Array>} - Array of updated batches
   */
  async getBatchesUpdatedSince(date) {
    // For incremental syncs, use a 30-day rolling window
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Use the more recent date between the provided date and 30 days ago
    const syncDate = date && date > thirtyDaysAgo ? date : thirtyDaysAgo;
    
    console.log(`Using sync date: ${syncDate.toISOString()}`);
    return this.getAllBatches(syncDate);
  }

  /**
   * Save batch to database
   * @param {Object} batch - Batch object from Picqer API
   * @returns {Promise<boolean>} - Success status
   */
  async saveBatch(batch) {
    try {
      const pool = await this.initializePool();
      
      // Check if batch already exists
      const existingResult = await pool.request()
        .input('idpicklist_batch', sql.Int, batch.idpicklist_batch)
        .query('SELECT id FROM Batches WHERE idpicklist_batch = @idpicklist_batch');
      
      const exists = existingResult.recordset.length > 0;
      
      // Prepare common parameters
      const request = new sql.Request(pool);
      request.input('idpicklist_batch', sql.Int, batch.idpicklist_batch);
      request.input('picklist_batchid', sql.NVarChar, batch.picklist_batchid || '');
      request.input('idwarehouse', sql.Int, batch.idwarehouse || null);
      request.input('type', sql.NVarChar, batch.type || '');
      request.input('status', sql.NVarChar, batch.status || '');
      request.input('assigned_to_iduser', sql.Int, batch.assigned_to_iduser || null);
      request.input('assigned_to_name', sql.NVarChar, batch.assigned_to_name || '');
      request.input('completed_by_iduser', sql.Int, batch.completed_by_iduser || null);
      request.input('completed_by_name', sql.NVarChar, batch.completed_by_name || '');
      request.input('total_products', sql.Int, batch.total_products || 0);
      request.input('total_picklists', sql.Int, batch.total_picklists || 0);
      request.input('completed_at', sql.DateTime, batch.completed_at ? new Date(batch.completed_at) : null);
      request.input('created_at', sql.DateTime, batch.created_at ? new Date(batch.created_at) : null);
      request.input('updated_at', sql.DateTime, batch.updated_at ? new Date(batch.updated_at) : null);
      request.input('last_sync_date', sql.DateTime, new Date());
      
      if (exists) {
        // Update existing batch
        await request.query(`
          UPDATE Batches
          SET picklist_batchid = @picklist_batchid,
              idwarehouse = @idwarehouse,
              type = @type,
              status = @status,
              assigned_to_iduser = @assigned_to_iduser,
              assigned_to_name = @assigned_to_name,
              completed_by_iduser = @completed_by_iduser,
              completed_by_name = @completed_by_name,
              total_products = @total_products,
              total_picklists = @total_picklists,
              completed_at = @completed_at,
              created_at = @created_at,
              updated_at = @updated_at,
              last_sync_date = @last_sync_date
          WHERE idpicklist_batch = @idpicklist_batch
        `);
      } else {
        // Insert new batch
        await request.query(`
          INSERT INTO Batches (
            idpicklist_batch, picklist_batchid, idwarehouse, type, status,
            assigned_to_iduser, assigned_to_name, completed_by_iduser, completed_by_name,
            total_products, total_picklists, completed_at, created_at, updated_at, last_sync_date
          )
          VALUES (
            @idpicklist_batch, @picklist_batchid, @idwarehouse, @type, @status,
            @assigned_to_iduser, @assigned_to_name, @completed_by_iduser, @completed_by_name,
            @total_products, @total_picklists, @completed_at, @created_at, @updated_at, @last_sync_date
          )
        `);
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving batch ${batch.idpicklist_batch}:`, error.message);
      return false;
    }
  }

  /**
   * Save multiple batches to database
   * @param {Array} batches - Array of batch objects from Picqer API
   * @returns {Promise<number>} - Number of successfully saved batches
   */
  async saveBatches(batches) {
    try {
      console.log(`Saving ${batches.length} batches to database...`);
      
      let successCount = 0;
      const batchSize = 50; // Process in smaller batches to avoid overwhelming the database
      
      // Process batches in smaller chunks
      for (let i = 0; i < batches.length; i += batchSize) {
        const chunk = batches.slice(i, i + batchSize);
        console.log(`Processing chunk ${Math.floor(i / batchSize) + 1}/${Math.ceil(batches.length / batchSize)} (${chunk.length} batches)...`);
        
        // Process each batch in the chunk
        for (const batch of chunk) {
          try {
            const success = await this.saveBatch(batch);
            if (success) {
              successCount++;
            }
          } catch (error) {
            console.error(`Error saving batch ${batch.idpicklist_batch}:`, error.message);
          }
        }
        
        console.log(`Processed ${successCount} batches so far...`);
      }
      
      console.log(`✅ Saved ${successCount} batches to database`);
      return successCount;
    } catch (error) {
      console.error('Error saving batches to database:', error.message);
      throw error;
    }
  }

  /**
   * Update last sync date for batches
   * @param {Date} syncDate - Sync date to save
   * @param {number} count - Number of batches synced
   * @returns {Promise<boolean>} - Success status
   */
  async updateLastSyncDate(syncDate, count) {
    try {
      const pool = await this.initializePool();
      
      // Update SyncStatus table
      await pool.request()
        .input('syncDate', sql.DateTime, syncDate)
        .input('count', sql.Int, count)
        .query(`
          UPDATE SyncStatus
          SET last_sync_date = @syncDate,
              last_sync_count = @count,
              total_count = (SELECT COUNT(*) FROM Batches)
          WHERE entity_name = 'batches'
        `);
      
      console.log(`Updated last sync date for batches to ${syncDate.toISOString()}`);
      return true;
    } catch (error) {
      console.error('Error updating last sync date for batches:', error.message);
      return false;
    }
  }

  /**
   * Get the last sync date for batches
   * @returns {Promise<Date|null>} - Last sync date or null if not found
   */
  async getLastSyncDate() {
    try {
      const pool = await this.initializePool();
      
      // Get last sync date from SyncStatus table
      const result = await pool.request().query(`
        SELECT last_sync_date
        FROM SyncStatus
        WHERE entity_name = 'batches'
      `);
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      // If no record found, return a date 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return thirtyDaysAgo;
    } catch (error) {
      console.error('Error getting last sync date for batches:', error.message);
      
      // If error, return a date 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return thirtyDaysAgo;
    }
  }

  /**
   * Get the count of batches in the database
   * @returns {Promise<number>} - Count of batches
   */
  async getBatchCount() {
    try {
      const pool = await this.initializePool();
      
      // Get count from Batches table
      const result = await pool.request().query(`
        SELECT COUNT(*) AS count
        FROM Batches
      `);
      
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting batch count:', error.message);
      return 0;
    }
  }

  /**
   * Sync batches from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Sync result with counts
   */
  async syncBatches(fullSync = false) {
    try {
      console.log(`Starting ${fullSync ? 'full' : 'incremental'} batch sync...`);
      
      // Initialize database if needed
      await this.initializeBatchesDatabase();
      
      let batches = [];
      
      if (fullSync) {
        // Full sync - get all batches
        batches = await this.getAllBatches();
      } else {
        // Incremental sync - get batches updated since last sync
        const lastSyncDate = await this.getLastSyncDate();
        console.log(`Last batch sync date: ${lastSyncDate.toISOString()}`);
        batches = await this.getBatchesUpdatedSince(lastSyncDate);
      }
      
      console.log(`Retrieved ${batches.length} batches from Picqer`);
      
      // Save batches to database
      const savedCount = await this.saveBatches(batches);
      
      // Update last sync date
      await this.updateLastSyncDate(new Date(), savedCount);
      
      // Get total count
      const totalCount = await this.getBatchCount();
      
      console.log(`✅ Batch sync completed: ${savedCount} batches synced, ${totalCount} total batches in database`);
      
      return {
        success: true,
        syncedCount: savedCount,
        totalCount: totalCount
      };
    } catch (error) {
      console.error('Error syncing batches:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = BatchService;
