/**
 * Optimized Product service with performance enhancements
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
const syncProgressSchema = require('./sync_progress_schema');

class PicqerService {
  constructor(apiKey, baseUrl, sqlConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.sqlConfig = sqlConfig;
    this.batchSize = 100; // Increased from 50 to 100 for better performance
    
    console.log('Initializing PicqerService with:');
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
   * Get product count from database
   * @returns {Promise<number>} - Number of products in database
   */
  async getProductCountFromDatabase() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query('SELECT COUNT(*) as count FROM Products');
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting product count from database:', error.message);
      return 0;
    }
  }

  /**
   * Get last sync date for products
   * @returns {Promise<Date|null>} - Last sync date or null if never synced
   */
  async getLastSyncDate() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query(`
        SELECT last_sync_date 
        FROM SyncStatus 
        WHERE entity_type = 'products'
      `);
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      return null;
    } catch (error) {
      console.error('Error getting last sync date for products:', error.message);
      return null;
    }
  }

  /**
   * Initialize the database with expanded product schema and sync progress tracking
   * @returns {Promise<boolean>} - Success status
   */
  async initializeDatabase() {
    try {
      console.log('Initializing database with expanded product schema...');
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if Products table exists
      const tableResult = await pool.request().query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'Products'
      `);
      
      const productsTableExists = tableResult.recordset[0].tableExists > 0;
      
      if (!productsTableExists) {
        // Create Products table if it doesn't exist
        console.log('Creating Products table...');
        await pool.request().query(`
          CREATE TABLE Products (
            id INT IDENTITY(1,1) PRIMARY KEY,
            idproduct INT NOT NULL,
            productcode NVARCHAR(100) NOT NULL,
            name NVARCHAR(255) NOT NULL,
            price DECIMAL(18,2) NULL,
            stock INT NULL,
            created DATETIME NULL,
            updated DATETIME NULL,
            last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
            CONSTRAINT UC_Products_idproduct UNIQUE (idproduct)
          );
          
          CREATE INDEX IX_Products_productcode ON Products(productcode);
          CREATE INDEX IX_Products_updated ON Products(updated);
        `);
      }
      
      // Check if SyncStatus table exists
      const syncTableResult = await pool.request().query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'SyncStatus'
      `);
      
      const syncTableExists = syncTableResult.recordset[0].tableExists > 0;
      
      if (!syncTableExists) {
        // Create SyncStatus table if it doesn't exist
        console.log('Creating SyncStatus table...');
        await pool.request().query(`
          CREATE TABLE SyncStatus (
            id INT IDENTITY(1,1) PRIMARY KEY,
            entity_name NVARCHAR(50) NOT NULL,
            entity_type NVARCHAR(50) NOT NULL DEFAULT 'products',
            last_sync_date DATETIME NOT NULL,
            total_count INT NULL,
            last_sync_count INT NULL,
            CONSTRAINT UC_SyncStatus_entity_name UNIQUE (entity_name),
            CONSTRAINT UC_SyncStatus_entity_type UNIQUE (entity_type)
          );
          
          -- Insert initial record for products
          INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
          VALUES ('products', 'products', '2025-01-01T00:00:00.000Z');
        `);
      } else {
        // Check if entity_name column exists in SyncStatus table
        try {
          const columnResult = await pool.request().query(`
            SELECT COUNT(*) AS columnExists 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'SyncStatus' AND COLUMN_NAME = 'entity_name'
          `);
          
          const entityNameColumnExists = columnResult.recordset[0].columnExists > 0;
          
          if (!entityNameColumnExists) {
            // Add entity_name column if it doesn't exist
            console.log('Adding entity_name column to SyncStatus table...');
            try {
              await pool.request().query(`
                ALTER TABLE SyncStatus 
                ADD entity_name NVARCHAR(50) NOT NULL DEFAULT 'products'
              `);
              
              // Add unique constraint in a separate statement
              try {
                await pool.request().query(`
                  ALTER TABLE SyncStatus 
                  ADD CONSTRAINT UC_SyncStatus_entity_name UNIQUE (entity_name)
                `);
              } catch (constraintError) {
                console.warn('Error adding constraint:', constraintError.message);
                // Continue even if constraint creation fails
              }
            } catch (alterError) {
              console.warn('Error adding entity_name column:', alterError.message);
              // Continue even if column addition fails
            }
          }
          
          // Check if entity_type column exists
          const entityTypeResult = await pool.request().query(`
            SELECT COUNT(*) AS columnExists 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'SyncStatus' AND COLUMN_NAME = 'entity_type'
          `);
          
          const entityTypeColumnExists = entityTypeResult.recordset[0].columnExists > 0;
          
          if (!entityTypeColumnExists) {
            // Add entity_type column if it doesn't exist
            console.log('Adding entity_type column to SyncStatus table...');
            try {
              await pool.request().query(`
                ALTER TABLE SyncStatus 
                ADD entity_type NVARCHAR(50) NOT NULL DEFAULT 'products'
              `);
              
              // Add unique constraint in a separate statement
              try {
                await pool.request().query(`
                  ALTER TABLE SyncStatus 
                  ADD CONSTRAINT UC_SyncStatus_entity_type UNIQUE (entity_type)
                `);
              } catch (constraintError) {
                console.warn('Error adding constraint:', constraintError.message);
                // Continue even if constraint creation fails
              }
            } catch (alterError) {
              console.warn('Error adding entity_type column:', alterError.message);
              // Continue even if column addition fails
            }
          }
          
          // Check if products record exists in SyncStatus
          const productsRecordResult = await pool.request().query(`
            SELECT COUNT(*) AS recordExists 
            FROM SyncStatus 
            WHERE entity_type = 'products'
          `);
          
          const productsRecordExists = productsRecordResult.recordset[0].recordExists > 0;
          
          if (!productsRecordExists) {
            // Insert products record if it doesn't exist
            console.log('Adding products record to SyncStatus table...');
            try {
              await pool.request().query(`
                INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
                VALUES ('products', 'products', '2025-01-01T00:00:00.000Z')
              `);
              console.log('Added products record to SyncStatus table');
            } catch (insertError) {
              console.warn('Error adding products record:', insertError.message);
              // Continue even if record insertion fails
            }
          } else {
            console.log('Updated existing products entity in SyncStatus');
          }
        } catch (columnError) {
          console.warn('Error checking for entity_name column:', columnError.message);
          // Continue initialization even if column check fails
        }
      }
      
      // Create SyncProgress table for resumable sync
      await pool.request().query(syncProgressSchema.createSyncProgressTableSQL);
      console.log('✅ Created SyncProgress table for resumable sync functionality');
      
      // Ensure all expanded product columns exist
      await this.ensureProductColumnsExist();
      
      console.log('✅ Database initialized successfully with expanded schema');
      return true;
    } catch (error) {
      console.error('❌ Error initializing database:', error.message);
      throw error;
    }
  }

  /**
   * Ensure all expanded product columns exist in the Products table
   * @returns {Promise<boolean>} - Success status
   */
  async ensureProductColumnsExist() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Define all columns that should be in the expanded Products table
      const columns = [
        { name: 'idvatgroup', type: 'INT', nullable: true },
        { name: 'fixedstockprice', type: 'DECIMAL(18,2)', nullable: true },
        { name: 'idsupplier', type: 'INT', nullable: true },
        { name: 'productcode_supplier', type: 'NVARCHAR(100)', nullable: true },
        { name: 'deliverytime', type: 'INT', nullable: true },
        { name: 'description', type: 'NVARCHAR(MAX)', nullable: true },
        { name: 'barcode', type: 'NVARCHAR(100)', nullable: true },
        { name: 'type', type: 'NVARCHAR(50)', nullable: true },
        { name: 'unlimitedstock', type: 'BIT', nullable: true },
        { name: 'weight', type: 'INT', nullable: true },
        { name: 'length', type: 'INT', nullable: true },
        { name: 'width', type: 'INT', nullable: true },
        { name: 'height', type: 'INT', nullable: true },
        { name: 'minimum_purchase_quantity', type: 'INT', nullable: true },
        { name: 'purchase_in_quantities_of', type: 'INT', nullable: true },
        { name: 'hs_code', type: 'NVARCHAR(50)', nullable: true },
        { name: 'country_of_origin', type: 'NVARCHAR(2)', nullable: true },
        { name: 'active', type: 'BIT', nullable: true },
        { name: 'idfulfilment_customer', type: 'INT', nullable: true },
        { name: 'analysis_pick_amount_per_day', type: 'FLOAT', nullable: true },
        { name: 'analysis_abc_classification', type: 'NVARCHAR(1)', nullable: true },
        { name: 'pricelists', type: 'NVARCHAR(MAX)', nullable: true },
        { name: 'tags', type: 'NVARCHAR(MAX)', nullable: true },
        { name: 'productfields', type: 'NVARCHAR(MAX)', nullable: true },
        { name: 'images', type: 'NVARCHAR(MAX)', nullable: true }
      ];
      
      // Get existing columns in Products table
      const existingColumnsResult = await pool.request().query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Products'
      `);
      
      const existingColumns = existingColumnsResult.recordset.map(row => row.COLUMN_NAME.toLowerCase());
      console.log(`Found ${existingColumns.length} existing columns in Products table`);
      
      // Add missing columns
      for (const column of columns) {
        if (!existingColumns.includes(column.name.toLowerCase())) {
          console.log(`Adding missing column: ${column.name}`);
          
          const nullableText = column.nullable ? 'NULL' : 'NOT NULL';
          
          try {
            await pool.request().query(`
              ALTER TABLE Products 
              ADD ${column.name} ${column.type} ${nullableText}
            `);
            console.log(`✅ Added column ${column.name} to Products table`);
          } catch (error) {
            console.error(`❌ Error adding column ${column.name}:`, error.message);
            // Continue with other columns even if one fails
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error ensuring product columns exist:', error.message);
      throw error;
    }
  }

  /**
   * Create or get sync progress record
   * @param {string} entityType - Entity type (e.g., 'products')
   * @param {boolean} isFullSync - Whether this is a full sync
   * @returns {Promise<Object>} - Sync progress record
   */
  async createOrGetSyncProgress(entityType = 'products', isFullSync = false) {
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
   * Get all products from Picqer API with pagination
   * @param {Date|null} updatedSince - Only get products updated since this date
   * @param {Object|null} syncProgress - Sync progress record for resumable sync
   * @returns {Promise<Array>} - Array of products
   */
  async getAllProducts(updatedSince = null, syncProgress = null) {
    try {
      const limit = 100; // Number of products per page
      let offset = syncProgress ? syncProgress.current_offset : 0;
      let hasMoreProducts = true;
      let allProducts = [];
      
      // Format date for API request if provided
      let updatedSinceParam = null;
      if (updatedSince) {
        updatedSinceParam = updatedSince.toISOString();
        console.log(`Fetching products updated since: ${updatedSinceParam}`);
      } else {
        console.log('Fetching all products from Picqer...');
      }
      
      // Continue fetching until we have all products
      while (hasMoreProducts) {
        console.log(`Fetching products with offset ${offset}...`);
        
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
        
        const response = await this.client.get('/products', { params });
        
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          // Filter out duplicates by idproduct
          const existingIds = new Set(allProducts.map(p => p.idproduct));
          const newProducts = response.data.filter(product => {
            return !existingIds.has(product.idproduct);
          });
          
          allProducts = [...allProducts, ...newProducts];
          console.log(`Retrieved ${newProducts.length} new products (total unique: ${allProducts.length})`);
          
          // Check if we have more products
          hasMoreProducts = response.data.length === limit;
          
          // Increment offset for next page
          offset += limit;
          
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          hasMoreProducts = false;
        }
      }
      
      // Sort products by updated date in descending order (newest first)
      allProducts.sort((a, b) => {
        const dateA = a.updated ? new Date(a.updated) : new Date(0);
        const dateB = b.updated ? new Date(b.updated) : new Date(0);
        return dateB - dateA; // Descending order (newest first)
      });
      
      console.log('Sorted products with most recently updated first for priority processing');
      console.log(`✅ Retrieved ${allProducts.length} unique products from Picqer`);
      
      // Update sync progress with total items if provided
      if (syncProgress) {
        await this.updateSyncProgress(syncProgress, {
          total_items: allProducts.length
        });
      }
      
      return allProducts;
    } catch (error) {
      console.error('Error fetching products from Picqer:', error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log('Rate limit hit, waiting before retrying...');
        
        // Wait for 20 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getAllProducts(updatedSince, syncProgress);
      }
      
      throw error;
    }
  }

  /**
   * Get products updated since a specific date
   * For incremental syncs, use a 30-day rolling window
   * @param {Date} date - The date to check updates from
   * @returns {Promise<Array>} - Array of updated products
   */
  async getProductsUpdatedSince(date) {
    // For incremental syncs, use a 30-day rolling window
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Use the more recent date between the provided date and 30 days ago
    const effectiveDate = date && date > thirtyDaysAgo ? date : thirtyDaysAgo;
    
    console.log(`Getting products updated since ${effectiveDate.toISOString()}`);
    return this.getAllProducts(effectiveDate);
  }

  /**
   * Save products to database
   * @param {Array} products - Array of products to save
   * @param {Object|null} syncProgress - Sync progress record for tracking
   * @returns {Promise<Object>} - Results of save operation
   */
  async saveProductsToDB(products, syncProgress = null) {
    try {
      if (!products || products.length === 0) {
        console.log('No products to save');
        return { savedProducts: 0 };
      }
      
      console.log(`Saving ${products.length} products to database...`);
      
      const pool = await sql.connect(this.sqlConfig);
      let savedProducts = 0;
      let batchNumber = 0;
      
      // Process products in batches for better performance
      for (let i = 0; i < products.length; i += this.batchSize) {
        batchNumber++;
        const batch = products.slice(i, i + this.batchSize);
        console.log(`Processing batch ${batchNumber} with ${batch.length} products...`);
        
        // Update sync progress if provided
        if (syncProgress) {
          await this.updateSyncProgress(syncProgress, {
            batch_number: batchNumber,
            items_processed: i
          });
        }
        
        // Process each product in the batch
        for (const product of batch) {
          try {
            // Save product to database
            await this.saveProductToDB(product);
            savedProducts++;
          } catch (productError) {
            console.error(`Error saving product ${product.idproduct}:`, productError.message);
            // Continue with next product
          }
        }
        
        console.log(`Completed batch ${batchNumber}, saved ${savedProducts} products so far`);
        
        // Add a small delay between batches to avoid database overload
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Update sync status
      await this.updateSyncStatus(products.length);
      
      console.log(`✅ Saved ${savedProducts} products to database`);
      return { savedProducts };
    } catch (error) {
      console.error('Error saving products to database:', error.message);
      throw error;
    }
  }

  /**
   * Save a single product to database
   * @param {Object} product - Product to save
   * @returns {Promise<boolean>} - Success status
   */
  async saveProductToDB(product) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if product already exists
      const checkResult = await pool.request()
        .input('idproduct', sql.Int, product.idproduct)
        .query('SELECT id FROM Products WHERE idproduct = @idproduct');
      
      const productExists = checkResult.recordset.length > 0;
      
      // Prepare request with all possible parameters
      const request = new sql.Request(pool);
      
      // Add parameters with proper null handling
      request.input('idproduct', sql.Int, product.idproduct);
      request.input('productcode', sql.NVarChar, product.productcode || '');
      request.input('name', sql.NVarChar, product.name || '');
      request.input('price', sql.Decimal(18, 2), product.price || null);
      request.input('stock', sql.Int, product.stock || null);
      request.input('created', sql.DateTime, product.created ? new Date(product.created) : null);
      request.input('updated', sql.DateTime, product.updated ? new Date(product.updated) : null);
      request.input('last_sync_date', sql.DateTime, new Date());
      
      // Add expanded product fields
      request.input('idvatgroup', sql.Int, product.idvatgroup || null);
      request.input('fixedstockprice', sql.Decimal(18, 2), product.fixedstockprice || null);
      request.input('idsupplier', sql.Int, product.idsupplier || null);
      request.input('productcode_supplier', sql.NVarChar, product.productcode_supplier || null);
      request.input('deliverytime', sql.Int, product.deliverytime || null);
      request.input('description', sql.NVarChar, product.description || null);
      request.input('barcode', sql.NVarChar, product.barcode || null);
      request.input('type', sql.NVarChar, product.type || null);
      request.input('unlimitedstock', sql.Bit, product.unlimitedstock ? 1 : 0);
      request.input('weight', sql.Int, product.weight || null);
      request.input('length', sql.Int, product.length || null);
      request.input('width', sql.Int, product.width || null);
      request.input('height', sql.Int, product.height || null);
      request.input('minimum_purchase_quantity', sql.Int, product.minimum_purchase_quantity || null);
      request.input('purchase_in_quantities_of', sql.Int, product.purchase_in_quantities_of || null);
      request.input('hs_code', sql.NVarChar, product.hs_code || null);
      request.input('country_of_origin', sql.NVarChar, product.country_of_origin || null);
      request.input('active', sql.Bit, product.active ? 1 : 0);
      request.input('idfulfilment_customer', sql.Int, product.idfulfilment_customer || null);
      
      // Handle complex fields as JSON strings
      request.input('pricelists', sql.NVarChar, product.pricelists ? JSON.stringify(product.pricelists) : null);
      request.input('tags', sql.NVarChar, product.tags ? JSON.stringify(product.tags) : null);
      request.input('productfields', sql.NVarChar, product.productfields ? JSON.stringify(product.productfields) : null);
      request.input('images', sql.NVarChar, product.images ? JSON.stringify(product.images) : null);
      
      // Handle analysis fields
      request.input('analysis_pick_amount_per_day', sql.Float, product.analysis_pick_amount_per_day || null);
      request.input('analysis_abc_classification', sql.NVarChar, product.analysis_abc_classification || null);
      
      if (productExists) {
        // Update existing product
        await request.query(`
          UPDATE Products 
          SET 
            productcode = @productcode,
            name = @name,
            price = @price,
            stock = @stock,
            created = @created,
            updated = @updated,
            last_sync_date = @last_sync_date,
            idvatgroup = @idvatgroup,
            fixedstockprice = @fixedstockprice,
            idsupplier = @idsupplier,
            productcode_supplier = @productcode_supplier,
            deliverytime = @deliverytime,
            description = @description,
            barcode = @barcode,
            type = @type,
            unlimitedstock = @unlimitedstock,
            weight = @weight,
            length = @length,
            width = @width,
            height = @height,
            minimum_purchase_quantity = @minimum_purchase_quantity,
            purchase_in_quantities_of = @purchase_in_quantities_of,
            hs_code = @hs_code,
            country_of_origin = @country_of_origin,
            active = @active,
            idfulfilment_customer = @idfulfilment_customer,
            pricelists = @pricelists,
            tags = @tags,
            productfields = @productfields,
            images = @images,
            analysis_pick_amount_per_day = @analysis_pick_amount_per_day,
            analysis_abc_classification = @analysis_abc_classification
          WHERE idproduct = @idproduct
        `);
      } else {
        // Insert new product
        await request.query(`
          INSERT INTO Products (
            idproduct, productcode, name, price, stock, created, updated, last_sync_date,
            idvatgroup, fixedstockprice, idsupplier, productcode_supplier, deliverytime,
            description, barcode, type, unlimitedstock, weight, length, width, height,
            minimum_purchase_quantity, purchase_in_quantities_of, hs_code, country_of_origin,
            active, idfulfilment_customer, pricelists, tags, productfields, images,
            analysis_pick_amount_per_day, analysis_abc_classification
          )
          VALUES (
            @idproduct, @productcode, @name, @price, @stock, @created, @updated, @last_sync_date,
            @idvatgroup, @fixedstockprice, @idsupplier, @productcode_supplier, @deliverytime,
            @description, @barcode, @type, @unlimitedstock, @weight, @length, @width, @height,
            @minimum_purchase_quantity, @purchase_in_quantities_of, @hs_code, @country_of_origin,
            @active, @idfulfilment_customer, @pricelists, @tags, @productfields, @images,
            @analysis_pick_amount_per_day, @analysis_abc_classification
          )
        `);
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving product ${product.idproduct} to database:`, error.message);
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
        .query('SELECT COUNT(*) as count FROM Products');
      
      const totalCount = countResult.recordset[0].count;
      
      // Update SyncStatus record for products
      await pool.request()
        .input('entityType', sql.NVarChar, 'products')
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
   * Sync products from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Results of sync operation
   */
  async syncProducts(fullSync = false) {
    try {
      console.log(`Starting ${fullSync ? 'full' : 'incremental'} product sync...`);
      
      // Create sync progress record
      const syncProgress = await this.createOrGetSyncProgress('products', fullSync);
      
      let products;
      if (fullSync) {
        // Full sync: get all products
        products = await this.getAllProducts(null, syncProgress);
      } else {
        // Incremental sync: get products updated since last sync
        const lastSyncDate = await this.getLastSyncDate();
        products = await this.getProductsUpdatedSince(lastSyncDate);
      }
      
      // Save products to database
      const result = await this.saveProductsToDB(products, syncProgress);
      
      // Complete sync progress
      await this.completeSyncProgress(syncProgress, true);
      
      console.log(`✅ Product sync completed: ${result.savedProducts} products saved`);
      return {
        success: true,
        savedProducts: result.savedProducts
      };
    } catch (error) {
      console.error('Error in product sync:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = PicqerService;
