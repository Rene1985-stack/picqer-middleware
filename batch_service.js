/**
 * Enhanced Batch service for Picqer middleware with days parameter support
 * Handles synchronization of picklist batches between Picqer and SQL database
 * Based on the Picqer API documentation: https://picqer.com/en/api/picklists/batches
 */
const axios = require('axios');
const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');
const batchesSchema = require('./fixed_batches_schema');
const syncProgressSchema = require('./sync_progress_schema');

class BatchService {
  constructor(apiKey, baseUrl, sqlConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.sqlConfig = sqlConfig;
    this.batchSize = 100; // Use larger batch size for better performance
    
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
   * Get batch count from database
   * @returns {Promise<number>} - Number of batches in database
   */
  async getBatchCountFromDatabase() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query('SELECT COUNT(*) as count FROM Batches');
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting batch count from database:', error.message);
      return 0;
    }
  }

  /**
   * Get last sync date for batches
   * @returns {Promise<Date|null>} - Last sync date or null if never synced
   */
  async getLastSyncDate() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query(`
        SELECT last_sync_date 
        FROM SyncStatus 
        WHERE entity_type = 'batches'
      `);
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      return null;
    } catch (error) {
      console.error('Error getting last sync date for batches:', error.message);
      return null;
    }
  }

  /**
   * Initialize the database with batches schema and sync progress tracking
   * @returns {Promise<boolean>} - Success status
   */
  async initializeBatchesDatabase() {
    try {
      console.log('Initializing database with batches schema...');
      const pool = await sql.connect(this.sqlConfig);
      
      // Create Batches table
      await pool.request().query(batchesSchema.createBatchesTableSQL);
      
      // Create BatchProducts table
      await pool.request().query(batchesSchema.createBatchProductsTableSQL);
      
      // Create BatchPicklists table
      await pool.request().query(batchesSchema.createBatchPicklistsTableSQL);
      
      // Create SyncProgress table for resumable sync if it doesn't exist
      await pool.request().query(syncProgressSchema.createSyncProgressTableSQL);
      console.log('✅ Created/verified SyncProgress table for resumable sync functionality');
      
      // Check if SyncStatus table exists
      const tableResult = await pool.request().query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'SyncStatus'
      `);
      
      const syncTableExists = tableResult.recordset[0].tableExists > 0;
      
      if (syncTableExists) {
        // Check if entity_type column exists in SyncStatus
        const columnResult = await pool.request().query(`
          SELECT COUNT(*) AS columnExists 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'SyncStatus' AND COLUMN_NAME = 'entity_type'
        `);
        
        const entityTypeColumnExists = columnResult.recordset[0].columnExists > 0;
        
        if (entityTypeColumnExists) {
          // Check if batches record exists
          const recordResult = await pool.request().query(`
            SELECT COUNT(*) AS recordExists 
            FROM SyncStatus 
            WHERE entity_type = 'batches'
          `);
          
          const batchesRecordExists = recordResult.recordset[0].recordExists > 0;
          
          if (batchesRecordExists) {
            // Update existing record
            await pool.request().query(`
              UPDATE SyncStatus 
              SET entity_name = 'batches' 
              WHERE entity_type = 'batches'
            `);
            console.log('Updated existing batches entity in SyncStatus');
          } else {
            // Insert new record
            await pool.request().query(`
              INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
              VALUES ('batches', 'batches', '2025-01-01T00:00:00.000Z')
            `);
            console.log('Added batches record to SyncStatus table');
          }
        } else {
          console.warn('entity_type column does not exist in SyncStatus table');
        }
      } else {
        console.warn('SyncStatus table does not exist');
      }
      
      console.log('✅ Batches database schema initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing batches database schema:', error.message);
      throw error;
    }
  }

  /**
   * Create or get sync progress record
   * @param {string} entityType - Entity type (e.g., 'batches')
   * @param {boolean} isFullSync - Whether this is a full sync
   * @returns {Promise<Object>} - Sync progress record
   */
  async createOrGetSyncProgress(entityType = 'batches', isFullSync = false) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check for existing in-progress sync
      const inProgressResult = await pool.request()
        .input('entityType', sql.NVarChar, entityType)
        .query(`
          SELECT * FROM SyncProgress 
          WHERE entity_type = @entityType AND status = 'in_progress'
          ORDER BY started_at DESC
        `);
      
      if (inProgressResult.recordset.length > 0) {
        console.log(`Found in-progress sync for ${entityType}, will resume from last position`);
        return inProgressResult.recordset[0];
      }
      
      // No in-progress sync found, create a new one
      const syncId = uuidv4();
      const now = new Date().toISOString();
      
      const result = await pool.request()
        .input('entityType', sql.NVarChar, entityType)
        .input('syncId', sql.NVarChar, syncId)
        .input('isFullSync', sql.Bit, isFullSync ? 1 : 0)
        .input('now', sql.DateTime, now)
        .query(`
          INSERT INTO SyncProgress (
            entity_type, sync_id, current_offset, batch_number,
            items_processed, status, started_at, last_updated
          )
          VALUES (
            @entityType, @syncId, 0, 0, 
            0, 'in_progress', @now, @now
          );
          
          SELECT * FROM SyncProgress WHERE entity_type = @entityType AND sync_id = @syncId
        `);
      
      console.log(`Created new sync progress record for ${entityType} with ID ${syncId}`);
      return result.recordset[0];
    } catch (error) {
      console.error('Error creating or getting sync progress:', error.message);
      // Return a default progress object if database operation fails
      return {
        entity_type: entityType,
        sync_id: uuidv4(),
        current_offset: 0,
        batch_number: 0,
        items_processed: 0,
        status: 'in_progress',
        started_at: new Date().toISOString(),
        last_updated: new Date().toISOString()
      };
    }
  }

  /**
   * Update sync progress
   * @param {Object} progress - Sync progress record
   * @param {Object} updates - Fields to update
   * @returns {Promise<boolean>} - Success status
   */
  async updateSyncProgress(progress, updates) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Build update query dynamically based on provided updates
      let updateFields = [];
      const request = new sql.Request(pool);
      
      // Add each update field to the query
      if (updates.current_offset !== undefined) {
        updateFields.push('current_offset = @currentOffset');
        request.input('currentOffset', sql.Int, updates.current_offset);
      }
      
      if (updates.batch_number !== undefined) {
        updateFields.push('batch_number = @batchNumber');
        request.input('batchNumber', sql.Int, updates.batch_number);
      }
      
      if (updates.total_batches !== undefined) {
        updateFields.push('total_batches = @totalBatches');
        request.input('totalBatches', sql.Int, updates.total_batches);
      }
      
      if (updates.items_processed !== undefined) {
        updateFields.push('items_processed = @itemsProcessed');
        request.input('itemsProcessed', sql.Int, updates.items_processed);
      }
      
      if (updates.total_items !== undefined) {
        updateFields.push('total_items = @totalItems');
        request.input('totalItems', sql.Int, updates.total_items);
      }
      
      if (updates.status !== undefined) {
        updateFields.push('status = @status');
        request.input('status', sql.NVarChar, updates.status);
      }
      
      if (updates.completed_at !== undefined) {
        updateFields.push('completed_at = @completedAt');
        request.input('completedAt', sql.DateTime, updates.completed_at);
      }
      
      // Always update last_updated timestamp
      updateFields.push('last_updated = @lastUpdated');
      request.input('lastUpdated', sql.DateTime, new Date().toISOString());
      
      // Add parameters for WHERE clause
      request.input('entityType', sql.NVarChar, progress.entity_type);
      request.input('syncId', sql.NVarChar, progress.sync_id);
      
      // Execute update query
      if (updateFields.length > 0) {
        const updateQuery = `
          UPDATE SyncProgress 
          SET ${updateFields.join(', ')} 
          WHERE entity_type = @entityType AND sync_id = @syncId
        `;
        
        await request.query(updateQuery);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error updating sync progress:', error.message);
      return false;
    }
  }

  /**
   * Complete sync progress
   * @param {Object} progress - Sync progress record
   * @param {boolean} success - Whether sync completed successfully
   * @returns {Promise<boolean>} - Success status
   */
  async completeSyncProgress(progress, success) {
    try {
      return await this.updateSyncProgress(progress, {
        status: success ? 'completed' : 'failed',
        completed_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error completing sync progress:', error.message);
      return false;
    }
  }

  /**
   * Get all batches from Picqer API with pagination
   * @param {Date|null} updatedSince - Only get batches updated since this date
   * @param {Object|null} syncProgress - Sync progress record for resumable sync
   * @returns {Promise<Array>} - Array of batches
   */
  async getAllBatches(updatedSince = null, syncProgress = null) {
    try {
      const limit = 100; // Number of batches per page
      let offset = syncProgress ? syncProgress.current_offset : 0;
      let hasMoreBatches = true;
      let allBatches = [];
      
      // Format date for API request if provided
      let updatedSinceParam = null;
      if (updatedSince) {
        updatedSinceParam = updatedSince.toISOString().replace('T', ' ').substring(0, 19);
        console.log(`Fetching batches updated since: ${updatedSinceParam}`);
      } else {
        console.log('Fetching all batches from Picqer...');
      }
      
      // Continue fetching until we have all batches
      while (hasMoreBatches) {
        console.log(`Fetching batches with offset ${offset}...`);
        
        // Update sync progress if provided
        if (syncProgress) {
          await this.updateSyncProgress(syncProgress, {
            current_offset: offset
          });
        }
        
        // Build request parameters
        const params = { 
          offset,
          limit
        };
        
        // Add updated_since parameter if provided
        if (updatedSinceParam) {
          params.updated_since = updatedSinceParam;
        }
        
        const response = await this.client.get('/picklists/batches', { params });
        
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          // Filter out duplicates by idpicklist_batch
          const existingIds = new Set(allBatches.map(b => b.idpicklist_batch));
          const newBatches = response.data.filter(batch => {
            return !existingIds.has(batch.idpicklist_batch);
          });
          
          allBatches = [...allBatches, ...newBatches];
          console.log(`Retrieved ${newBatches.length} new batches (total unique: ${allBatches.length})`);
          
          // Check if we have more batches
          hasMoreBatches = response.data.length === limit;
          
          // Increment offset for next page
          offset += limit;
          
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          hasMoreBatches = false;
        }
      }
      
      console.log(`✅ Retrieved ${allBatches.length} unique batches from Picqer`);
      
      // Update sync progress with total items if provided
      if (syncProgress) {
        await this.updateSyncProgress(syncProgress, {
          total_items: allBatches.length
        });
      }
      
      return allBatches;
    } catch (error) {
      console.error('Error fetching batches from Picqer:', error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log('Rate limit hit, waiting before retrying...');
        
        // Wait for 20 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getAllBatches(updatedSince, syncProgress);
      }
      
      throw error;
    }
  }

  /**
   * Get a single batch with details from Picqer API
   * @param {number} idpicklist_batch - Batch ID
   * @returns {Promise<Object>} - Batch details
   */
  async getBatchDetails(idpicklist_batch) {
    try {
      console.log(`Fetching details for batch ${idpicklist_batch}...`);
      
      const response = await this.client.get(`/picklists/batches/${idpicklist_batch}`);
      
      if (response.data) {
        console.log(`Retrieved details for batch ${idpicklist_batch}`);
        return response.data;
      }
      
      return null;
    } catch (error) {
      console.error(`Error fetching details for batch ${idpicklist_batch}:`, error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log('Rate limit hit, waiting before retrying...');
        
        // Wait for 20 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getBatchDetails(idpicklist_batch);
      }
      
      // Return null on error to continue with other batches
      return null;
    }
  }

  /**
   * Get batches updated since a specific date
   * For incremental syncs, use a 30-day rolling window
   * @param {Date} date - The date to check updates from
   * @param {number} days - Optional number of days to look back
   * @returns {Promise<Array>} - Array of updated batches
   */
  async getBatchesUpdatedSince(date, days = null) {
    try {
      let effectiveDate;
      
      if (days) {
        // If days parameter is provided, use that to calculate the date
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - days);
        effectiveDate = daysAgo;
        console.log(`Using ${days}-day lookback window for sync: ${effectiveDate.toISOString()}`);
      } else {
        // Otherwise, use the 30-day rolling window from the provided date
        const thirtyDaysAgo = new Date(date.getTime() - (30 * 24 * 60 * 60 * 1000));
        effectiveDate = thirtyDaysAgo;
        console.log(`Using 30-day rolling window for incremental sync: ${effectiveDate.toISOString()}`);
      }
      
      return this.getAllBatches(effectiveDate);
    } catch (error) {
      console.error('Error getting batches updated since date:', error.message);
      throw error;
    }
  }

  /**
   * Save batch to database
   * @param {Object} batchDetails - Batch details from Picqer API
   * @returns {Promise<boolean>} - Success status
   */
  async saveBatchToDB(batchDetails) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if batch already exists
      const checkResult = await pool.request()
        .input('idpicklist_batch', sql.Int, batchDetails.idpicklist_batch)
        .query('SELECT id FROM Batches WHERE idpicklist_batch = @idpicklist_batch');
      
      const batchExists = checkResult.recordset.length > 0;
      
      // Prepare request with all possible parameters
      const request = new sql.Request(pool);
      
      // Add parameters with proper null handling
      request.input('idpicklist_batch', sql.Int, batchDetails.idpicklist_batch);
      request.input('picklist_batchid', sql.NVarChar, batchDetails.picklist_batchid || `BATCH-${batchDetails.idpicklist_batch}`);
      request.input('idwarehouse', sql.Int, batchDetails.idwarehouse || null);
      request.input('iduser_created', sql.Int, batchDetails.iduser_created || null);
      request.input('iduser_assigned', sql.Int, batchDetails.iduser_assigned || null);
      request.input('iduser_processed', sql.Int, batchDetails.iduser_processed || null);
      request.input('iduser_cancelled', sql.Int, batchDetails.iduser_cancelled || null);
      request.input('status', sql.NVarChar, batchDetails.status || '');
      request.input('created', sql.DateTime, batchDetails.created ? new Date(batchDetails.created) : null);
      request.input('updated', sql.DateTime, batchDetails.updated ? new Date(batchDetails.updated) : null);
      request.input('processed', sql.DateTime, batchDetails.processed ? new Date(batchDetails.processed) : null);
      request.input('cancelled', sql.DateTime, batchDetails.cancelled ? new Date(batchDetails.cancelled) : null);
      request.input('assigned', sql.DateTime, batchDetails.assigned ? new Date(batchDetails.assigned) : null);
      request.input('idfulfilment_customer', sql.Int, batchDetails.idfulfilment_customer || null);
      request.input('last_sync_date', sql.DateTime, new Date());
      
      if (batchExists) {
        // Update existing batch
        await request.query(`
          UPDATE Batches 
          SET 
            picklist_batchid = @picklist_batchid,
            idwarehouse = @idwarehouse,
            iduser_created = @iduser_created,
            iduser_assigned = @iduser_assigned,
            iduser_processed = @iduser_processed,
            iduser_cancelled = @iduser_cancelled,
            status = @status,
            created = @created,
            updated = @updated,
            processed = @processed,
            cancelled = @cancelled,
            assigned = @assigned,
            idfulfilment_customer = @idfulfilment_customer,
            last_sync_date = @last_sync_date
          WHERE idpicklist_batch = @idpicklist_batch
        `);
      } else {
        // Insert new batch
        await request.query(`
          INSERT INTO Batches (
            idpicklist_batch, picklist_batchid, idwarehouse, iduser_created,
            iduser_assigned, iduser_processed, iduser_cancelled, status,
            created, updated, processed, cancelled, assigned, idfulfilment_customer, last_sync_date
          )
          VALUES (
            @idpicklist_batch, @picklist_batchid, @idwarehouse, @iduser_created,
            @iduser_assigned, @iduser_processed, @iduser_cancelled, @status,
            @created, @updated, @processed, @cancelled, @assigned, @idfulfilment_customer, @last_sync_date
          )
        `);
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving batch ${batchDetails.idpicklist_batch} to database:`, error.message);
      throw error;
    }
  }

  /**
   * Save batch products to database
   * @param {number} idpicklist_batch - Batch ID
   * @param {Array} products - Array of batch products
   * @returns {Promise<boolean>} - Success status
   */
  async saveBatchProductsToDB(idpicklist_batch, products) {
    try {
      if (!products || products.length === 0) {
        return true;
      }
      
      const pool = await sql.connect(this.sqlConfig);
      
      // Delete existing products for this batch
      await pool.request()
        .input('idpicklist_batch', sql.Int, idpicklist_batch)
        .query('DELETE FROM BatchProducts WHERE idpicklist_batch = @idpicklist_batch');
      
      // Insert new products
      for (const product of products) {
        // Skip invalid products
        if (!product || !product.idproduct) {
          console.warn('Invalid product data, missing idproduct:', product);
          continue;
        }
        
        const request = new sql.Request(pool);
        
        // Add parameters with proper null handling
        request.input('idpicklist_batch', sql.Int, idpicklist_batch);
        request.input('idproduct', sql.Int, product.idproduct);
        request.input('productcode', sql.NVarChar, product.productcode || '');
        request.input('name', sql.NVarChar, product.name || '');
        request.input('amount', sql.Int, product.amount || 0);
        request.input('amount_picked', sql.Int, product.amount_picked || 0);
        request.input('amount_collected', sql.Int, product.amount_collected || 0);
        request.input('last_sync_date', sql.DateTime, new Date());
        
        await request.query(`
          INSERT INTO BatchProducts (
            idpicklist_batch, idproduct, productcode, name,
            amount, amount_picked, amount_collected, last_sync_date
          )
          VALUES (
            @idpicklist_batch, @idproduct, @productcode, @name,
            @amount, @amount_picked, @amount_collected, @last_sync_date
          )
        `);
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving products for batch ${idpicklist_batch} to database:`, error.message);
      throw error;
    }
  }

  /**
   * Save batch picklists to database
   * @param {number} idpicklist_batch - Batch ID
   * @param {Array} picklists - Array of batch picklists
   * @returns {Promise<boolean>} - Success status
   */
  async saveBatchPicklistsToDB(idpicklist_batch, picklists) {
    try {
      if (!picklists || picklists.length === 0) {
        return true;
      }
      
      const pool = await sql.connect(this.sqlConfig);
      
      // Delete existing picklists for this batch
      await pool.request()
        .input('idpicklist_batch', sql.Int, idpicklist_batch)
        .query('DELETE FROM BatchPicklists WHERE idpicklist_batch = @idpicklist_batch');
      
      // Insert new picklists
      for (const picklist of picklists) {
        // Skip invalid picklists
        if (!picklist || !picklist.idpicklist) {
          console.warn('Invalid picklist data, missing idpicklist:', picklist);
          continue;
        }
        
        const request = new sql.Request(pool);
        
        // Add parameters with proper null handling
        request.input('idpicklist_batch', sql.Int, idpicklist_batch);
        request.input('idpicklist', sql.Int, picklist.idpicklist);
        request.input('picklistid', sql.NVarChar, picklist.picklistid || '');
        request.input('status', sql.NVarChar, picklist.status || '');
        request.input('last_sync_date', sql.DateTime, new Date());
        
        await request.query(`
          INSERT INTO BatchPicklists (
            idpicklist_batch, idpicklist, picklistid, status, last_sync_date
          )
          VALUES (
            @idpicklist_batch, @idpicklist, @picklistid, @status, @last_sync_date
          )
        `);
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving picklists for batch ${idpicklist_batch} to database:`, error.message);
      throw error;
    }
  }

  /**
   * Update sync status in SyncStatus table
   * @param {number} syncCount - Number of items synced
   * @returns {Promise<boolean>} - Success status
   */
  async updateSyncStatus(syncCount) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Get current total count
      const countResult = await pool.request()
        .query('SELECT COUNT(*) as count FROM Batches');
      
      const totalCount = countResult.recordset[0].count;
      
      // Update SyncStatus record for batches
      await pool.request()
        .input('entityType', sql.NVarChar, 'batches')
        .input('lastSyncDate', sql.DateTime, new Date())
        .input('lastSyncCount', sql.Int, syncCount)
        .input('totalCount', sql.Int, totalCount)
        .query(`
          UPDATE SyncStatus 
          SET 
            last_sync_date = @lastSyncDate,
            last_sync_count = @lastSyncCount,
            total_count = @totalCount
          WHERE entity_type = @entityType
        `);
      
      return true;
    } catch (error) {
      console.error('Error updating sync status:', error.message);
      return false;
    }
  }

  /**
   * Sync batches from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @param {number} days - Optional number of days to look back
   * @returns {Promise<Object>} - Results of sync operation
   */
  async syncBatches(fullSync = false, days = null) {
    try {
      console.log(`Starting ${fullSync ? 'full' : 'incremental'} batch sync...`);
      
      // Create sync progress record
      const syncProgress = await this.createOrGetSyncProgress('batches', fullSync);
      
      let batches;
      if (fullSync) {
        // Full sync: get all batches
        batches = await this.getAllBatches(null, syncProgress);
      } else {
        // Incremental sync: get batches updated since last sync
        const lastSyncDate = await this.getLastSyncDate();
        batches = await this.getBatchesUpdatedSince(lastSyncDate, days);
      }
      
      if (!batches || batches.length === 0) {
        console.log('No batches to sync');
        
        // Complete sync progress
        await this.completeSyncProgress(syncProgress, true);
        
        return { 
          success: true, 
          savedBatches: 0, 
          savedProducts: 0, 
          savedPicklists: 0 
        };
      }
      
      console.log(`Syncing ${batches.length} batches...`);
      
      let savedBatches = 0;
      let savedProducts = 0;
      let savedPicklists = 0;
      let batchNumber = 0;
      
      // Process batches in batches for better performance
      for (let i = 0; i < batches.length; i += this.batchSize) {
        batchNumber++;
        const batchGroup = batches.slice(i, i + this.batchSize);
        console.log(`Processing batch group ${batchNumber} with ${batchGroup.length} batches...`);
        
        // Update sync progress
        await this.updateSyncProgress(syncProgress, {
          batch_number: batchNumber,
          items_processed: i
        });
        
        // Process each batch in the group
        for (const batch of batchGroup) {
          try {
            // Get batch details
            const batchDetails = await this.getBatchDetails(batch.idpicklist_batch);
            
            if (!batchDetails) {
              console.warn(`Could not get details for batch ${batch.idpicklist_batch}, skipping`);
              continue;
            }
            
            // Ensure picklist_batchid is a valid string
            if (!batchDetails.picklist_batchid) {
              batchDetails.picklist_batchid = `BATCH-${batchDetails.idpicklist_batch}`;
            }
            
            // Save batch to database
            await this.saveBatchToDB(batchDetails);
            savedBatches++;
            
            // Save batch products if available
            if (batchDetails.products && Array.isArray(batchDetails.products)) {
              await this.saveBatchProductsToDB(batch.idpicklist_batch, batchDetails.products);
              savedProducts += batchDetails.products.length;
            }
            
            // Save batch picklists if available
            if (batchDetails.picklists && Array.isArray(batchDetails.picklists)) {
              await this.saveBatchPicklistsToDB(batch.idpicklist_batch, batchDetails.picklists);
              savedPicklists += batchDetails.picklists.length;
            }
          } catch (batchError) {
            console.error(`Error saving batch ${batch.idpicklist_batch}:`, batchError.message);
            // Continue with next batch
          }
        }
        
        console.log(`Completed batch group ${batchNumber}, saved ${savedBatches} batches so far`);
        
        // Add a small delay between batch groups to avoid database overload
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Update sync status
      await this.updateSyncStatus(savedBatches);
      
      // Complete sync progress
      await this.completeSyncProgress(syncProgress, true);
      
      console.log(`✅ Batch sync completed: ${savedBatches} batches, ${savedProducts} products, and ${savedPicklists} picklists saved`);
      return {
        success: true,
        savedBatches,
        savedProducts,
        savedPicklists
      };
    } catch (error) {
      console.error('Error in batch sync:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = BatchService;
