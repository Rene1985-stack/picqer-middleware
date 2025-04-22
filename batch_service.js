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
        
        const response = await this.apiClient.get('/picklist/batches', { params });
        
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
      
      const response = await this.apiClient.get(`/picklist/batches/${idpicklist_batch}`);
      
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
            // Get detailed batch info if needed
            let batchDetails = batch;
            
            // If batch doesn't have all required fields, fetch details
            if (!batch.total_products || !batch.total_picklists) {
              batchDetails = await this.getBatchDetails(batch.idpicklist_batch);
              
              // If details fetch failed, use original batch object
              if (!batchDetails) {
                batchDetails = batch;
              }
            }
            
            // Save batch to database
            const success = await this.saveBatch(batchDetails);
            
            if (success) {
              successCount++;
            }
          } catch (batchError) {
            console.error(`Error processing batch ${batch.idpicklist_batch}:`, batchError.message);
            // Continue with next batch
          }
        }
        
        console.log(`Chunk ${Math.floor(i / batchSize) + 1}/${Math.ceil(batches.length / batchSize)} completed. ${successCount}/${i + chunk.length} batches saved successfully.`);
      }
      
      // Update SyncStatus table
      try {
        const pool = await this.initializePool();
        
        await pool.request()
          .input('entityName', sql.NVarChar, 'batches')
          .input('entityType', sql.NVarChar, 'batches')
          .input('lastSyncDate', sql.DateTime, new Date())
          .input('lastSyncCount', sql.Int, successCount)
          .input('totalCount', sql.Int, await this.getBatchCount())
          .query(`
            UPDATE SyncStatus
            SET last_sync_date = @lastSyncDate,
                last_sync_count = @lastSyncCount,
                total_count = @totalCount
            WHERE entity_name = @entityName OR entity_type = @entityType
            
            IF @@ROWCOUNT = 0
            BEGIN
                INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date, last_sync_count, total_count)
                VALUES (@entityName, @entityType, @lastSyncDate, @lastSyncCount, @totalCount)
            END
          `);
      } catch (syncStatusError) {
        console.error('Error updating SyncStatus:', syncStatusError.message);
      }
      
      console.log(`✅ Saved ${successCount}/${batches.length} batches to database`);
      return successCount;
    } catch (error) {
      console.error('Error saving batches to database:', error.message);
      throw error;
    }
  }

  /**
   * Get batch count from database
   * @returns {Promise<number>} - Number of batches in database
   */
  async getBatchCount() {
    try {
      const pool = await this.initializePool();
      
      const result = await pool.request().query('SELECT COUNT(*) AS count FROM Batches');
      
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting batch count:', error.message);
      return 0;
    }
  }

  /**
   * Get last sync date for batches
   * @returns {Promise<Date|null>} - Last sync date or null if never synced
   */
  async getLastBatchSyncDate() {
    try {
      const pool = await this.initializePool();
      
      const result = await pool.request()
        .query(`
          SELECT last_sync_date 
          FROM SyncStatus 
          WHERE entity_name = 'batches' OR entity_type = 'batches'
        `);
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      return null;
    } catch (error) {
      console.error('Error getting last batch sync date:', error.message);
      return null;
    }
  }

  /**
   * Sync batches from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Sync result
   */
  async syncBatches(fullSync = false) {
    try {
      console.log(`Starting ${fullSync ? 'full' : 'incremental'} batch sync...`);
      
      let batches = [];
      
      if (fullSync) {
        // Full sync: Get all batches
        batches = await this.getAllBatches();
      } else {
        // Incremental sync: Get batches updated since last sync
        const lastSyncDate = await this.getLastBatchSyncDate();
        batches = await this.getBatchesUpdatedSince(lastSyncDate);
      }
      
      // Save batches to database
      const savedCount = await this.saveBatches(batches);
      
      return {
        success: true,
        message: `Successfully synced ${savedCount} batches`,
        syncedCount: savedCount,
        totalCount: batches.length
      };
    } catch (error) {
      console.error('Error syncing batches:', error.message);
      
      return {
        success: false,
        message: `Error syncing batches: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Get batch productivity metrics
   * @param {Date|null} startDate - Start date for metrics calculation
   * @param {Date|null} endDate - End date for metrics calculation
   * @returns {Promise<Object>} - Productivity metrics
   */
  async getBatchProductivityMetrics(startDate = null, endDate = null) {
    try {
      const pool = await this.initializePool();
      
      // Default to last 30 days if no dates provided
      if (!startDate) {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
      }
      
      if (!endDate) {
        endDate = new Date();
      }
      
      // Format dates for SQL query
      const startDateStr = startDate.toISOString();
      const endDateStr = endDate.toISOString();
      
      // Get completed batches in date range
      const completedBatchesResult = await pool.request()
        .input('startDate', sql.DateTime, startDateStr)
        .input('endDate', sql.DateTime, endDateStr)
        .query(`
          SELECT 
            COUNT(*) AS total_completed,
            SUM(total_products) AS total_products,
            SUM(total_picklists) AS total_picklists,
            AVG(
              CASE 
                WHEN completed_at IS NOT NULL AND created_at IS NOT NULL 
                THEN DATEDIFF(MINUTE, created_at, completed_at) 
                ELSE NULL 
              END
            ) AS avg_completion_time_minutes
          FROM Batches
          WHERE 
            status = 'completed' 
            AND completed_at >= @startDate 
            AND completed_at <= @endDate
        `);
      
      // Get batches by user
      const batchesByUserResult = await pool.request()
        .input('startDate', sql.DateTime, startDateStr)
        .input('endDate', sql.DateTime, endDateStr)
        .query(`
          SELECT 
            completed_by_name,
            COUNT(*) AS batches_completed,
            SUM(total_products) AS products_processed,
            SUM(total_picklists) AS picklists_processed,
            AVG(
              CASE 
                WHEN completed_at IS NOT NULL AND created_at IS NOT NULL 
                THEN DATEDIFF(MINUTE, created_at, completed_at) 
                ELSE NULL 
              END
            ) AS avg_completion_time_minutes
          FROM Batches
          WHERE 
            status = 'completed' 
            AND completed_at >= @startDate 
            AND completed_at <= @endDate
            AND completed_by_name IS NOT NULL
          GROUP BY completed_by_name
          ORDER BY batches_completed DESC
        `);
      
      // Get batches by day
      const batchesByDayResult = await pool.request()
        .input('startDate', sql.DateTime, startDateStr)
        .input('endDate', sql.DateTime, endDateStr)
        .query(`
          SELECT 
            CONVERT(date, completed_at) AS completion_date,
            COUNT(*) AS batches_completed,
            SUM(total_products) AS products_processed,
            SUM(total_picklists) AS picklists_processed
          FROM Batches
          WHERE 
            status = 'completed' 
            AND completed_at >= @startDate 
            AND completed_at <= @endDate
          GROUP BY CONVERT(date, completed_at)
          ORDER BY completion_date
        `);
      
      // Get batches by type
      const batchesByTypeResult = await pool.request()
        .input('startDate', sql.DateTime, startDateStr)
        .input('endDate', sql.DateTime, endDateStr)
        .query(`
          SELECT 
            type,
            COUNT(*) AS batch_count,
            SUM(total_products) AS products_processed,
            SUM(total_picklists) AS picklists_processed
          FROM Batches
          WHERE 
            completed_at >= @startDate 
            AND completed_at <= @endDate
          GROUP BY type
          ORDER BY batch_count DESC
        `);
      
      // Get current active batches
      const activeBatchesResult = await pool.request()
        .query(`
          SELECT 
            COUNT(*) AS active_count,
            SUM(total_products) AS active_products,
            SUM(total_picklists) AS active_picklists
          FROM Batches
          WHERE status = 'active'
        `);
      
      // Compile metrics
      const metrics = {
        date_range: {
          start_date: startDate,
          end_date: endDate
        },
        summary: {
          total_completed: completedBatchesResult.recordset[0].total_completed || 0,
          total_products: completedBatchesResult.recordset[0].total_products || 0,
          total_picklists: completedBatchesResult.recordset[0].total_picklists || 0,
          avg_completion_time_minutes: completedBatchesResult.recordset[0].avg_completion_time_minutes || 0,
          active_batches: activeBatchesResult.recordset[0].active_count || 0,
          active_products: activeBatchesResult.recordset[0].active_products || 0,
          active_picklists: activeBatchesResult.recordset[0].active_picklists || 0
        },
        by_user: batchesByUserResult.recordset,
        by_day: batchesByDayResult.recordset,
        by_type: batchesByTypeResult.recordset
      };
      
      return metrics;
    } catch (error) {
      console.error('Error getting batch productivity metrics:', error.message);
      
      // Return empty metrics on error
      return {
        date_range: {
          start_date: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end_date: endDate || new Date()
        },
        summary: {
          total_completed: 0,
          total_products: 0,
          total_picklists: 0,
          avg_completion_time_minutes: 0,
          active_batches: 0,
          active_products: 0,
          active_picklists: 0
        },
        by_user: [],
        by_day: [],
        by_type: []
      };
    }
  }

  /**
   * Get batch productivity trends
   * @param {number} days - Number of days to include in trends
   * @returns {Promise<Object>} - Productivity trends
   */
  async getBatchProductivityTrends(days = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const metrics = await this.getBatchProductivityMetrics(startDate, endDate);
      
      // Calculate daily averages
      const dailyData = metrics.by_day;
      
      // Fill in missing days with zeros
      const filledDailyData = [];
      const currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const existingDay = dailyData.find(d => {
          const dayDate = new Date(d.completion_date);
          return dayDate.toISOString().split('T')[0] === dateStr;
        });
        
        if (existingDay) {
          filledDailyData.push(existingDay);
        } else {
          filledDailyData.push({
            completion_date: new Date(currentDate),
            batches_completed: 0,
            products_processed: 0,
            picklists_processed: 0
          });
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Calculate 7-day moving averages
      const movingAverages = [];
      
      for (let i = 6; i < filledDailyData.length; i++) {
        const window = filledDailyData.slice(i - 6, i + 1);
        const sum = window.reduce(
          (acc, day) => {
            return {
              batches: acc.batches + (day.batches_completed || 0),
              products: acc.products + (day.products_processed || 0),
              picklists: acc.picklists + (day.picklists_processed || 0)
            };
          },
          { batches: 0, products: 0, picklists: 0 }
        );
        
        movingAverages.push({
          date: new Date(filledDailyData[i].completion_date),
          batches_avg: sum.batches / 7,
          products_avg: sum.products / 7,
          picklists_avg: sum.picklists / 7
        });
      }
      
      // Calculate user productivity rankings
      const userRankings = [...metrics.by_user]
        .sort((a, b) => (b.products_processed || 0) - (a.products_processed || 0))
        .map((user, index) => ({
          ...user,
          rank: index + 1,
          products_per_batch: user.batches_completed ? user.products_processed / user.batches_completed : 0
        }));
      
      // Return trends
      return {
        date_range: metrics.date_range,
        summary: metrics.summary,
        daily_data: filledDailyData,
        moving_averages: movingAverages,
        user_rankings: userRankings,
        by_type: metrics.by_type
      };
    } catch (error) {
      console.error('Error getting batch productivity trends:', error.message);
      
      // Return empty trends on error
      return {
        date_range: {
          start_date: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
          end_date: new Date()
        },
        summary: {
          total_completed: 0,
          total_products: 0,
          total_picklists: 0,
          avg_completion_time_minutes: 0,
          active_batches: 0,
          active_products: 0,
          active_picklists: 0
        },
        daily_data: [],
        moving_averages: [],
        user_rankings: [],
        by_type: []
      };
    }
  }
}

module.exports = BatchService;
