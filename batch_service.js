/**
 * Batch service for Picqer middleware
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
   * Save batches to database
   * @param {Array} batches - Array of batches to save
   * @param {Object|null} syncProgress - Sync progress record for tracking
   * @returns {Promise<number>} - Number of batches saved
   */
  async saveBatchesToDatabase(batches, syncProgress = null) {
    try {
      console.log(`Saving ${batches.length} batches to database...`);
      const pool = await sql.connect(this.sqlConfig);
      let savedCount = 0;
      
      // Process batches in chunks to avoid overwhelming the database
      const chunkSize = 10;
      for (let i = 0; i < batches.length; i += chunkSize) {
        const chunk = batches.slice(i, i + chunkSize);
        console.log(`Processing batch chunk ${i / chunkSize + 1} of ${Math.ceil(batches.length / chunkSize)}...`);
        
        // Update sync progress if provided
        if (syncProgress) {
          await this.updateSyncProgress(syncProgress, {
            batch_number: Math.floor(i / chunkSize) + 1,
            total_batches: Math.ceil(batches.length / chunkSize),
            items_processed: i
          });
        }
        
        // Process each batch in the chunk
        for (const batch of chunk) {
          try {
            // Get full batch details including products and picklists
            const batchDetails = await this.getBatchDetails(batch.idpicklist_batch);
            
            if (!batchDetails) {
              console.warn(`Skipping batch ${batch.idpicklist_batch} due to missing details`);
              continue;
            }
            
            // Begin transaction
            const transaction = new sql.Transaction(pool);
            await transaction.begin();
            
            try {
              // Check if batch already exists
              const checkRequest = new sql.Request(transaction);
              const checkResult = await checkRequest
                .input('idpicklist_batch', sql.Int, batchDetails.idpicklist_batch)
                .query('SELECT id FROM Batches WHERE idpicklist_batch = @idpicklist_batch');
              
              const batchExists = checkResult.recordset.length > 0;
              
              // Prepare assigned_to and completed_by data
              const assignedTo = batchDetails.assigned_to || {};
              const completedBy = batchDetails.completed_by || {};
              
              // Insert or update batch
              const batchRequest = new sql.Request(transaction);
              
              if (batchExists) {
                // Update existing batch
                await batchRequest
                  .input('idpicklist_batch', sql.Int, batchDetails.idpicklist_batch)
                  .input('picklist_batchid', sql.NVarChar, batchDetails.picklist_batchid)
                  .input('idwarehouse', sql.Int, batchDetails.idwarehouse)
                  .input('type', sql.NVarChar, batchDetails.type)
                  .input('status', sql.NVarChar, batchDetails.status)
                  .input('assigned_to_iduser', sql.Int, assignedTo.iduser || null)
                  .input('assigned_to_full_name', sql.NVarChar, assignedTo.full_name || null)
                  .input('assigned_to_username', sql.NVarChar, assignedTo.username || null)
                  .input('completed_by_iduser', sql.Int, completedBy.iduser || null)
                  .input('completed_by_full_name', sql.NVarChar, completedBy.full_name || null)
                  .input('completed_by_username', sql.NVarChar, completedBy.username || null)
                  .input('total_products', sql.Int, batchDetails.total_products)
                  .input('total_picklists', sql.Int, batchDetails.total_picklists)
                  .input('completed_at', sql.DateTime, batchDetails.completed_at)
                  .input('created_at', sql.DateTime, batchDetails.created_at)
                  .input('updated_at', sql.DateTime, batchDetails.updated_at)
                  .input('idfulfilment_customer', sql.Int, batchDetails.idfulfilment_customer)
                  .input('last_sync_date', sql.DateTime, new Date().toISOString())
                  .query(`
                    UPDATE Batches SET
                      picklist_batchid = @picklist_batchid,
                      idwarehouse = @idwarehouse,
                      type = @type,
                      status = @status,
                      assigned_to_iduser = @assigned_to_iduser,
                      assigned_to_full_name = @assigned_to_full_name,
                      assigned_to_username = @assigned_to_username,
                      completed_by_iduser = @completed_by_iduser,
                      completed_by_full_name = @completed_by_full_name,
                      completed_by_username = @completed_by_username,
                      total_products = @total_products,
                      total_picklists = @total_picklists,
                      completed_at = @completed_at,
                      created_at = @created_at,
                      updated_at = @updated_at,
                      idfulfilment_customer = @idfulfilment_customer,
                      last_sync_date = @last_sync_date
                    WHERE idpicklist_batch = @idpicklist_batch
                  `);
              } else {
                // Insert new batch
                await batchRequest
                  .input('idpicklist_batch', sql.Int, batchDetails.idpicklist_batch)
                  .input('picklist_batchid', sql.NVarChar, batchDetails.picklist_batchid)
                  .input('idwarehouse', sql.Int, batchDetails.idwarehouse)
                  .input('type', sql.NVarChar, batchDetails.type)
                  .input('status', sql.NVarChar, batchDetails.status)
                  .input('assigned_to_iduser', sql.Int, assignedTo.iduser || null)
                  .input('assigned_to_full_name', sql.NVarChar, assignedTo.full_name || null)
                  .input('assigned_to_username', sql.NVarChar, assignedTo.username || null)
                  .input('completed_by_iduser', sql.Int, completedBy.iduser || null)
                  .input('completed_by_full_name', sql.NVarChar, completedBy.full_name || null)
                  .input('completed_by_username', sql.NVarChar, completedBy.username || null)
                  .input('total_products', sql.Int, batchDetails.total_products)
                  .input('total_picklists', sql.Int, batchDetails.total_picklists)
                  .input('completed_at', sql.DateTime, batchDetails.completed_at)
                  .input('created_at', sql.DateTime, batchDetails.created_at)
                  .input('updated_at', sql.DateTime, batchDetails.updated_at)
                  .input('idfulfilment_customer', sql.Int, batchDetails.idfulfilment_customer)
                  .input('last_sync_date', sql.DateTime, new Date().toISOString())
                  .query(`
                    INSERT INTO Batches (
                      idpicklist_batch, picklist_batchid, idwarehouse, type, status,
                      assigned_to_iduser, assigned_to_full_name, assigned_to_username,
                      completed_by_iduser, completed_by_full_name, completed_by_username,
                      total_products, total_picklists, completed_at, created_at, updated_at,
                      idfulfilment_customer, last_sync_date
                    ) VALUES (
                      @idpicklist_batch, @picklist_batchid, @idwarehouse, @type, @status,
                      @assigned_to_iduser, @assigned_to_full_name, @assigned_to_username,
                      @completed_by_iduser, @completed_by_full_name, @completed_by_username,
                      @total_products, @total_picklists, @completed_at, @created_at, @updated_at,
                      @idfulfilment_customer, @last_sync_date
                    )
                  `);
              }
              
              // Delete existing batch products and picklists for clean update
              const deleteRequest = new sql.Request(transaction);
              await deleteRequest
                .input('idpicklist_batch', sql.Int, batchDetails.idpicklist_batch)
                .query(`
                  DELETE FROM BatchProducts WHERE idpicklist_batch = @idpicklist_batch;
                  DELETE FROM BatchPicklists WHERE idpicklist_batch = @idpicklist_batch;
                `);
              
              // Insert batch products if available
              if (batchDetails.products && Array.isArray(batchDetails.products)) {
                for (const product of batchDetails.products) {
                  const productRequest = new sql.Request(transaction);
                  await productRequest
                    .input('idpicklist_batch', sql.Int, batchDetails.idpicklist_batch)
                    .input('idproduct', sql.Int, product.idproduct)
                    .input('name', sql.NVarChar, product.name)
                    .input('productcode', sql.NVarChar, product.productcode)
                    .input('productcode_supplier', sql.NVarChar, product.productcode_supplier)
                    .input('stock_location', sql.NVarChar, product.stock_location)
                    .input('image', sql.NVarChar, product.image)
                    .input('barcodes', sql.NVarChar, JSON.stringify(product.barcodes || []))
                    .input('amount', sql.Int, product.amount)
                    .input('amount_picked', sql.Int, product.amount_picked)
                    .input('amount_collected', sql.Int, product.amount_collected)
                    .input('last_sync_date', sql.DateTime, new Date().toISOString())
                    .query(`
                      INSERT INTO BatchProducts (
                        idpicklist_batch, idproduct, name, productcode, productcode_supplier,
                        stock_location, image, barcodes, amount, amount_picked, amount_collected,
                        last_sync_date
                      ) VALUES (
                        @idpicklist_batch, @idproduct, @name, @productcode, @productcode_supplier,
                        @stock_location, @image, @barcodes, @amount, @amount_picked, @amount_collected,
                        @last_sync_date
                      )
                    `);
                }
              }
              
              // Insert batch picklists if available
              if (batchDetails.picklists && Array.isArray(batchDetails.picklists)) {
                for (const picklist of batchDetails.picklists) {
                  const picklistRequest = new sql.Request(transaction);
                  await picklistRequest
                    .input('idpicklist_batch', sql.Int, batchDetails.idpicklist_batch)
                    .input('idpicklist', sql.Int, picklist.idpicklist)
                    .input('picklistid', sql.NVarChar, picklist.picklistid)
                    .input('reference', sql.NVarChar, picklist.reference)
                    .input('status', sql.NVarChar, picklist.status)
                    .input('alias', sql.NVarChar, picklist.alias)
                    .input('picking_container', sql.NVarChar, picklist.picking_container)
                    .input('total_products', sql.Int, picklist.total_products)
                    .input('delivery_name', sql.NVarChar, picklist.delivery_name)
                    .input('has_notes', sql.Bit, picklist.has_notes ? 1 : 0)
                    .input('has_customer_remarks', sql.Bit, picklist.has_customer_remarks ? 1 : 0)
                    .input('customer_remarks', sql.NVarChar, picklist.customer_remarks)
                    .input('created_at', sql.DateTime, picklist.created_at)
                    .input('last_sync_date', sql.DateTime, new Date().toISOString())
                    .query(`
                      INSERT INTO BatchPicklists (
                        idpicklist_batch, idpicklist, picklistid, reference, status,
                        alias, picking_container, total_products, delivery_name,
                        has_notes, has_customer_remarks, customer_remarks, created_at,
                        last_sync_date
                      ) VALUES (
                        @idpicklist_batch, @idpicklist, @picklistid, @reference, @status,
                        @alias, @picking_container, @total_products, @delivery_name,
                        @has_notes, @has_customer_remarks, @customer_remarks, @created_at,
                        @last_sync_date
                      )
                    `);
                }
              }
              
              // Commit transaction
              await transaction.commit();
              savedCount++;
              console.log(`✅ Saved batch ${batchDetails.idpicklist_batch} to database`);
            } catch (error) {
              // Rollback transaction on error
              await transaction.rollback();
              console.error(`Error saving batch ${batch.idpicklist_batch} to database:`, error.message);
            }
          } catch (error) {
            console.error(`Error processing batch ${batch.idpicklist_batch}:`, error.message);
          }
          
          // Add a small delay between batches to avoid overwhelming the database
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Update sync progress after each chunk if provided
        if (syncProgress) {
          await this.updateSyncProgress(syncProgress, {
            items_processed: Math.min(i + chunk.length, batches.length)
          });
        }
      }
      
      console.log(`✅ Saved ${savedCount} out of ${batches.length} batches to database`);
      
      // Update SyncStatus table with last sync date
      await pool.request()
        .input('lastSyncDate', sql.DateTime, new Date().toISOString())
        .query(`
          UPDATE SyncStatus 
          SET last_sync_date = @lastSyncDate 
          WHERE entity_type = 'batches'
        `);
      
      return savedCount;
    } catch (error) {
      console.error('Error saving batches to database:', error.message);
      throw error;
    }
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
   * Sync batches from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Sync results
   */
  async syncBatches(fullSync = false) {
    try {
      console.log(`Starting ${fullSync ? 'full' : 'incremental'} batch sync...`);
      
      // Create or get sync progress record
      const syncProgress = await this.createOrGetSyncProgress('batches', fullSync);
      
      let batches = [];
      
      if (fullSync) {
        // Full sync: Get all batches
        batches = await this.getAllBatches(null, syncProgress);
      } else {
        // Incremental sync: Get batches updated since last sync
        const lastSyncDate = await this.getLastSyncDate();
        
        if (lastSyncDate) {
          console.log(`Last sync date: ${lastSyncDate.toISOString()}`);
          batches = await this.getBatchesUpdatedSince(lastSyncDate, syncProgress);
        } else {
          console.log('No last sync date found, performing full sync');
          batches = await this.getAllBatches(null, syncProgress);
        }
      }
      
      console.log(`Retrieved ${batches.length} batches from Picqer`);
      
      // Save batches to database
      const savedCount = await this.saveBatchesToDatabase(batches, syncProgress);
      
      // Complete sync progress
      await this.completeSyncProgress(syncProgress, true);
      
      console.log(`✅ Batch sync completed: ${savedCount} batches saved`);
      
      return {
        success: true,
        totalBatches: batches.length,
        savedBatches: savedCount
      };
    } catch (error) {
      console.error('❌ Error in batch sync:', error.message);
      
      // Update sync progress with failure status
      if (syncProgress) {
        await this.completeSyncProgress(syncProgress, false);
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = BatchService;
