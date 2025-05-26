/**
 * Optimized Warehouse service with performance enhancements
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
const warehousesSchema = require('./warehouses_schema');
const syncProgressSchema = require('./sync_progress_schema');

class WarehouseService {
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
   * Initialize the database with warehouses schema and sync progress tracking
   * @returns {Promise<boolean>} - Success status
   */
  async initializeWarehousesDatabase() {
    try {
      console.log('Initializing database with warehouses schema...');
      const pool = await sql.connect(this.sqlConfig);
      
      // Create Warehouses table
      await pool.request().query(warehousesSchema.createWarehousesTableSQL);
      
      // Create WarehouseStock table
      await pool.request().query(warehousesSchema.createWarehouseStockTableSQL);
      
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
          // Check if warehouses record exists
          const recordResult = await pool.request().query(`
            SELECT COUNT(*) AS recordExists 
            FROM SyncStatus 
            WHERE entity_type = 'warehouses'
          `);
          
          const warehousesRecordExists = recordResult.recordset[0].recordExists > 0;
          
          if (warehousesRecordExists) {
            // Update existing record
            await pool.request().query(`
              UPDATE SyncStatus 
              SET entity_name = 'warehouses' 
              WHERE entity_type = 'warehouses'
            `);
            console.log('Updated existing warehouses entity in SyncStatus');
          } else {
            // Insert new record
            await pool.request().query(`
              INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
              VALUES ('warehouses', 'warehouses', '2025-01-01T00:00:00.000Z')
            `);
            console.log('Added warehouses record to SyncStatus table');
          }
        } else {
          console.warn('entity_type column does not exist in SyncStatus table');
        }
      } else {
        console.warn('SyncStatus table does not exist');
      }
      
      console.log('✅ Warehouses database schema initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing warehouses database schema:', error.message);
      throw error;
    }
  }

  /**
   * Create or get sync progress record
   * @param {string} entityType - Entity type (e.g., 'warehouses')
   * @param {boolean} isFullSync - Whether this is a full sync
   * @returns {Promise<Object>} - Sync progress record
   */
  async createOrGetSyncProgress(entityType = 'warehouses', isFullSync = false) {
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
   * Get all warehouses from Picqer API with pagination
   * @param {Date|null} updatedSince - Only get warehouses updated since this date
   * @param {Object|null} syncProgress - Sync progress record for resumable sync
   * @returns {Promise<Array>} - Array of warehouses
   */
  async getAllWarehouses(updatedSince = null, syncProgress = null) {
    try {
      const limit = 100; // Number of warehouses per page
      let offset = syncProgress ? syncProgress.current_offset : 0;
      let hasMoreWarehouses = true;
      let allWarehouses = [];
      
      // Format date for API request if provided
      let updatedSinceParam = null;
      if (updatedSince) {
        updatedSinceParam = updatedSince.toISOString();
        console.log(`Fetching warehouses updated since: ${updatedSinceParam}`);
      } else {
        console.log('Fetching all warehouses from Picqer...');
      }
      
      // Continue fetching until we have all warehouses
      while (hasMoreWarehouses) {
        console.log(`Fetching warehouses with offset ${offset}...`);
        
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
        
        const response = await this.client.get('/warehouses', { params });
        
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          // Filter out duplicates by idwarehouse
          const existingIds = new Set(allWarehouses.map(w => w.idwarehouse));
          const newWarehouses = response.data.filter(warehouse => {
            return !existingIds.has(warehouse.idwarehouse);
          });
          
          allWarehouses = [...allWarehouses, ...newWarehouses];
          console.log(`Retrieved ${newWarehouses.length} new warehouses (total unique: ${allWarehouses.length})`);
          
          // Check if we have more warehouses
          hasMoreWarehouses = response.data.length === limit;
          
          // Increment offset for next page
          offset += limit;
          
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          hasMoreWarehouses = false;
        }
      }
      
      // Sort warehouses by priority (lower priorities first as they are more important)
      allWarehouses.sort((a, b) => {
        return (a.priority || 999) - (b.priority || 999);
      });
      
      console.log('Sorted warehouses by priority for processing');
      console.log(`✅ Retrieved ${allWarehouses.length} unique warehouses from Picqer`);
      
      // Update sync progress with total items if provided
      if (syncProgress) {
        await this.updateSyncProgress(syncProgress, {
          total_items: allWarehouses.length
        });
      }
      
      return allWarehouses;
    } catch (error) {
      console.error('Error fetching warehouses from Picqer:', error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log('Rate limit hit, waiting before retrying...');
        
        // Wait for 20 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getAllWarehouses(updatedSince, syncProgress);
      }
      
      throw error;
    }
  }

  /**
   * Get warehouse stock from Picqer API
   * @param {number} idwarehouse - Warehouse ID
   * @returns {Promise<Array>} - Array of warehouse stock items
   */
  async getWarehouseStock(idwarehouse) {
    try {
      console.log(`Fetching stock for warehouse ${idwarehouse}...`);
      
      const response = await this.client.get(`/warehouses/${idwarehouse}/stock`);
      
      if (response.data && Array.isArray(response.data)) {
        console.log(`Retrieved ${response.data.length} stock items for warehouse ${idwarehouse}`);
        return response.data;
      }
      
      return [];
    } catch (error) {
      console.error(`Error fetching stock for warehouse ${idwarehouse}:`, error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log('Rate limit hit, waiting before retrying...');
        
        // Wait for 20 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getWarehouseStock(idwarehouse);
      }
      
      // Return empty array on error to continue with other warehouses
      return [];
    }
  }

  /**
   * Get warehouses updated since a specific date
   * For incremental syncs, use a 30-day rolling window
   * @param {Date} date - The date to check updates from
   * @returns {Promise<Array>} - Array of updated warehouses
   */
  async getWarehousesUpdatedSince(date) {
    // For incremental syncs, use a 30-day rolling window
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Use the more recent date between the provided date and 30 days ago
    const effectiveDate = date > thirtyDaysAgo ? date : thirtyDaysAgo;
    
    console.log(`Using 30-day rolling window for incremental sync. Effective date: ${effectiveDate.toISOString()}`);
    return this.getAllWarehouses(effectiveDate);
  }

  /**
   * Get the last sync date for warehouses
   * @returns {Promise<Date|null>} - Last sync date or null if not found
   */
  async getLastWarehousesSyncDate() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if SyncStatus table exists
      const tableResult = await pool.request().query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'SyncStatus'
      `);
      
      const syncTableExists = tableResult.recordset[0].tableExists > 0;
      
      if (syncTableExists) {
        // Check if entity_type column exists
        const columnResult = await pool.request().query(`
          SELECT COUNT(*) AS columnExists 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'SyncStatus' AND COLUMN_NAME = 'entity_type'
        `);
        
        const entityTypeColumnExists = columnResult.recordset[0].columnExists > 0;
        
        if (entityTypeColumnExists) {
          // Get last sync date by entity_type
          const result = await pool.request().query(`
            SELECT last_sync_date 
            FROM SyncStatus 
            WHERE entity_type = 'warehouses'
          `);
          
          if (result.recordset.length > 0) {
            return new Date(result.recordset[0].last_sync_date);
          }
        }
      }
      
      // Default to January 1, 2025 if no sync date found
      return new Date('2025-01-01T00:00:00.000Z');
    } catch (error) {
      console.error('Error getting last warehouses sync date:', error.message);
      // Default to January 1, 2025 if error occurs
      return new Date('2025-01-01T00:00:00.000Z');
    }
  }

  /**
   * Update the last sync date for warehouses
   * @param {Date} date - The new sync date
   * @param {number} count - The number of warehouses synced
   * @returns {Promise<boolean>} - Success status
   */
  async updateLastWarehousesSyncDate(date = new Date(), count = 0) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if SyncStatus table exists
      const tableResult = await pool.request().query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'SyncStatus'
      `);
      
      const syncTableExists = tableResult.recordset[0].tableExists > 0;
      
      if (syncTableExists) {
        // Check if entity_type column exists
        const columnResult = await pool.request().query(`
          SELECT COUNT(*) AS columnExists 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'SyncStatus' AND COLUMN_NAME = 'entity_type'
        `);
        
        const entityTypeColumnExists = columnResult.recordset[0].columnExists > 0;
        
        if (entityTypeColumnExists) {
          // Check if warehouses record exists
          const recordResult = await pool.request().query(`
            SELECT COUNT(*) AS recordExists 
            FROM SyncStatus 
            WHERE entity_type = 'warehouses'
          `);
          
          const recordExists = recordResult.recordset[0].recordExists > 0;
          
          if (recordExists) {
            // Update existing record
            await pool.request()
              .input('lastSyncDate', sql.DateTime, date)
              .input('lastSyncCount', sql.Int, count)
              .query(`
                UPDATE SyncStatus 
                SET last_sync_date = @lastSyncDate, 
                    last_sync_count = @lastSyncCount,
                    entity_name = 'warehouses'
                WHERE entity_type = 'warehouses'
              `);
          } else {
            // Insert new record
            await pool.request()
              .input('lastSyncDate', sql.DateTime, date)
              .input('lastSyncCount', sql.Int, count)
              .query(`
                INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date, last_sync_count)
                VALUES ('warehouses', 'warehouses', @lastSyncDate, @lastSyncCount)
              `);
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error updating last warehouses sync date:', error.message);
      return false;
    }
  }

  /**
   * Get the count of warehouses in the database
   * @returns {Promise<number>} - Warehouse count
   */
  async getWarehouseCountFromDatabase() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query('SELECT COUNT(*) AS count FROM Warehouses');
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting warehouse count:', error.message);
      return 0;
    }
  }

  /**
   * Save warehouses to database with optimized batch processing
   * @param {Array} warehouses - Array of warehouses to save
   * @param {Object|null} syncProgress - Sync progress record for resumable sync
   * @returns {Promise<Object>} - Result with success status and count
   */
  async saveWarehousesToDatabase(warehouses, syncProgress = null) {
    try {
      console.log(`Saving ${warehouses.length} warehouses to database...`);
      
      const pool = await sql.connect(this.sqlConfig);
      
      // Calculate number of batches
      const totalBatches = Math.ceil(warehouses.length / this.batchSize);
      console.log(`Processing warehouses in ${totalBatches} batches of ${this.batchSize}`);
      
      // Update sync progress with total batches if provided
      if (syncProgress) {
        await this.updateSyncProgress(syncProgress, {
          total_batches: totalBatches
        });
      }
      
      // Start from the batch number in sync progress if resuming
      const startBatch = syncProgress ? syncProgress.batch_number : 0;
      let savedCount = syncProgress ? syncProgress.items_processed : 0;
      let errorCount = 0;
      
      // Process warehouses in batches
      for (let batchNum = startBatch; batchNum < totalBatches; batchNum++) {
        console.log(`Processing batch ${batchNum + 1} of ${totalBatches}...`);
        
        // Update sync progress if provided
        if (syncProgress) {
          await this.updateSyncProgress(syncProgress, {
            batch_number: batchNum
          });
        }
        
        const batchStart = batchNum * this.batchSize;
        const batchEnd = Math.min(batchStart + this.batchSize, warehouses.length);
        const batch = warehouses.slice(batchStart, batchEnd);
        
        // Process each warehouse in the batch
        const transaction = new sql.Transaction(pool);
        
        try {
          await transaction.begin();
          
          for (const warehouse of batch) {
            try {
              // Check if warehouse already exists
              const checkResult = await new sql.Request(transaction)
                .input('idwarehouse', sql.Int, warehouse.idwarehouse)
                .query('SELECT id FROM Warehouses WHERE idwarehouse = @idwarehouse');
              
              const warehouseExists = checkResult.recordset.length > 0;
              
              // Prepare request for insert/update
              const request = new sql.Request(transaction);
              
              // Add standard fields
              request.input('idwarehouse', sql.Int, warehouse.idwarehouse);
              request.input('name', sql.NVarChar, warehouse.name || '');
              request.input('accept_orders', sql.Bit, warehouse.accept_orders ? 1 : 0);
              request.input('counts_for_general_stock', sql.Bit, warehouse.counts_for_general_stock ? 1 : 0);
              request.input('priority', sql.Int, warehouse.priority || 0);
              request.input('active', sql.Bit, warehouse.active ? 1 : 0);
              request.input('lastSyncDate', sql.DateTime, new Date());
              
              if (warehouseExists) {
                // Update existing warehouse
                await request.query(`
                  UPDATE Warehouses 
                  SET name = @name, 
                      accept_orders = @accept_orders, 
                      counts_for_general_stock = @counts_for_general_stock, 
                      priority = @priority, 
                      active = @active, 
                      last_sync_date = @lastSyncDate 
                  WHERE idwarehouse = @idwarehouse
                `);
              } else {
                // Insert new warehouse
                await request.query(`
                  INSERT INTO Warehouses (
                    idwarehouse, name, accept_orders, counts_for_general_stock, 
                    priority, active, last_sync_date
                  )
                  VALUES (
                    @idwarehouse, @name, @accept_orders, @counts_for_general_stock, 
                    @priority, @active, @lastSyncDate
                  )
                `);
              }
              
              // Fetch and save warehouse stock
              try {
                const stockItems = await this.getWarehouseStock(warehouse.idwarehouse);
                
                if (stockItems.length > 0) {
                  // Delete existing stock for this warehouse
                  await new sql.Request(transaction)
                    .input('idwarehouse', sql.Int, warehouse.idwarehouse)
                    .query('DELETE FROM WarehouseStock WHERE idwarehouse = @idwarehouse');
                  
                  // Insert new stock items
                  for (const item of stockItems) {
                    const stockRequest = new sql.Request(transaction);
                    stockRequest.input('idwarehouse', sql.Int, warehouse.idwarehouse);
                    stockRequest.input('idproduct', sql.Int, item.idproduct);
                    stockRequest.input('productcode', sql.NVarChar, item.productcode || '');
                    stockRequest.input('stock', sql.Int, item.stock?.stock || 0);
                    stockRequest.input('reserved', sql.Int, item.stock?.reserved || 0);
                    stockRequest.input('reservedbackorders', sql.Int, item.stock?.reservedbackorders || 0);
                    stockRequest.input('reservedpicklists', sql.Int, item.stock?.reservedpicklists || 0);
                    stockRequest.input('reservedallocations', sql.Int, item.stock?.reservedallocations || 0);
                    stockRequest.input('freestock', sql.Int, item.stock?.freestock || 0);
                    stockRequest.input('lastSyncDate', sql.DateTime, new Date());
                    
                    await stockRequest.query(`
                      INSERT INTO WarehouseStock (
                        idwarehouse, idproduct, productcode, stock, reserved, 
                        reservedbackorders, reservedpicklists, reservedallocations, 
                        freestock, last_sync_date
                      )
                      VALUES (
                        @idwarehouse, @idproduct, @productcode, @stock, @reserved, 
                        @reservedbackorders, @reservedpicklists, @reservedallocations, 
                        @freestock, @lastSyncDate
                      )
                    `);
                  }
                  
                  console.log(`Saved ${stockItems.length} stock items for warehouse ${warehouse.idwarehouse}`);
                }
              } catch (stockError) {
                console.error(`Error saving stock for warehouse ${warehouse.idwarehouse}:`, stockError.message);
                // Continue with other warehouses even if stock sync fails
              }
              
              savedCount++;
            } catch (warehouseError) {
              console.error(`Error saving warehouse ${warehouse.idwarehouse}:`, warehouseError.message);
              errorCount++;
            }
          }
          
          await transaction.commit();
          
          // Update sync progress if provided
          if (syncProgress) {
            await this.updateSyncProgress(syncProgress, {
              items_processed: savedCount
            });
          }
        } catch (batchError) {
          console.error(`Error processing batch ${batchNum + 1}:`, batchError.message);
          await transaction.rollback();
          errorCount += batch.length;
        }
      }
      
      console.log(`✅ Saved ${savedCount} warehouses to database (${errorCount} errors)`);
      
      // Complete sync progress if provided
      if (syncProgress) {
        await this.completeSyncProgress(syncProgress, true);
      }
      
      return {
        success: true,
        savedCount,
        errorCount,
        message: `Saved ${savedCount} warehouses to database (${errorCount} errors)`
      };
    } catch (error) {
      console.error('Error saving warehouses to database:', error.message);
      
      // Complete sync progress with failure if provided
      if (syncProgress) {
        await this.completeSyncProgress(syncProgress, false);
      }
      
      return {
        success: false,
        savedCount: 0,
        errorCount: warehouses.length,
        message: `Error saving warehouses to database: ${error.message}`
      };
    }
  }

  /**
   * Perform a full sync of all warehouses
   * @returns {Promise<Object>} - Result with success status and count
   */
  async performFullWarehousesSync() {
    try {
      console.log('Starting full warehouses sync...');
      
      // Create sync progress record
      const syncProgress = await this.createOrGetSyncProgress('warehouses', true);
      
      // Get all warehouses from Picqer
      const warehouses = await this.getAllWarehouses(null, syncProgress);
      console.log(`Retrieved ${warehouses.length} warehouses from Picqer`);
      
      // Save warehouses to database
      const result = await this.saveWarehousesToDatabase(warehouses, syncProgress);
      
      // Update last sync date
      await this.updateLastWarehousesSyncDate(new Date(), result.savedCount);
      
      return result;
    } catch (error) {
      console.error('Error performing full warehouses sync:', error.message);
      return {
        success: false,
        savedCount: 0,
        message: `Error performing full warehouses sync: ${error.message}`
      };
    }
  }

  /**
   * Perform an incremental sync of warehouses updated since last sync
   * Uses 30-day rolling window for better performance
   * @returns {Promise<Object>} - Result with success status and count
   */
  async performIncrementalWarehousesSync() {
    try {
      console.log('Starting incremental warehouses sync...');
      
      // Get last sync date
      const lastSyncDate = await this.getLastWarehousesSyncDate();
      console.log('Last warehouses sync date:', lastSyncDate.toISOString());
      
      // Create sync progress record
      const syncProgress = await this.createOrGetSyncProgress('warehouses', false);
      
      // Get warehouses updated since last sync (with 30-day rolling window)
      const warehouses = await this.getWarehousesUpdatedSince(lastSyncDate, syncProgress);
      console.log(`Retrieved ${warehouses.length} updated warehouses from Picqer`);
      
      // Save warehouses to database
      const result = await this.saveWarehousesToDatabase(warehouses, syncProgress);
      
      // Update last sync date
      await this.updateLastWarehousesSyncDate(new Date(), result.savedCount);
      
      return result;
    } catch (error) {
      console.error('Error performing incremental warehouses sync:', error.message);
      return {
        success: false,
        savedCount: 0,
        message: `Error performing incremental warehouses sync: ${error.message}`
      };
    }
  }

  /**
   * Retry a failed warehouses sync
   * @param {string} syncId - The ID of the failed sync to retry
   * @returns {Promise<Object>} - Result with success status and count
   */
  async retryFailedWarehousesSync(syncId) {
    try {
      console.log(`Retrying failed warehouses sync with ID: ${syncId}`);
      
      const pool = await sql.connect(this.sqlConfig);
      
      // Get the failed sync record
      const syncResult = await pool.request()
        .input('syncId', sql.NVarChar, syncId)
        .query(`
          SELECT * FROM SyncProgress 
          WHERE sync_id = @syncId AND entity_type = 'warehouses'
        `);
      
      if (syncResult.recordset.length === 0) {
        return {
          success: false,
          message: `No warehouses sync record found with ID: ${syncId}`
        };
      }
      
      const syncRecord = syncResult.recordset[0];
      
      // Reset sync status to in_progress
      await pool.request()
        .input('syncId', sql.NVarChar, syncId)
        .input('now', sql.DateTime, new Date().toISOString())
        .query(`
          UPDATE SyncProgress 
          SET status = 'in_progress', 
              last_updated = @now,
              completed_at = NULL
          WHERE sync_id = @syncId
        `);
      
      // Get last sync date
      const lastSyncDate = await this.getLastWarehousesSyncDate();
      
      // Get warehouses updated since last sync
      const warehouses = await this.getAllWarehouses(lastSyncDate, syncRecord);
      
      // Save warehouses to database
      const result = await this.saveWarehousesToDatabase(warehouses, syncRecord);
      
      // Update last sync date
      await this.updateLastWarehousesSyncDate(new Date(), result.savedCount);
      
      return {
        success: true,
        savedCount: result.savedCount,
        message: `Successfully retried warehouses sync: ${result.message}`
      };
    } catch (error) {
      console.error(`Error retrying warehouses sync ${syncId}:`, error.message);
      return {
        success: false,
        savedCount: 0,
        message: `Error retrying warehouses sync: ${error.message}`
      };
    }
  }
}

module.exports = WarehouseService;
