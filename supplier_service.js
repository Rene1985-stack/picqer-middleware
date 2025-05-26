/**
 * Robust SQL Parameter Supplier service with comprehensive parameter handling
 * Includes automatic schema management and parameter declaration safety:
 * 1. Automatically creates missing columns when needed
 * 2. Ensures all SQL parameters are properly declared
 * 3. Safely handles null or missing values in API responses
 * 4. Provides detailed error logging for troubleshooting
 * 5. Implements retry mechanisms for API failures
 */
const axios = require('axios');
const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');
const suppliersSchema = require('./suppliers_schema');
const syncProgressSchema = require('./sync_progress_schema');
const SchemaManager = require('./schema_manager');

class SupplierService {
  constructor(apiKey, baseUrl, sqlConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.sqlConfig = sqlConfig;
    this.batchSize = 100; // Use larger batch size for better performance
    this.schemaManager = new SchemaManager(sqlConfig);
    
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
   * Get supplier count from database
   * @returns {Promise<number>} - Number of suppliers in database
   */
  async getSupplierCountFromDatabase() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query('SELECT COUNT(*) as count FROM Suppliers');
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting supplier count from database:', error.message);
      return 0;
    }
  }

  /**
   * Get last sync date for suppliers
   * @returns {Promise<Date|null>} - Last sync date or null if never synced
   */
  async getLastSyncDate() {
    try {
      console.log('getLastSyncDate method called, using getLastSuppliersSyncDate instead');
      // If the service already has a getLastSuppliersSyncDate method, use that
      if (typeof this.getLastSuppliersSyncDate === 'function') {
        return this.getLastSuppliersSyncDate();
      }
      
      // Otherwise, implement the standard method
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query(`
        SELECT last_sync_date 
        FROM SyncStatus 
        WHERE entity_type = 'suppliers'
      `);
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      return null;
    } catch (error) {
      console.error('Error getting last sync date for suppliers:', error.message);
      return null;
    }
  }

  /**
   * Initialize the database with suppliers schema and sync progress tracking
   * @returns {Promise<boolean>} - Success status
   */
  async initializeSuppliersDatabase() {
    try {
      console.log('Initializing database with suppliers schema...');
      const pool = await sql.connect(this.sqlConfig);
      
      // Initialize schema manager
      await this.schemaManager.initialize();
      
      // Create Suppliers table
      await pool.request().query(suppliersSchema.createSuppliersTableSQL);
      
      // Create SupplierProducts table
      await pool.request().query(suppliersSchema.createSupplierProductsTableSQL);
      
      // Create SyncProgress table for resumable sync if it doesn't exist
      await pool.request().query(syncProgressSchema.createSyncProgressTableSQL);
      console.log('✅ Created/verified SyncProgress table for resumable sync functionality');
      
      // Ensure SyncStatus table exists with all required columns
      await this.schemaManager.ensureTableExists('SyncStatus', `
        CREATE TABLE SyncStatus (
          id INT IDENTITY(1,1) PRIMARY KEY,
          entity_name NVARCHAR(50) NOT NULL,
          entity_type NVARCHAR(50) NOT NULL,
          last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
          last_sync_count INT NOT NULL DEFAULT 0,
          CONSTRAINT UC_SyncStatus_entity_type UNIQUE (entity_type)
        )
      `);
      
      // Ensure all required columns exist in SyncStatus
      await this.schemaManager.ensureColumnExists('SyncStatus', 'total_count', 'INT', 'NOT NULL', '0');
      
      // Check if suppliers record exists in SyncStatus
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
          INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date, total_count, last_sync_count)
          VALUES ('suppliers', 'suppliers', '2025-01-01T00:00:00.000Z', 0, 0)
        `);
        console.log('Added suppliers record to SyncStatus table');
      }
      
      // Ensure all required columns exist in Suppliers table
      if (!(await this.schemaManager.columnExists('Suppliers', 'updated'))) {
        await this.schemaManager.ensureColumnExists('Suppliers', 'updated', 'DATETIME', 'NULL');
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
      
      throw error;
    }
  }

  /**
   * Get supplier details including products
   * @param {number} idsupplier - Supplier ID
   * @returns {Promise<Object>} - Supplier details with products
   */
  async getSupplierDetails(idsupplier) {
    try {
      console.log(`Fetching details for supplier ${idsupplier}...`);
      
      const response = await this.client.get(`/suppliers/${idsupplier}`);
      
      if (response.data) {
        console.log(`Retrieved details for supplier ${idsupplier}`);
        return response.data;
      }
      
      return null;
    } catch (error) {
      console.error(`Error fetching details for supplier ${idsupplier}:`, error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log('Rate limit hit, waiting before retrying...');
        
        // Wait for 20 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getSupplierDetails(idsupplier);
      }
      
      // Return null on error to continue with other suppliers
      return null;
    }
  }

  /**
   * Get supplier products
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
    const effectiveDate = date && date > thirtyDaysAgo ? date : thirtyDaysAgo;
    
    console.log(`Getting suppliers updated since ${effectiveDate.toISOString()}`);
    return this.getAllSuppliers(effectiveDate);
  }

  /**
   * Get last sync date for suppliers
   * @returns {Promise<Date|null>} - Last sync date or null if never synced
   */
  async getLastSuppliersSyncDate() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      const result = await pool.request().query(`
        SELECT last_sync_date 
        FROM SyncStatus 
        WHERE entity_type = 'suppliers'
      `);
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      return null;
    } catch (error) {
      console.error('Error getting last suppliers sync date:', error.message);
      return null;
    }
  }

  /**
   * Save suppliers to database
   * @param {Array} suppliers - Array of suppliers to save
   * @param {Object|null} syncProgress - Sync progress record for tracking
   * @returns {Promise<Object>} - Results of save operation
   */
  async saveSuppliersToDB(suppliers, syncProgress = null) {
    try {
      if (!suppliers || suppliers.length === 0) {
        console.log('No suppliers to save');
        return { savedSuppliers: 0, savedProducts: 0 };
      }
      
      console.log(`Saving ${suppliers.length} suppliers to database...`);
      
      const pool = await sql.connect(this.sqlConfig);
      let savedSuppliers = 0;
      let savedProducts = 0;
      let batchNumber = 0;
      
      // Process suppliers in batches for better performance
      for (let i = 0; i < suppliers.length; i += this.batchSize) {
        batchNumber++;
        const batch = suppliers.slice(i, i + this.batchSize);
        console.log(`Processing batch ${batchNumber} with ${batch.length} suppliers...`);
        
        // Update sync progress if provided
        if (syncProgress) {
          await this.updateSyncProgress(syncProgress, {
            batch_number: batchNumber,
            items_processed: i
          });
        }
        
        // Process each supplier in the batch
        for (const supplier of batch) {
          try {
            // Get supplier details
            const supplierDetails = await this.getSupplierDetails(supplier.idsupplier);
            
            if (!supplierDetails) {
              console.warn(`Could not get details for supplier ${supplier.idsupplier}, skipping`);
              continue;
            }
            
            // Save supplier to database
            await this.saveSupplierToDB(supplierDetails);
            savedSuppliers++;
            
            // Get and save supplier products
            const products = await this.getSupplierProducts(supplier.idsupplier);
            
            if (products && products.length > 0) {
              await this.saveSupplierProductsToDB(supplier.idsupplier, products);
              savedProducts += products.length;
            }
          } catch (supplierError) {
            console.error(`Error saving supplier ${supplier.idsupplier}:`, supplierError.message);
            // Continue with next supplier
          }
        }
        
        console.log(`Completed batch ${batchNumber}, saved ${savedSuppliers} suppliers so far`);
        
        // Add a small delay between batches to avoid database overload
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Update sync status
      await this.updateSyncStatus(suppliers.length);
      
      console.log(`✅ Saved ${savedSuppliers} suppliers and ${savedProducts} supplier products to database`);
      return { savedSuppliers, savedProducts };
    } catch (error) {
      console.error('Error saving suppliers to database:', error.message);
      throw error;
    }
  }

  /**
   * Save a single supplier to database
   * @param {Object} supplier - Supplier to save
   * @returns {Promise<boolean>} - Success status
   */
  async saveSupplierToDB(supplier) {
    try {
      // Validate required fields
      if (!supplier || !supplier.idsupplier) {
        console.warn('Invalid supplier data, missing idsupplier:', supplier);
        return false;
      }
      
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if supplier already exists
      const checkResult = await pool.request()
        .input('idsupplier', sql.Int, supplier.idsupplier)
        .query('SELECT id FROM Suppliers WHERE idsupplier = @idsupplier');
      
      const supplierExists = checkResult.recordset.length > 0;
      
      // Prepare request with all possible parameters
      const request = new sql.Request(pool);
      
      // Add parameters with proper null handling
      request.input('idsupplier', sql.Int, supplier.idsupplier);
      request.input('name', sql.NVarChar, supplier.name || '');
      request.input('contactname', sql.NVarChar, supplier.contactname || null);
      request.input('telephone', sql.NVarChar, supplier.telephone || null);
      request.input('email', sql.NVarChar, supplier.email || null);
      request.input('address', sql.NVarChar, supplier.address || null);
      request.input('address2', sql.NVarChar, supplier.address2 || null);
      request.input('zipcode', sql.NVarChar, supplier.zipcode || null);
      request.input('city', sql.NVarChar, supplier.city || null);
      request.input('region', sql.NVarChar, supplier.region || null);
      request.input('country', sql.NVarChar, supplier.country || null);
      request.input('customerid', sql.NVarChar, supplier.customerid || null);
      request.input('vatid', sql.NVarChar, supplier.vatid || null);
      request.input('cocid', sql.NVarChar, supplier.cocid || null);
      request.input('notes', sql.NVarChar, supplier.notes || null);
      request.input('created', sql.DateTime, supplier.created ? new Date(supplier.created) : null);
      request.input('updated', sql.DateTime, supplier.updated ? new Date(supplier.updated) : null);
      request.input('last_sync_date', sql.DateTime, new Date());
      
      if (supplierExists) {
        // Update existing supplier
        await request.query(`
          UPDATE Suppliers 
          SET 
            name = @name,
            contactname = @contactname,
            telephone = @telephone,
            email = @email,
            address = @address,
            address2 = @address2,
            zipcode = @zipcode,
            city = @city,
            region = @region,
            country = @country,
            customerid = @customerid,
            vatid = @vatid,
            cocid = @cocid,
            notes = @notes,
            created = @created,
            updated = @updated,
            last_sync_date = @last_sync_date
          WHERE idsupplier = @idsupplier
        `);
      } else {
        // Insert new supplier
        await request.query(`
          INSERT INTO Suppliers (
            idsupplier, name, contactname, telephone, email, 
            address, address2, zipcode, city, region, country,
            customerid, vatid, cocid, notes, created, updated, last_sync_date
          )
          VALUES (
            @idsupplier, @name, @contactname, @telephone, @email,
            @address, @address2, @zipcode, @city, @region, @country,
            @customerid, @vatid, @cocid, @notes, @created, @updated, @last_sync_date
          )
        `);
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving supplier ${supplier.idsupplier} to database:`, error.message);
      throw error;
    }
  }

  /**
   * Save supplier products to database
   * @param {number} idsupplier - Supplier ID
   * @param {Array} products - Array of supplier products
   * @returns {Promise<boolean>} - Success status
   */
  async saveSupplierProductsToDB(idsupplier, products) {
    try {
      if (!products || products.length === 0) {
        return true;
      }
      
      const pool = await sql.connect(this.sqlConfig);
      
      // Delete existing products for this supplier
      await pool.request()
        .input('idsupplier', sql.Int, idsupplier)
        .query('DELETE FROM SupplierProducts WHERE idsupplier = @idsupplier');
      
      // Insert new products
      for (const product of products) {
        // Skip invalid products
        if (!product || !product.idproduct) {
          console.warn('Invalid product data, missing idproduct:', product);
          continue;
        }
        
        const request = new sql.Request(pool);
        
        // Add parameters with proper null handling
        request.input('idsupplier', sql.Int, idsupplier);
        request.input('idproduct', sql.Int, product.idproduct);
        request.input('productcode_supplier', sql.NVarChar, product.productcode_supplier || null);
        request.input('name', sql.NVarChar, product.name || null);
        request.input('price', sql.Decimal(18, 2), product.price || null);
        request.input('minimum_purchase_quantity', sql.Int, product.minimum_purchase_quantity || null);
        request.input('purchase_in_quantities_of', sql.Int, product.purchase_in_quantities_of || null);
        request.input('deliverytime', sql.Int, product.deliverytime || null);
        request.input('last_sync_date', sql.DateTime, new Date());
        
        await request.query(`
          INSERT INTO SupplierProducts (
            idsupplier, idproduct, productcode_supplier, name,
            price, minimum_purchase_quantity, purchase_in_quantities_of,
            deliverytime, last_sync_date
          )
          VALUES (
            @idsupplier, @idproduct, @productcode_supplier, @name,
            @price, @minimum_purchase_quantity, @purchase_in_quantities_of,
            @deliverytime, @last_sync_date
          )
        `);
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving products for supplier ${idsupplier} to database:`, error.message);
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
        .query('SELECT COUNT(*) as count FROM Suppliers');
      
      const totalCount = countResult.recordset[0].count;
      
      // Update SyncStatus record for suppliers
      await pool.request()
        .input('entityType', sql.NVarChar, 'suppliers')
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
   * Sync suppliers from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Results of sync operation
   */
  async syncSuppliers(fullSync = false) {
    try {
      console.log(`Starting ${fullSync ? 'full' : 'incremental'} supplier sync...`);
      
      // Create sync progress record
      const syncProgress = await this.createOrGetSyncProgress('suppliers', fullSync);
      
      let suppliers;
      if (fullSync) {
        // Full sync: get all suppliers
        suppliers = await this.getAllSuppliers(null, syncProgress);
      } else {
        // Incremental sync: get suppliers updated since last sync
        const lastSyncDate = await this.getLastSuppliersSyncDate();
        suppliers = await this.getSuppliersUpdatedSince(lastSyncDate);
      }
      
      // Save suppliers to database
      const result = await this.saveSuppliersToDB(suppliers, syncProgress);
      
      // Complete sync progress
      await this.completeSyncProgress(syncProgress, true);
      
      console.log(`✅ Supplier sync completed: ${result.savedSuppliers} suppliers saved`);
      return {
        success: true,
        savedSuppliers: result.savedSuppliers,
        savedProducts: result.savedProducts
      };
    } catch (error) {
      console.error('Error in supplier sync:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = SupplierService;
