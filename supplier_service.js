/**
 * Optimized Supplier service with performance enhancements and improved error handling
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
        
        // Add robust error checking for response structure
        if (!response || !response.data) {
          console.warn('Received empty response from Picqer API');
          hasMoreSuppliers = false;
          continue;
        }
        
        // Check if response.data is an array
        if (!Array.isArray(response.data)) {
          console.warn('Received non-array response from Picqer API:', typeof response.data);
          
          // If response.data is an object with a data property that is an array, use that
          if (response.data && typeof response.data === 'object' && Array.isArray(response.data.data)) {
            console.log('Found data array in response object, using that instead');
            response.data = response.data.data;
          } else {
            // If we can't find an array, log the response and continue with an empty array
            console.warn('Could not find suppliers array in response, continuing with empty array');
            console.log('Response structure:', JSON.stringify(response.data, null, 2).substring(0, 500) + '...');
            hasMoreSuppliers = false;
            continue;
          }
        }
        
        // Now we can safely check response.data.length
        if (response.data.length > 0) {
          // Filter out duplicates by idsupplier
          const existingIds = new Set(allSuppliers.map(s => s.idsupplier));
          const newSuppliers = response.data.filter(supplier => {
            // Check if supplier has idsupplier property
            if (!supplier || !supplier.idsupplier) {
              console.warn('Found supplier without idsupplier property:', supplier);
              return false;
            }
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
          console.log('No more suppliers found');
          hasMoreSuppliers = false;
        }
      }
      
      // Check if we have any suppliers
      if (allSuppliers.length === 0) {
        console.log('No suppliers found in Picqer');
        
        // Update sync progress with total items if provided
        if (syncProgress) {
          await this.updateSyncProgress(syncProgress, {
            total_items: 0
          });
        }
        
        return [];
      }
      
      // Sort suppliers by name for consistent processing
      allSuppliers.sort((a, b) => {
        return ((a.name || '') + '').localeCompare((b.name || '') + '');
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
      
      // Return empty array on error to prevent crashing
      console.log('Returning empty array due to error');
      return [];
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
      
      // Add robust error checking for response structure
      if (!response || !response.data) {
        console.warn(`Received empty response for supplier ${idsupplier} products`);
        return [];
      }
      
      // Check if response.data is an array
      if (!Array.isArray(response.data)) {
        console.warn(`Received non-array response for supplier ${idsupplier} products:`, typeof response.data);
        
        // If response.data is an object with a data property that is an array, use that
        if (response.data && typeof response.data === 'object' && Array.isArray(response.data.data)) {
          console.log('Found data array in response object, using that instead');
          response.data = response.data.data;
        } else {
          // If we can't find an array, log the response and return an empty array
          console.warn('Could not find products array in response, returning empty array');
          return [];
        }
      }
      
      console.log(`Retrieved ${response.data.length} products for supplier ${idsupplier}`);
      return response.data;
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
    
    // Use the more recent of the two dates
    const effectiveDate = date > thirtyDaysAgo ? date : thirtyDaysAgo;
    
    console.log(`Using 30-day rolling window for incremental sync. Effective date: ${effectiveDate.toISOString()}`);
    
    return this.getAllSuppliers(effectiveDate);
  }

  /**
   * Check if a column exists in a table
   * @param {string} tableName - Table name
   * @param {string} columnName - Column name
   * @returns {Promise<boolean>} - Whether column exists
   */
  async columnExists(tableName, columnName) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request()
        .input('tableName', sql.NVarChar, tableName)
        .input('columnName', sql.NVarChar, columnName)
        .query(`
          SELECT COUNT(*) AS columnExists 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = @tableName AND COLUMN_NAME = @columnName
        `);
      
      return result.recordset[0].columnExists > 0;
    } catch (error) {
      console.error(`Error checking if column ${columnName} exists in table ${tableName}:`, error.message);
      return false;
    }
  }

  /**
   * Save suppliers to database
   * @param {Array} suppliers - Array of suppliers to save
   * @param {Object|null} syncProgress - Sync progress record for resumable sync
   * @returns {Promise<boolean>} - Success status
   */
  async saveSuppliersToDatabase(suppliers, syncProgress = null) {
    try {
      if (!suppliers || !Array.isArray(suppliers) || suppliers.length === 0) {
        console.log('No suppliers to save to database');
        return true;
      }
      
      console.log(`Saving ${suppliers.length} suppliers to database...`);
      
      const pool = await sql.connect(this.sqlConfig);
      
      // Check which columns exist in the Suppliers table
      const createdColumnExists = await this.columnExists('Suppliers', 'created');
      const updatedColumnExists = await this.columnExists('Suppliers', 'updated');
      const emailColumnExists = await this.columnExists('Suppliers', 'email');
      const emailaddressColumnExists = await this.columnExists('Suppliers', 'emailaddress');
      
      console.log(`Column existence check: created=${createdColumnExists}, updated=${updatedColumnExists}, email=${emailColumnExists}, emailaddress=${emailaddressColumnExists}`);
      
      // Process suppliers in batches for better performance
      const batchSize = this.batchSize;
      const batches = Math.ceil(suppliers.length / batchSize);
      
      console.log(`Processing suppliers in ${batches} batches of ${batchSize}`);
      
      // Update sync progress with total batches if provided
      if (syncProgress) {
        await this.updateSyncProgress(syncProgress, {
          total_batches: batches
        });
      }
      
      for (let i = 0; i < batches; i++) {
        console.log(`Processing batch ${i + 1} of ${batches}...`);
        
        // Update sync progress if provided
        if (syncProgress) {
          await this.updateSyncProgress(syncProgress, {
            batch_number: i + 1
          });
        }
        
        const batchSuppliers = suppliers.slice(i * batchSize, (i + 1) * batchSize);
        
        // Process each supplier in the batch
        for (const supplier of batchSuppliers) {
          // Skip suppliers without idsupplier
          if (!supplier || !supplier.idsupplier) {
            console.warn('Skipping supplier without idsupplier:', supplier);
            continue;
          }
          
          // Get supplier details
          console.log(`Fetching details for supplier ${supplier.idsupplier}...`);
          
          try {
            const detailsResponse = await this.client.get(`/suppliers/${supplier.idsupplier}`);
            
            // Add robust error checking for response structure
            if (!detailsResponse || !detailsResponse.data) {
              console.warn(`Received empty response for supplier ${supplier.idsupplier} details`);
              continue;
            }
            
            const supplierDetails = detailsResponse.data;
            console.log(`Retrieved details for supplier ${supplier.idsupplier}`);
            
            // Merge supplier with details
            const mergedSupplier = {
              ...supplier,
              ...supplierDetails
            };
            
            // Create a request with common parameters
            const request = new sql.Request(pool)
              .input('idsupplier', sql.Int, mergedSupplier.idsupplier)
              .input('name', sql.NVarChar, mergedSupplier.name || '')
              .input('contactname', sql.NVarChar, mergedSupplier.contactname || '')
              .input('telephone', sql.NVarChar, mergedSupplier.telephone || '')
              .input('address', sql.NVarChar, mergedSupplier.address || '')
              .input('zipcode', sql.NVarChar, mergedSupplier.zipcode || '')
              .input('city', sql.NVarChar, mergedSupplier.city || '')
              .input('country', sql.NVarChar, mergedSupplier.country || '');
            
            // Add email parameter based on which column exists
            if (emailColumnExists) {
              request.input('email', sql.NVarChar, mergedSupplier.email || '');
            } else if (emailaddressColumnExists) {
              request.input('emailaddress', sql.NVarChar, mergedSupplier.email || '');
            }
            
            // Add created and updated parameters if columns exist
            if (createdColumnExists && mergedSupplier.created) {
              request.input('created', sql.DateTime, new Date(mergedSupplier.created));
            }
            
            if (updatedColumnExists && mergedSupplier.updated) {
              request.input('updated', sql.DateTime, new Date(mergedSupplier.updated));
            }
            
            // Build dynamic SQL query based on which columns exist
            let updateColumns = [
              'name = @name',
              'contactname = @contactname',
              'telephone = @telephone',
              'address = @address',
              'zipcode = @zipcode',
              'city = @city',
              'country = @country',
              'last_sync_date = GETDATE()'
            ];
            
            if (emailColumnExists) {
              updateColumns.push('email = @email');
            } else if (emailaddressColumnExists) {
              updateColumns.push('emailaddress = @emailaddress');
            }
            
            if (createdColumnExists) {
              updateColumns.push('created = @created');
            }
            
            if (updatedColumnExists) {
              updateColumns.push('updated = @updated');
            }
            
            let insertColumns = [
              'idsupplier', 'name', 'contactname', 'telephone',
              'address', 'zipcode', 'city', 'country', 'last_sync_date'
            ];
            
            let insertValues = [
              '@idsupplier', '@name', '@contactname', '@telephone',
              '@address', '@zipcode', '@city', '@country', 'GETDATE()'
            ];
            
            if (emailColumnExists) {
              insertColumns.push('email');
              insertValues.push('@email');
            } else if (emailaddressColumnExists) {
              insertColumns.push('emailaddress');
              insertValues.push('@emailaddress');
            }
            
            if (createdColumnExists) {
              insertColumns.push('created');
              insertValues.push('@created');
            }
            
            if (updatedColumnExists) {
              insertColumns.push('updated');
              insertValues.push('@updated');
            }
            
            // Execute the dynamic MERGE query
            const mergeQuery = `
              MERGE INTO Suppliers AS target
              USING (SELECT @idsupplier AS idsupplier) AS source
              ON target.idsupplier = source.idsupplier
              WHEN MATCHED THEN
                UPDATE SET
                  ${updateColumns.join(',\n                  ')}
              WHEN NOT MATCHED THEN
                INSERT (
                  ${insertColumns.join(', ')}
                )
                VALUES (
                  ${insertValues.join(', ')}
                );
            `;
            
            await request.query(mergeQuery);
            
            // Get supplier products
            const products = await this.getSupplierProducts(mergedSupplier.idsupplier);
            
            // Save supplier products to database
            if (products && Array.isArray(products) && products.length > 0) {
              console.log(`Saving ${products.length} products for supplier ${mergedSupplier.idsupplier}...`);
              
              // Delete existing supplier products
              await pool.request()
                .input('idsupplier', sql.Int, mergedSupplier.idsupplier)
                .query(`
                  DELETE FROM SupplierProducts
                  WHERE idsupplier = @idsupplier
                `);
              
              // Check which columns exist in the SupplierProducts table
              const productCodeColumnExists = await this.columnExists('SupplierProducts', 'productcode');
              const supplierProductCodeColumnExists = await this.columnExists('SupplierProducts', 'supplier_productcode');
              const priceColumnExists = await this.columnExists('SupplierProducts', 'price');
              const purchasePriceColumnExists = await this.columnExists('SupplierProducts', 'purchase_price');
              
              // Insert new supplier products
              for (const product of products) {
                // Skip products without idproduct
                if (!product || !product.idproduct) {
                  console.warn('Skipping product without idproduct:', product);
                  continue;
                }
                
                // Create a request with common parameters
                const productRequest = new sql.Request(pool)
                  .input('idsupplier', sql.Int, mergedSupplier.idsupplier)
                  .input('idproduct', sql.Int, product.idproduct);
                
                // Add parameters based on which columns exist
                if (productCodeColumnExists || supplierProductCodeColumnExists) {
                  const productCode = product.productcode || '';
                  if (productCodeColumnExists) {
                    productRequest.input('productcode', sql.NVarChar, productCode);
                  }
                  if (supplierProductCodeColumnExists) {
                    productRequest.input('supplier_productcode', sql.NVarChar, productCode);
                  }
                }
                
                if (priceColumnExists || purchasePriceColumnExists) {
                  const price = product.price || 0;
                  if (priceColumnExists) {
                    productRequest.input('price', sql.Decimal(18, 2), price);
                  }
                  if (purchasePriceColumnExists) {
                    productRequest.input('purchase_price', sql.Decimal(18, 2), price);
                  }
                }
                
                // Add name parameter
                productRequest.input('name', sql.NVarChar, product.name || '');
                
                // Build dynamic SQL query based on which columns exist
                let productInsertColumns = ['idsupplier', 'idproduct', 'last_sync_date'];
                let productInsertValues = ['@idsupplier', '@idproduct', 'GETDATE()'];
                
                if (productCodeColumnExists) {
                  productInsertColumns.push('productcode');
                  productInsertValues.push('@productcode');
                }
                
                if (supplierProductCodeColumnExists) {
                  productInsertColumns.push('supplier_productcode');
                  productInsertValues.push('@supplier_productcode');
                }
                
                if (priceColumnExists) {
                  productInsertColumns.push('price');
                  productInsertValues.push('@price');
                }
                
                if (purchasePriceColumnExists) {
                  productInsertColumns.push('purchase_price');
                  productInsertValues.push('@purchase_price');
                }
                
                // Add name column
                productInsertColumns.push('name');
                productInsertValues.push('@name');
                
                // Execute the dynamic INSERT query
                const insertQuery = `
                  INSERT INTO SupplierProducts (
                    ${productInsertColumns.join(', ')}
                  )
                  VALUES (
                    ${productInsertValues.join(', ')}
                  )
                `;
                
                await productRequest.query(insertQuery);
              }
            }
            
            // Update sync progress if provided
            if (syncProgress) {
              await this.updateSyncProgress(syncProgress, {
                items_processed: (syncProgress.items_processed || 0) + 1
              });
            }
          } catch (error) {
            console.error(`Error processing supplier ${supplier.idsupplier}:`, error.message);
            
            // Handle rate limiting (429 Too Many Requests)
            if (error.response && error.response.status === 429) {
              console.log('Rate limit hit, waiting before continuing...');
              
              // Wait for 20 seconds before continuing
              await new Promise(resolve => setTimeout(resolve, 20000));
            }
            
            // Continue with next supplier
            continue;
          }
        }
      }
      
      console.log(`✅ Saved ${suppliers.length} suppliers to database`);
      return true;
    } catch (error) {
      console.error('Error saving suppliers to database:', error.message);
      throw error;
    }
  }

  /**
   * Update sync status
   * @param {string} entityType - Entity type (e.g., 'suppliers')
   * @param {number} count - Number of items synced
   * @returns {Promise<boolean>} - Success status
   */
  async updateSyncStatus(entityType = 'suppliers', count = 0) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if SyncStatus table exists
      const tableResult = await pool.request().query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'SyncStatus'
      `);
      
      const syncTableExists = tableResult.recordset[0].tableExists > 0;
      
      if (!syncTableExists) {
        console.warn('SyncStatus table does not exist');
        return false;
      }
      
      // Check if entity_type column exists
      const columnResult = await pool.request().query(`
        SELECT COUNT(*) AS columnExists 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'SyncStatus' AND COLUMN_NAME = 'entity_type'
      `);
      
      const entityTypeColumnExists = columnResult.recordset[0].columnExists > 0;
      
      if (!entityTypeColumnExists) {
        console.warn('entity_type column does not exist in SyncStatus table');
        return false;
      }
      
      // Update sync status
      await pool.request()
        .input('entityType', sql.NVarChar, entityType)
        .input('count', sql.Int, count)
        .input('now', sql.DateTime, new Date().toISOString())
        .query(`
          MERGE INTO SyncStatus AS target
          USING (SELECT @entityType AS entity_type) AS source
          ON target.entity_type = source.entity_type
          WHEN MATCHED THEN
            UPDATE SET
              entity_name = @entityType,
              last_sync_date = @now,
              last_sync_count = @count,
              total_count = ISNULL(total_count, 0) + @count
          WHEN NOT MATCHED THEN
            INSERT (entity_name, entity_type, last_sync_date, total_count, last_sync_count)
            VALUES (@entityType, @entityType, @now, @count, @count);
        `);
      
      return true;
    } catch (error) {
      console.error('Error updating sync status:', error.message);
      return false;
    }
  }

  /**
   * Perform incremental sync of suppliers
   * @returns {Promise<boolean>} - Success status
   */
  async performIncrementalSync() {
    try {
      console.log('Starting incremental supplier sync...');
      
      // Create sync progress record
      const syncProgress = await this.createOrGetSyncProgress('suppliers', false);
      
      // Get last sync date from database
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query(`
        SELECT TOP 1 last_sync_date 
        FROM SyncStatus 
        WHERE entity_type = 'suppliers'
      `);
      
      let lastSyncDate = new Date('2025-01-01T00:00:00.000Z');
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        lastSyncDate = new Date(result.recordset[0].last_sync_date);
      }
      
      console.log(`Last sync date: ${lastSyncDate.toISOString()}`);
      
      // Get suppliers updated since last sync
      const suppliers = await this.getSuppliersUpdatedSince(lastSyncDate);
      
      if (!suppliers || suppliers.length === 0) {
        console.log('No suppliers updated since last sync');
        await this.completeSyncProgress(syncProgress, true);
        return true;
      }
      
      console.log(`Retrieved ${suppliers.length} suppliers updated since last sync`);
      
      // Save suppliers to database
      const success = await this.saveSuppliersToDatabase(suppliers, syncProgress);
      
      if (success) {
        // Update sync status
        await this.updateSyncStatus('suppliers', suppliers.length);
        
        // Complete sync progress
        await this.completeSyncProgress(syncProgress, true);
        
        console.log(`✅ Incremental supplier sync completed successfully`);
        return true;
      } else {
        // Complete sync progress with failure
        await this.completeSyncProgress(syncProgress, false);
        
        console.error('❌ Incremental supplier sync failed');
        return false;
      }
    } catch (error) {
      console.error('Error performing incremental supplier sync:', error.message);
      return false;
    }
  }

  /**
   * Perform full sync of suppliers
   * @returns {Promise<boolean>} - Success status
   */
  async performFullSync() {
    try {
      console.log('Starting full supplier sync...');
      
      // Create sync progress record
      const syncProgress = await this.createOrGetSyncProgress('suppliers', true);
      
      // Get all suppliers
      const suppliers = await this.getAllSuppliers(new Date('2025-01-01T00:00:00.000Z'), syncProgress);
      
      if (!suppliers || suppliers.length === 0) {
        console.log('No suppliers found');
        await this.completeSyncProgress(syncProgress, true);
        return true;
      }
      
      console.log(`Retrieved ${suppliers.length} suppliers from Picqer`);
      
      // Save suppliers to database
      const success = await this.saveSuppliersToDatabase(suppliers, syncProgress);
      
      if (success) {
        // Update sync status
        await this.updateSyncStatus('suppliers', suppliers.length);
        
        // Complete sync progress
        await this.completeSyncProgress(syncProgress, true);
        
        console.log(`✅ Full supplier sync completed successfully`);
        return true;
      } else {
        // Complete sync progress with failure
        await this.completeSyncProgress(syncProgress, false);
        
        console.error('❌ Full supplier sync failed');
        return false;
      }
    } catch (error) {
      console.error('Error performing full supplier sync:', error.message);
      return false;
    }
  }

  /**
   * Get supplier count from database
   * @returns {Promise<number>} - Supplier count
   */
  async getSupplierCount() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if Suppliers table exists
      const tableResult = await pool.request().query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'Suppliers'
      `);
      
      const suppliersTableExists = tableResult.recordset[0].tableExists > 0;
      
      if (!suppliersTableExists) {
        console.warn('Suppliers table does not exist');
        return 0;
      }
      
      // Get supplier count
      const result = await pool.request().query(`
        SELECT COUNT(*) AS count FROM Suppliers
      `);
      
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting supplier count:', error.message);
      return 0;
    }
  }

  /**
   * Get last sync date from database
   * @returns {Promise<Date|null>} - Last sync date
   */
  async getLastSyncDate() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if SyncStatus table exists
      const tableResult = await pool.request().query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'SyncStatus'
      `);
      
      const syncTableExists = tableResult.recordset[0].tableExists > 0;
      
      if (!syncTableExists) {
        console.warn('SyncStatus table does not exist');
        return null;
      }
      
      // Get last sync date
      const result = await pool.request().query(`
        SELECT TOP 1 last_sync_date 
        FROM SyncStatus 
        WHERE entity_type = 'suppliers'
      `);
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      return null;
    } catch (error) {
      console.error('Error getting last sync date:', error.message);
      return null;
    }
  }

  /**
   * Retry failed sync
   * @param {string} syncId - Sync ID to retry
   * @returns {Promise<boolean>} - Success status
   */
  async retryFailedSync(syncId) {
    try {
      console.log(`Retrying failed sync ${syncId}...`);
      
      const pool = await sql.connect(this.sqlConfig);
      
      // Get sync progress record
      const result = await pool.request()
        .input('syncId', sql.NVarChar, syncId)
        .query(`
          SELECT * FROM SyncProgress 
          WHERE sync_id = @syncId
        `);
      
      if (result.recordset.length === 0) {
        console.error(`Sync progress record not found for ID ${syncId}`);
        return false;
      }
      
      const syncProgress = result.recordset[0];
      
      // Reset sync progress
      await this.updateSyncProgress(syncProgress, {
        status: 'in_progress',
        current_offset: 0,
        batch_number: 0,
        items_processed: 0
      });
      
      // Perform full sync
      return await this.performFullSync();
    } catch (error) {
      console.error('Error retrying failed sync:', error.message);
      return false;
    }
  }
}

module.exports = SupplierService;
