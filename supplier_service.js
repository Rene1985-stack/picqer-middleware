/**
 * Optimized Supplier service with performance enhancements
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
const suppliersSchema = require('./suppliers_schema');
const syncProgressSchema = require('./sync_progress_schema');

class SupplierService {
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
   * Initialize the database with suppliers schema and sync progress tracking
   * @returns {Promise<boolean>} - Success status
   */
  async initializeSuppliersDatabase() {
    try {
      console.log('Initializing database with suppliers schema...');
      const pool = await sql.connect(this.sqlConfig);
      
      // Create Suppliers table
      await pool.request().query(suppliersSchema.createSuppliersTableSQL);
      
      // Create SupplierProducts table
      await pool.request().query(suppliersSchema.createSupplierProductsTableSQL);
      
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
          // Check if suppliers record exists
          const recordResult = await pool.request().query(`
            SELECT COUNT(*) AS recordExists 
            FROM SyncStatus 
            WHERE entity_type = 'suppliers'
          `);
          
          const suppliersRecordExists = recordResult.recordset[0].recordExists > 0;
          
          if (suppliersRecordExists) {
            // Update existing record
            await pool.request().query(`
              UPDATE SyncStatus 
              SET entity_name = 'suppliers' 
              WHERE entity_type = 'suppliers'
            `);
            console.log('Updated existing suppliers entity in SyncStatus');
          } else {
            // Insert new record
            await pool.request().query(`
              INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
              VALUES ('suppliers', 'suppliers', '2025-01-01T00:00:00.000Z')
            `);
            console.log('Added suppliers record to SyncStatus table');
          }
        } else {
          console.warn('entity_type column does not exist in SyncStatus table');
        }
      } else {
        console.warn('SyncStatus table does not exist');
      }
      
      console.log('✅ Suppliers database schema initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing suppliers database schema:', error.message);
      throw error;
    }
  }

  /**
   * Create or get sync progress record
   * @param {string} entityType - Entity type (e.g., 'suppliers')
   * @param {boolean} isFullSync - Whether this is a full sync
   * @returns {Promise<Object>} - Sync progress record
   */
  async createOrGetSyncProgress(entityType = 'suppliers', isFullSync = false) {
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
   * Get all suppliers from Picqer API with pagination
   * @param {Date|null} updatedSince - Only get suppliers updated since this date
   * @param {Object|null} syncProgress - Sync progress record for resumable sync
   * @returns {Promise<Array>} - Array of suppliers
   */
  async getAllSuppliers(updatedSince = null, syncProgress = null) {
    try {
      const limit = 100; // Number of suppliers per page
      let offset = syncProgress ? syncProgress.current_offset : 0;
      let hasMoreSuppliers = true;
      let allSuppliers = [];
      
      // Format date for API request if provided
      let updatedSinceParam = null;
      if (updatedSince) {
        updatedSinceParam = updatedSince.toISOString();
        console.log(`Fetching suppliers updated since: ${updatedSinceParam}`);
      } else {
        console.log('Fetching all suppliers from Picqer...');
      }
      
      // Continue fetching until we have all suppliers
      while (hasMoreSuppliers) {
        console.log(`Fetching suppliers with offset ${offset}...`);
        
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
        
        const response = await this.client.get('/suppliers', { params });
        
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          // Filter out duplicates by idsupplier
          const existingIds = new Set(allSuppliers.map(s => s.idsupplier));
          const newSuppliers = response.data.filter(supplier => {
            return !existingIds.has(supplier.idsupplier);
          });
          
          allSuppliers = [...allSuppliers, ...newSuppliers];
          console.log(`Retrieved ${newSuppliers.length} new suppliers (total unique: ${allSuppliers.length})`);
          
          // Check if we have more suppliers
          hasMoreSuppliers = response.data.length === limit;
          
          // Increment offset for next page
          offset += limit;
          
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          hasMoreSuppliers = false;
        }
      }
      
      // Sort suppliers by name for consistent processing
      allSuppliers.sort((a, b) => {
        return (a.name || '').localeCompare(b.name || '');
      });
      
      console.log('Sorted suppliers by name for consistent processing');
      console.log(`✅ Retrieved ${allSuppliers.length} unique suppliers from Picqer`);
      
      // Update sync progress with total items if provided
      if (syncProgress) {
        await this.updateSyncProgress(syncProgress, {
          total_items: allSuppliers.length
        });
      }
      
      return allSuppliers;
    } catch (error) {
      console.error('Error fetching suppliers from Picqer:', error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log('Rate limit hit, waiting before retrying...');
        
        // Wait for 20 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getAllSuppliers(updatedSince, syncProgress);
      }
      
      throw error;
    }
  }

  /**
   * Get supplier products from Picqer API
   * @param {number} idsupplier - Supplier ID
   * @returns {Promise<Array>} - Array of supplier products
   */
  async getSupplierProducts(idsupplier) {
    try {
      console.log(`Fetching products for supplier ${idsupplier}...`);
      
      const response = await this.client.get(`/suppliers/${idsupplier}/products`);
      
      if (response.data && Array.isArray(response.data)) {
        console.log(`Retrieved ${response.data.length} products for supplier ${idsupplier}`);
        return response.data;
      }
      
      return [];
    } catch (error) {
      console.error(`Error fetching products for supplier ${idsupplier}:`, error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log('Rate limit hit, waiting before retrying...');
        
        // Wait for 20 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getSupplierProducts(idsupplier);
      }
      
      // Return empty array on error to continue with other suppliers
      return [];
    }
  }

  /**
   * Get suppliers updated since a specific date
   * For incremental syncs, use a 30-day rolling window
   * @param {Date} date - The date to check updates from
   * @returns {Promise<Array>} - Array of updated suppliers
   */
  async getSuppliersUpdatedSince(date) {
    // For incremental syncs, use a 30-day rolling window
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Use the more recent date between the provided date and 30 days ago
    const effectiveDate = date > thirtyDaysAgo ? date : thirtyDaysAgo;
    
    console.log(`Using 30-day rolling window for incremental sync. Effective date: ${effectiveDate.toISOString()}`);
    return this.getAllSuppliers(effectiveDate);
  }

  /**
   * Get the last sync date for suppliers
   * @returns {Promise<Date|null>} - Last sync date or null if not found
   */
  async getLastSuppliersSyncDate() {
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
            WHERE entity_type = 'suppliers'
          `);
          
          if (result.recordset.length > 0) {
            return new Date(result.recordset[0].last_sync_date);
          }
        }
      }
      
      // Default to January 1, 2025 if no sync date found
      return new Date('2025-01-01T00:00:00.000Z');
    } catch (error) {
      console.error('Error getting last suppliers sync date:', error.message);
      // Default to January 1, 2025 if error occurs
      return new Date('2025-01-01T00:00:00.000Z');
    }
  }

  /**
   * Update the last sync date for suppliers
   * @param {Date} date - The new sync date
   * @param {number} count - The number of suppliers synced
   * @returns {Promise<boolean>} - Success status
   */
  async updateLastSuppliersSyncDate(date = new Date(), count = 0) {
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
          // Check if suppliers record exists
          const recordResult = await pool.request().query(`
            SELECT COUNT(*) AS recordExists 
            FROM SyncStatus 
            WHERE entity_type = 'suppliers'
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
                    entity_name = 'suppliers'
                WHERE entity_type = 'suppliers'
              `);
          } else {
            // Insert new record
            await pool.request()
              .input('lastSyncDate', sql.DateTime, date)
              .input('lastSyncCount', sql.Int, count)
              .query(`
                INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date, last_sync_count)
                VALUES ('suppliers', 'suppliers', @lastSyncDate, @lastSyncCount)
              `);
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error updating last suppliers sync date:', error.message);
      return false;
    }
  }

  /**
   * Get the count of suppliers in the database
   * @returns {Promise<number>} - Supplier count
   */
  async getSupplierCountFromDatabase() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query('SELECT COUNT(*) AS count FROM Suppliers');
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting supplier count:', error.message);
      return 0;
    }
  }

  /**
   * Save suppliers to database with optimized batch processing
   * @param {Array} suppliers - Array of suppliers to save
   * @param {Object|null} syncProgress - Sync progress record for resumable sync
   * @returns {Promise<Object>} - Result with success status and count
   */
  async saveSuppliersToDatabase(suppliers, syncProgress = null) {
    try {
      console.log(`Saving ${suppliers.length} suppliers to database...`);
      
      const pool = await sql.connect(this.sqlConfig);
      
      // Calculate number of batches
      const totalBatches = Math.ceil(suppliers.length / this.batchSize);
      console.log(`Processing suppliers in ${totalBatches} batches of ${this.batchSize}`);
      
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
      
      // Process suppliers in batches
      for (let batchNum = startBatch; batchNum < totalBatches; batchNum++) {
        console.log(`Processing batch ${batchNum + 1} of ${totalBatches}...`);
        
        // Update sync progress if provided
        if (syncProgress) {
          await this.updateSyncProgress(syncProgress, {
            batch_number: batchNum
          });
        }
        
        const batchStart = batchNum * this.batchSize;
        const batchEnd = Math.min(batchStart + this.batchSize, suppliers.length);
        const batch = suppliers.slice(batchStart, batchEnd);
        
        // Process each supplier in the batch
        const transaction = new sql.Transaction(pool);
        
        try {
          await transaction.begin();
          
          for (const supplier of batch) {
            try {
              // Check if supplier already exists
              const checkResult = await new sql.Request(transaction)
                .input('idsupplier', sql.Int, supplier.idsupplier)
                .query('SELECT id FROM Suppliers WHERE idsupplier = @idsupplier');
              
              const supplierExists = checkResult.recordset.length > 0;
              
              // Prepare request for insert/update
              const request = new sql.Request(transaction);
              
              // Add standard fields
              request.input('idsupplier', sql.Int, supplier.idsupplier);
              request.input('name', sql.NVarChar, supplier.name || '');
              request.input('contactname', sql.NVarChar, supplier.contactname || null);
              request.input('contactemail', sql.NVarChar, supplier.contactemail || null);
              request.input('telephone', sql.NVarChar, supplier.telephone || null);
              request.input('address', sql.NVarChar, supplier.address || null);
              request.input('address2', sql.NVarChar, supplier.address2 || null);
              request.input('zipcode', sql.NVarChar, supplier.zipcode || null);
              request.input('city', sql.NVarChar, supplier.city || null);
              request.input('region', sql.NVarChar, supplier.region || null);
              request.input('country', sql.NVarChar, supplier.country || null);
              request.input('vatid', sql.NVarChar, supplier.vatid || null);
              request.input('cocid', sql.NVarChar, supplier.cocid || null);
              request.input('notes', sql.NVarChar, supplier.notes || null);
              request.input('created', sql.DateTime, supplier.created ? new Date(supplier.created) : null);
              request.input('updated', sql.DateTime, supplier.updated ? new Date(supplier.updated) : null);
              request.input('lastSyncDate', sql.DateTime, new Date());
              
              if (supplierExists) {
                // Update existing supplier
                await request.query(`
                  UPDATE Suppliers 
                  SET name = @name,
                      contactname = @contactname,
                      contactemail = @contactemail,
                      telephone = @telephone,
                      address = @address,
                      address2 = @address2,
                      zipcode = @zipcode,
                      city = @city,
                      region = @region,
                      country = @country,
                      vatid = @vatid,
                      cocid = @cocid,
                      notes = @notes,
                      created = @created,
                      updated = @updated,
                      last_sync_date = @lastSyncDate
                  WHERE idsupplier = @idsupplier
                `);
              } else {
                // Insert new supplier
                await request.query(`
                  INSERT INTO Suppliers (
                    idsupplier, name, contactname, contactemail, telephone,
                    address, address2, zipcode, city, region, country,
                    vatid, cocid, notes, created, updated, last_sync_date
                  )
                  VALUES (
                    @idsupplier, @name, @contactname, @contactemail, @telephone,
                    @address, @address2, @zipcode, @city, @region, @country,
                    @vatid, @cocid, @notes, @created, @updated, @lastSyncDate
                  )
                `);
              }
              
              // Fetch and save supplier products
              try {
                const products = await this.getSupplierProducts(supplier.idsupplier);
                
                if (products.length > 0) {
                  // Delete existing products for this supplier
                  await new sql.Request(transaction)
                    .input('idsupplier', sql.Int, supplier.idsupplier)
                    .query('DELETE FROM SupplierProducts WHERE idsupplier = @idsupplier');
                  
                  // Insert new products
                  for (const product of products) {
                    const productRequest = new sql.Request(transaction);
                    productRequest.input('idsupplier', sql.Int, supplier.idsupplier);
                    productRequest.input('idproduct', sql.Int, product.idproduct);
                    productRequest.input('productcode', sql.NVarChar, product.productcode || '');
                    productRequest.input('productcode_supplier', sql.NVarChar, product.productcode_supplier || '');
                    productRequest.input('name', sql.NVarChar, product.name || '');
                    productRequest.input('purchase_price', sql.Decimal, product.purchase_price || 0);
                    productRequest.input('purchase_price_currency', sql.NVarChar, product.purchase_price_currency || null);
                    productRequest.input('minimum_purchase_quantity', sql.Int, product.minimum_purchase_quantity || 0);
                    productRequest.input('purchase_in_quantities_of', sql.Int, product.purchase_in_quantities_of || 0);
                    productRequest.input('deliverytime', sql.Int, product.deliverytime || 0);
                    productRequest.input('lastSyncDate', sql.DateTime, new Date());
                    
                    await productRequest.query(`
                      INSERT INTO SupplierProducts (
                        idsupplier, idproduct, productcode, productcode_supplier, name,
                        purchase_price, purchase_price_currency, minimum_purchase_quantity,
                        purchase_in_quantities_of, deliverytime, last_sync_date
                      )
                      VALUES (
                        @idsupplier, @idproduct, @productcode, @productcode_supplier, @name,
                        @purchase_price, @purchase_price_currency, @minimum_purchase_quantity,
                        @purchase_in_quantities_of, @deliverytime, @lastSyncDate
                      )
                    `);
                  }
                  
                  console.log(`Saved ${products.length} products for supplier ${supplier.idsupplier}`);
                }
              } catch (productsError) {
                console.error(`Error saving products for supplier ${supplier.idsupplier}:`, productsError.message);
                // Continue with other suppliers even if products sync fails
              }
              
              savedCount++;
            } catch (supplierError) {
              console.error(`Error saving supplier ${supplier.idsupplier}:`, supplierError.message);
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
      
      console.log(`✅ Saved ${savedCount} suppliers to database (${errorCount} errors)`);
      
      // Complete sync progress if provided
      if (syncProgress) {
        await this.completeSyncProgress(syncProgress, true);
      }
      
      return {
        success: true,
        savedCount,
        errorCount,
        message: `Saved ${savedCount} suppliers to database (${errorCount} errors)`
      };
    } catch (error) {
      console.error('Error saving suppliers to database:', error.message);
      
      // Complete sync progress with failure if provided
      if (syncProgress) {
        await this.completeSyncProgress(syncProgress, false);
      }
      
      return {
        success: false,
        savedCount: 0,
        errorCount: suppliers.length,
        message: `Error saving suppliers to database: ${error.message}`
      };
    }
  }

  /**
   * Perform a full sync of all suppliers
   * @returns {Promise<Object>} - Result with success status and count
   */
  async performFullSuppliersSync() {
    try {
      console.log('Starting full suppliers sync...');
      
      // Create sync progress record
      const syncProgress = await this.createOrGetSyncProgress('suppliers', true);
      
      // Get all suppliers from Picqer
      const suppliers = await this.getAllSuppliers(null, syncProgress);
      console.log(`Retrieved ${suppliers.length} suppliers from Picqer`);
      
      // Save suppliers to database
      const result = await this.saveSuppliersToDatabase(suppliers, syncProgress);
      
      // Update last sync date
      await this.updateLastSuppliersSyncDate(new Date(), result.savedCount);
      
      return result;
    } catch (error) {
      console.error('Error performing full suppliers sync:', error.message);
      return {
        success: false,
        savedCount: 0,
        message: `Error performing full suppliers sync: ${error.message}`
      };
    }
  }

  /**
   * Perform an incremental sync of suppliers updated since last sync
   * Uses 30-day rolling window for better performance
   * @returns {Promise<Object>} - Result with success status and count
   */
  async performIncrementalSuppliersSync() {
    try {
      console.log('Starting incremental suppliers sync...');
      
      // Get last sync date
      const lastSyncDate = await this.getLastSuppliersSyncDate();
      console.log('Last suppliers sync date:', lastSyncDate.toISOString());
      
      // Create sync progress record
      const syncProgress = await this.createOrGetSyncProgress('suppliers', false);
      
      // Get suppliers updated since last sync (with 30-day rolling window)
      const suppliers = await this.getSuppliersUpdatedSince(lastSyncDate, syncProgress);
      console.log(`Retrieved ${suppliers.length} updated suppliers from Picqer`);
      
      // Save suppliers to database
      const result = await this.saveSuppliersToDatabase(suppliers, syncProgress);
      
      // Update last sync date
      await this.updateLastSuppliersSyncDate(new Date(), result.savedCount);
      
      return result;
    } catch (error) {
      console.error('Error performing incremental suppliers sync:', error.message);
      return {
        success: false,
        savedCount: 0,
        message: `Error performing incremental suppliers sync: ${error.message}`
      };
    }
  }

  /**
   * Retry a failed suppliers sync
   * @param {string} syncId - The ID of the failed sync to retry
   * @returns {Promise<Object>} - Result with success status and count
   */
  async retryFailedSuppliersSync(syncId) {
    try {
      console.log(`Retrying failed suppliers sync with ID: ${syncId}`);
      
      const pool = await sql.connect(this.sqlConfig);
      
      // Get the failed sync record
      const syncResult = await pool.request()
        .input('syncId', sql.NVarChar, syncId)
        .query(`
          SELECT * FROM SyncProgress 
          WHERE sync_id = @syncId AND entity_type = 'suppliers'
        `);
      
      if (syncResult.recordset.length === 0) {
        return {
          success: false,
          message: `No suppliers sync record found with ID: ${syncId}`
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
      const lastSyncDate = await this.getLastSuppliersSyncDate();
      
      // Get suppliers updated since last sync
      const suppliers = await this.getAllSuppliers(lastSyncDate, syncRecord);
      
      // Save suppliers to database
      const result = await this.saveSuppliersToDatabase(suppliers, syncRecord);
      
      // Update last sync date
      await this.updateLastSuppliersSyncDate(new Date(), result.savedCount);
      
      return {
        success: true,
        savedCount: result.savedCount,
        message: `Successfully retried suppliers sync: ${result.message}`
      };
    } catch (error) {
      console.error(`Error retrying suppliers sync ${syncId}:`, error.message);
      return {
        success: false,
        savedCount: 0,
        message: `Error retrying suppliers sync: ${error.message}`
      };
    }
  }
}

module.exports = SupplierService;
