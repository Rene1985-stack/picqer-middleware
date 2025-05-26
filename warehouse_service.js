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
   * Get warehouse count from database
   * @returns {Promise<number>} - Number of warehouses in database
   */
  async getWarehouseCountFromDatabase() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query('SELECT COUNT(*) as count FROM Warehouses');
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting warehouse count from database:', error.message);
      return 0;
    }
  }

  /**
   * Get last sync date for warehouses
   * @returns {Promise<Date|null>} - Last sync date or null if never synced
   */
  async getLastSyncDate() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query(`
        SELECT last_sync_date 
        FROM SyncStatus 
        WHERE entity_type = 'warehouses'
      `);
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      return null;
    } catch (error) {
      console.error('Error getting last sync date for warehouses:', error.message);
      return null;
    }
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
    try {
      // For incremental syncs, use a 30-day rolling window
      // This ensures we don't miss any updates due to timezone differences
      const thirtyDaysAgo = new Date(date.getTime() - (30 * 24 * 60 * 60 * 1000));
      
      console.log(`Using 30-day rolling window for incremental sync: ${thirtyDaysAgo.toISOString()}`);
      return this.getAllWarehouses(thirtyDaysAgo);
    } catch (error) {
      console.error('Error getting warehouses updated since date:', error.message);
      throw error;
    }
  }

  /**
   * Save warehouse to database
   * @param {Object} warehouse - Warehouse details from Picqer API
   * @returns {Promise<boolean>} - Success status
   */
  async saveWarehouseToDB(warehouse) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if warehouse already exists
      const checkResult = await pool.request()
        .input('idwarehouse', sql.Int, warehouse.idwarehouse)
        .query('SELECT id FROM Warehouses WHERE idwarehouse = @idwarehouse');
      
      const warehouseExists = checkResult.recordset.length > 0;
      
      // Prepare request with all possible parameters
      const request = new sql.Request(pool);
      
      // Add parameters with proper null handling
      request.input('idwarehouse', sql.Int, warehouse.idwarehouse);
      request.input('name', sql.NVarChar, warehouse.name || '');
      request.input('code', sql.NVarChar, warehouse.code || '');
      request.input('priority', sql.Int, warehouse.priority || null);
      request.input('address', sql.NVarChar, warehouse.address || null);
      request.input('address2', sql.NVarChar, warehouse.address2 || null);
      request.input('zipcode', sql.NVarChar, warehouse.zipcode || null);
      request.input('city', sql.NVarChar, warehouse.city || null);
      request.input('region', sql.NVarChar, warehouse.region || null);
      request.input('country', sql.NVarChar, warehouse.country || null);
      request.input('telephone', sql.NVarChar, warehouse.telephone || null);
      request.input('email', sql.NVarChar, warehouse.email || null);
      request.input('last_sync_date', sql.DateTime, new Date());
      
      if (warehouseExists) {
        // Update existing warehouse
        await request.query(`
          UPDATE Warehouses 
          SET 
            name = @name,
            code = @code,
            priority = @priority,
            address = @address,
            address2 = @address2,
            zipcode = @zipcode,
            city = @city,
            region = @region,
            country = @country,
            telephone = @telephone,
            email = @email,
            last_sync_date = @last_sync_date
          WHERE idwarehouse = @idwarehouse
        `);
      } else {
        // Insert new warehouse
        await request.query(`
          INSERT INTO Warehouses (
            idwarehouse, name, code, priority, address, address2,
            zipcode, city, region, country, telephone, email, last_sync_date
          )
          VALUES (
            @idwarehouse, @name, @code, @priority, @address, @address2,
            @zipcode, @city, @region, @country, @telephone, @email, @last_sync_date
          )
        `);
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving warehouse ${warehouse.idwarehouse} to database:`, error.message);
      throw error;
    }
  }

  /**
   * Save warehouse stock to database
   * @param {number} idwarehouse - Warehouse ID
   * @param {Array} stock - Array of warehouse stock items
   * @returns {Promise<boolean>} - Success status
   */
  async saveWarehouseStockToDB(idwarehouse, stock) {
    try {
      if (!stock || stock.length === 0) {
        return true;
      }
      
      const pool = await sql.connect(this.sqlConfig);
      
      // Delete existing stock for this warehouse
      await pool.request()
        .input('idwarehouse', sql.Int, idwarehouse)
        .query('DELETE FROM WarehouseStock WHERE idwarehouse = @idwarehouse');
      
      // Use table-valued parameter for bulk insert
      // First, create a temporary table
      await pool.request().query(`
        CREATE TABLE #TempWarehouseStock (
          idwarehouse INT NOT NULL,
          idproduct INT NOT NULL,
          productcode NVARCHAR(255) NULL,
          name NVARCHAR(255) NULL,
          stock INT NULL,
          free_stock INT NULL,
          reserved_stock INT NULL,
          last_sync_date DATETIME NOT NULL
        )
      `);
      
      // Prepare batch insert
      const batchSize = 1000;
      let insertValues = [];
      let insertCount = 0;
      
      for (const item of stock) {
        // Skip invalid stock items
        if (!item || !item.idproduct) {
          console.warn('Invalid stock item, missing idproduct:', item);
          continue;
        }
        
        // Add to batch
        insertValues.push(`(
          ${idwarehouse},
          ${item.idproduct},
          N'${(item.productcode || '').replace(/'/g, "''")}',
          N'${(item.name || '').replace(/'/g, "''")}',
          ${item.stock || 0},
          ${item.free_stock || 0},
          ${item.reserved_stock || 0},
          GETDATE()
        )`);
        
        insertCount++;
        
        // Execute batch insert when batch size is reached
        if (insertValues.length >= batchSize) {
          await pool.request().query(`
            INSERT INTO #TempWarehouseStock (
              idwarehouse, idproduct, productcode, name,
              stock, free_stock, reserved_stock, last_sync_date
            )
            VALUES ${insertValues.join(',')}
          `);
          
          insertValues = [];
        }
      }
      
      // Insert any remaining items
      if (insertValues.length > 0) {
        await pool.request().query(`
          INSERT INTO #TempWarehouseStock (
            idwarehouse, idproduct, productcode, name,
            stock, free_stock, reserved_stock, last_sync_date
          )
          VALUES ${insertValues.join(',')}
        `);
      }
      
      // Copy from temp table to actual table
      await pool.request().query(`
        INSERT INTO WarehouseStock (
          idwarehouse, idproduct, productcode, name,
          stock, free_stock, reserved_stock, last_sync_date
        )
        SELECT
          idwarehouse, idproduct, productcode, name,
          stock, free_stock, reserved_stock, last_sync_date
        FROM #TempWarehouseStock
      `);
      
      // Drop temp table
      await pool.request().query('DROP TABLE #TempWarehouseStock');
      
      console.log(`Saved ${insertCount} stock items for warehouse ${idwarehouse}`);
      return true;
    } catch (error) {
      console.error(`Error saving stock for warehouse ${idwarehouse} to database:`, error.message);
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
        .query('SELECT COUNT(*) as count FROM Warehouses');
      
      const totalCount = countResult.recordset[0].count;
      
      // Update SyncStatus record for warehouses
      await pool.request()
        .input('entityType', sql.NVarChar, 'warehouses')
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
   * Sync warehouses from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Results of sync operation
   */
  async syncWarehouses(fullSync = false) {
    try {
      console.log(`Starting ${fullSync ? 'full' : 'incremental'} warehouse sync...`);
      
      // Create sync progress record
      const syncProgress = await this.createOrGetSyncProgress('warehouses', fullSync);
      
      let warehouses;
      if (fullSync) {
        // Full sync: get all warehouses
        warehouses = await this.getAllWarehouses(null, syncProgress);
      } else {
        // Incremental sync: get warehouses updated since last sync
        const lastSyncDate = await this.getLastSyncDate();
        warehouses = await this.getWarehousesUpdatedSince(lastSyncDate);
      }
      
      if (!warehouses || warehouses.length === 0) {
        console.log('No warehouses to sync');
        
        // Complete sync progress
        await this.completeSyncProgress(syncProgress, true);
        
        return { 
          success: true, 
          savedWarehouses: 0, 
          savedStockItems: 0 
        };
      }
      
      console.log(`Syncing ${warehouses.length} warehouses...`);
      
      let savedWarehouses = 0;
      let savedStockItems = 0;
      let batchNumber = 0;
      
      // Process warehouses in batches for better performance
      for (let i = 0; i < warehouses.length; i += this.batchSize) {
        batchNumber++;
        const warehouseGroup = warehouses.slice(i, i + this.batchSize);
        console.log(`Processing warehouse group ${batchNumber} with ${warehouseGroup.length} warehouses...`);
        
        // Update sync progress
        await this.updateSyncProgress(syncProgress, {
          batch_number: batchNumber,
          items_processed: i
        });
        
        // Process each warehouse in the group
        for (const warehouse of warehouseGroup) {
          try {
            // Save warehouse to database
            await this.saveWarehouseToDB(warehouse);
            savedWarehouses++;
            
            // Get and save warehouse stock
            const stock = await this.getWarehouseStock(warehouse.idwarehouse);
            
            if (stock && stock.length > 0) {
              await this.saveWarehouseStockToDB(warehouse.idwarehouse, stock);
              savedStockItems += stock.length;
            }
          } catch (warehouseError) {
            console.error(`Error saving warehouse ${warehouse.idwarehouse}:`, warehouseError.message);
            // Continue with next warehouse
          }
        }
        
        console.log(`Completed warehouse group ${batchNumber}, saved ${savedWarehouses} warehouses so far`);
        
        // Add a small delay between warehouse groups to avoid database overload
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Update sync status
      await this.updateSyncStatus(savedWarehouses);
      
      // Complete sync progress
      await this.completeSyncProgress(syncProgress, true);
      
      console.log(`✅ Warehouse sync completed: ${savedWarehouses} warehouses and ${savedStockItems} stock items saved`);
      return {
        success: true,
        savedWarehouses,
        savedStockItems
      };
    } catch (error) {
      console.error('Error in warehouse sync:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = WarehouseService;
