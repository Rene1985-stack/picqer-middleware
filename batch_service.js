/**
 * Enhanced Batch service for Picqer middleware with robust picklist_batchid validation
 * Handles synchronization of picklist batches between Picqer and SQL database
 * Based on the Picqer API documentation: https://picqer.com/en/api/picklists/batches
 */
const axios = require('axios');
const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');
const batchesSchema = require('./batches_schema');
const syncProgressSchema = require('./sync_progress_schema');

class BatchService {
  constructor(apiKey, baseUrl, sqlConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.sqlConfig = sqlConfig;
    this.batchSize = 100; // Use larger batch size for better performance
    
    console.log('Initializing BatchService with:');
    console.log('API Key (first 5 chars):', this.apiKey ? this.apiKey.substring(0, 5) + '...' : 'undefined');
    console.log('Base URL:', this.baseUrl);
    
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
   * @returns {Promise<Array>} - Array of updated batches
   */
  async getBatchesUpdatedSince(date) {
    try {
      // For incremental syncs, use a 30-day rolling window
      // This ensures we don't miss any updates due to timezone differences
      const thirtyDaysAgo = new Date(date.getTime() - (30 * 24 * 60 * 60 * 1000));
      
      console.log(`Using 30-day rolling window for incremental sync: ${thirtyDaysAgo.toISOString()}`);
      return this.getAllBatches(thirtyDaysAgo);
    } catch (error) {
      console.error('Error getting batches updated since date:', error.message);
      throw error;
    }
  }

  /**
   * Get batches updated in the last N days
   * @param {number} days - Number of days to look back
   * @returns {Promise<Array>} - Array of updated batches
   */
  async getBatchesUpdatedInLastDays(days = 5) {
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);
      
      console.log(`Getting batches updated in the last ${days} days: ${daysAgo.toISOString()}`);
      return this.getAllBatches(daysAgo);
    } catch (error) {
      console.error(`Error getting batches updated in last ${days} days:`, error.message);
      throw error;
    }
  }

  /**
   * Save a batch to the database
   * @param {Object} batchDetails - Batch details from Picqer API
   * @returns {Promise<boolean>} - Success status
   */
  async saveBatchToDatabase(batchDetails) {
    try {
      console.log(`Saving batch ${batchDetails.idpicklist_batch} to database...`);
      
      // Sanitize picklist_batchid to prevent SQL validation errors
      // This is the key fix for the "Validation failed for parameter 'picklist_batchid'. Invalid string." error
      let picklist_batchid = '';
      
      // Try multiple possible field names and formats
      if (batchDetails.picklist_batchid !== undefined && batchDetails.picklist_batchid !== null) {
        picklist_batchid = String(batchDetails.picklist_batchid).trim();
      } else if (batchDetails.picklistbatchid !== undefined && batchDetails.picklistbatchid !== null) {
        picklist_batchid = String(batchDetails.picklistbatchid).trim();
      } else if (batchDetails.picklist_batch_id !== undefined && batchDetails.picklist_batch_id !== null) {
        picklist_batchid = String(batchDetails.picklist_batch_id).trim();
      } else if (batchDetails.picklistBatchId !== undefined && batchDetails.picklistBatchId !== null) {
        picklist_batchid = String(batchDetails.picklistBatchId).trim();
      }
      
      // If still empty, use a fallback value based on the batch ID
      if (!picklist_batchid) {
        picklist_batchid = `BATCH-${batchDetails.idpicklist_batch}`;
        console.log(`Using fallback picklist_batchid: ${picklist_batchid}`);
      }
      
      // Ensure picklist_batchid is valid for SQL by removing any problematic characters
      picklist_batchid = picklist_batchid.replace(/[^\w\s-]/gi, '');
      
      // Connect to database
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if batch already exists
      const existingResult = await pool.request()
        .input('idpicklist_batch', sql.Int, batchDetails.idpicklist_batch)
        .query(`
          SELECT idpicklist_batch 
          FROM Batches 
          WHERE idpicklist_batch = @idpicklist_batch
        `);
      
      const batchExists = existingResult.recordset.length > 0;
      
      // Prepare request with all batch fields
      const request = new sql.Request(pool);
      
      // Safely add parameters with proper type handling and defaults
      request.input('idpicklist_batch', sql.Int, batchDetails.idpicklist_batch);
      request.input('picklist_batchid', sql.NVarChar, picklist_batchid);
      request.input('status', sql.NVarChar, String(batchDetails.status || '').substring(0, 50));
      request.input('created', sql.DateTime, batchDetails.created ? new Date(batchDetails.created) : null);
      request.input('updated', sql.DateTime, batchDetails.updated ? new Date(batchDetails.updated) : null);
      request.input('iduser', sql.Int, batchDetails.iduser || null);
      request.input('idwarehouse', sql.Int, batchDetails.idwarehouse || null);
      request.input('idfulfilment_customer', sql.Int, batchDetails.idfulfilment_customer || null);
      request.input('last_sync_date', sql.DateTime, new Date());
      
      // Insert or update batch
      if (batchExists) {
        // Update existing batch
        await request.query(`
          UPDATE Batches 
          SET 
            picklist_batchid = @picklist_batchid,
            status = @status,
            created = @created,
            updated = @updated,
            iduser = @iduser,
            idwarehouse = @idwarehouse,
            idfulfilment_customer = @idfulfilment_customer,
            last_sync_date = @last_sync_date
          WHERE idpicklist_batch = @idpicklist_batch
        `);
        
        console.log(`Updated existing batch ${batchDetails.idpicklist_batch}`);
      } else {
        // Insert new batch
        await request.query(`
          INSERT INTO Batches (
            idpicklist_batch, picklist_batchid, status, created, updated,
            iduser, idwarehouse, idfulfilment_customer, last_sync_date
          )
          VALUES (
            @idpicklist_batch, @picklist_batchid, @status, @created, @updated,
            @iduser, @idwarehouse, @idfulfilment_customer, @last_sync_date
          )
        `);
        
        console.log(`Inserted new batch ${batchDetails.idpicklist_batch}`);
      }
      
      // Save batch products if available
      if (batchDetails.products && Array.isArray(batchDetails.products)) {
        await this.saveBatchProductsToDatabase(batchDetails.idpicklist_batch, batchDetails.products);
      }
      
      // Save batch picklists if available
      if (batchDetails.picklists && Array.isArray(batchDetails.picklists)) {
        await this.saveBatchPicklistsToDatabase(batchDetails.idpicklist_batch, batchDetails.picklists);
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving batch ${batchDetails.idpicklist_batch} to database:`, error.message);
      return false;
    }
  }

  /**
   * Save batch products to database
   * @param {number} idpicklist_batch - Batch ID
   * @param {Array} products - Array of products in the batch
   * @returns {Promise<boolean>} - Success status
   */
  async saveBatchProductsToDatabase(idpicklist_batch, products) {
    try {
      console.log(`Saving ${products.length} products for batch ${idpicklist_batch}...`);
      
      // Connect to database
      const pool = await sql.connect(this.sqlConfig);
      
      // Delete existing batch products
      await pool.request()
        .input('idpicklist_batch', sql.Int, idpicklist_batch)
        .query(`
          DELETE FROM BatchProducts 
          WHERE idpicklist_batch = @idpicklist_batch
        `);
      
      // Insert new batch products
      for (const product of products) {
        // Sanitize values to prevent SQL validation errors
        const productcode = String(product.productcode || '').substring(0, 100);
        const name = String(product.name || '').substring(0, 255);
        
        await pool.request()
          .input('idpicklist_batch', sql.Int, idpicklist_batch)
          .input('idproduct', sql.Int, product.idproduct || null)
          .input('productcode', sql.NVarChar, productcode)
          .input('name', sql.NVarChar, name)
          .input('amount', sql.Int, product.amount || 0)
          .query(`
            INSERT INTO BatchProducts (
              idpicklist_batch, idproduct, productcode, name, amount
            )
            VALUES (
              @idpicklist_batch, @idproduct, @productcode, @name, @amount
            )
          `);
      }
      
      console.log(`✅ Saved ${products.length} products for batch ${idpicklist_batch}`);
      return true;
    } catch (error) {
      console.error(`Error saving batch products for batch ${idpicklist_batch}:`, error.message);
      return false;
    }
  }

  /**
   * Save batch picklists to database
   * @param {number} idpicklist_batch - Batch ID
   * @param {Array} picklists - Array of picklists in the batch
   * @returns {Promise<boolean>} - Success status
   */
  async saveBatchPicklistsToDatabase(idpicklist_batch, picklists) {
    try {
      console.log(`Saving ${picklists.length} picklists for batch ${idpicklist_batch}...`);
      
      // Connect to database
      const pool = await sql.connect(this.sqlConfig);
      
      // Delete existing batch picklists
      await pool.request()
        .input('idpicklist_batch', sql.Int, idpicklist_batch)
        .query(`
          DELETE FROM BatchPicklists 
          WHERE idpicklist_batch = @idpicklist_batch
        `);
      
      // Insert new batch picklists
      for (const picklist of picklists) {
        // Sanitize values to prevent SQL validation errors
        const picklistid = String(picklist.picklistid || '').substring(0, 100);
        
        await pool.request()
          .input('idpicklist_batch', sql.Int, idpicklist_batch)
          .input('idpicklist', sql.Int, picklist.idpicklist || null)
          .input('picklistid', sql.NVarChar, picklistid)
          .query(`
            INSERT INTO BatchPicklists (
              idpicklist_batch, idpicklist, picklistid
            )
            VALUES (
              @idpicklist_batch, @idpicklist, @picklistid
            )
          `);
      }
      
      console.log(`✅ Saved ${picklists.length} picklists for batch ${idpicklist_batch}`);
      return true;
    } catch (error) {
      console.error(`Error saving batch picklists for batch ${idpicklist_batch}:`, error.message);
      return false;
    }
  }

  /**
   * Sync batches from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @param {number|null} days - Number of days to look back (optional)
   * @returns {Promise<Object>} - Sync results
   */
  async syncBatches(fullSync = false, days = null) {
    try {
      console.log(`Starting ${fullSync ? 'full' : 'incremental'} batch sync...`);
      
      // Create sync progress record
      const syncProgress = await this.createOrGetSyncProgress('batches', fullSync);
      
      // Get batches from Picqer
      let batches = [];
      
      if (days !== null && !isNaN(days) && days > 0) {
        // If days parameter is provided, get batches updated in the last N days
        console.log(`Using days parameter: ${days}`);
        batches = await this.getBatchesUpdatedInLastDays(days);
      } else if (fullSync) {
        // For full sync, get all batches
        batches = await this.getAllBatches(null, syncProgress);
      } else {
        // For incremental sync, get batches updated since last sync
        const lastSyncDate = await this.getLastSyncDate();
        
        if (lastSyncDate) {
          console.log(`Last sync date: ${lastSyncDate.toISOString()}`);
          batches = await this.getBatchesUpdatedSince(lastSyncDate);
        } else {
          console.log('No last sync date found, performing full sync');
          batches = await this.getAllBatches(null, syncProgress);
        }
      }
      
      console.log(`Retrieved ${batches.length} batches to sync`);
      
      // Update sync progress with total items
      await this.updateSyncProgress(syncProgress, {
        total_items: batches.length
      });
      
      // Save batches to database
      let successCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        // Update sync progress
        await this.updateSyncProgress(syncProgress, {
          items_processed: i + 1,
          batch_number: i + 1
        });
        
        try {
          // Get batch details
          const batchDetails = await this.getBatchDetails(batch.idpicklist_batch);
          
          if (batchDetails) {
            // Save batch to database
            const success = await this.saveBatchToDatabase(batchDetails);
            
            if (success) {
              successCount++;
            } else {
              errorCount++;
              console.error(`Error saving batch ${batch.idpicklist_batch}`);
            }
          } else {
            errorCount++;
            console.error(`Could not retrieve details for batch ${batch.idpicklist_batch}`);
          }
        } catch (error) {
          errorCount++;
          console.error(`Error processing batch ${batch.idpicklist_batch}:`, error.message);
        }
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Update last sync date
      try {
        const pool = await sql.connect(this.sqlConfig);
        
        await pool.request()
          .input('now', sql.DateTime, new Date())
          .input('successCount', sql.Int, successCount)
          .query(`
            UPDATE SyncStatus 
            SET 
              last_sync_date = @now,
              last_sync_count = @successCount
            WHERE entity_type = 'batches'
          `);
        
        console.log('Updated last sync date for batches');
      } catch (error) {
        console.error('Error updating last sync date:', error.message);
      }
      
      // Complete sync progress
      await this.completeSyncProgress(syncProgress, true);
      
      console.log(`✅ Batch sync completed: ${successCount} succeeded, ${errorCount} failed`);
      
      return {
        success: true,
        total: batches.length,
        succeeded: successCount,
        failed: errorCount
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
