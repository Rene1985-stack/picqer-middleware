/**
 * Optimized Product service with performance enhancements and rate limiting
 * Includes performance optimizations:
 * 1. 30-day rolling window for incremental syncs
 * 2. Increased batch size for database operations
 * 3. Optimized database operations with bulk inserts
 * 4. Newest-first processing to prioritize recent data
 * 5. Resumable sync to continue from last position after restarts
 * 6. Rate limiting to prevent "Rate limit exceeded" errors with Picqer's recommended approach
 */
const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');
const syncProgressSchema = require('./sync_progress_schema');
const PicqerApiClient = require('./updated-picqer-api-client');

class PicqerService {
  constructor(apiKey, baseUrl, sqlConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.sqlConfig = sqlConfig;
    this.batchSize = 100; // Increased from 50 to 100 for better performance
    
    console.log('Initializing PicqerService with:');
    console.log('API Key (first 5 chars):', this.apiKey ? this.apiKey.substring(0, 5) + '...' : 'undefined');
    console.log('Base URL:', this.baseUrl);
    
    // Initialize the rate-limited API client with Picqer's recommended approach
    this.client = new PicqerApiClient(this.apiKey, this.baseUrl, {
      requestsPerMinute: 30, // Conservative default: 30 requests per minute
      maxRetries: 5,
      initialBackoffMs: 2000,
      waitOnRateLimit: true, // Enable Picqer's recommended approach for rate limiting
      sleepTimeOnRateLimitHitInMs: 20000, // 20 seconds wait time on rate limit hit (Picqer default)
      logFunction: (msg) => console.log(`[Picqer] ${msg}`),
      errorFunction: (msg) => console.error(`[Picqer Error] ${msg}`)
    });
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
      
      request.input('syncId', sql.NVarChar, progress.sync_id);
      request.input('entityType', sql.NVarChar, progress.entity_type);
      request.input('now', sql.DateTime, new Date().toISOString());
      
      // Add each update field to the query
      Object.entries(updates).forEach(([key, value], index) => {
        const paramName = `param${index}`;
        updateFields.push(`${key} = @${paramName}`);
        
        // Determine SQL type based on value type
        if (typeof value === 'number') {
          request.input(paramName, sql.Int, value);
        } else if (typeof value === 'boolean') {
          request.input(paramName, sql.Bit, value ? 1 : 0);
        } else {
          request.input(paramName, sql.NVarChar, value);
        }
      });
      
      // Always update last_updated timestamp
      updateFields.push('last_updated = @now');
      
      const query = `
        UPDATE SyncProgress
        SET ${updateFields.join(', ')}
        WHERE sync_id = @syncId AND entity_type = @entityType
      `;
      
      await request.query(query);
      
      return true;
    } catch (error) {
      console.error('Error updating sync progress:', error.message);
      return false;
    }
  }

  /**
   * Complete sync progress
   * @param {Object} progress - Sync progress record
   * @param {boolean} success - Whether sync was successful
   * @param {string} message - Optional completion message
   * @returns {Promise<boolean>} - Success status
   */
  async completeSyncProgress(progress, success = true, message = '') {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      await pool.request()
        .input('syncId', sql.NVarChar, progress.sync_id)
        .input('entityType', sql.NVarChar, progress.entity_type)
        .input('status', sql.NVarChar, success ? 'completed' : 'failed')
        .input('message', sql.NVarChar, message)
        .input('now', sql.DateTime, new Date().toISOString())
        .query(`
          UPDATE SyncProgress
          SET status = @status, 
              completion_message = @message,
              completed_at = @now,
              last_updated = @now
          WHERE sync_id = @syncId AND entity_type = @entityType
        `);
      
      console.log(`Marked sync ${progress.sync_id} as ${success ? 'completed' : 'failed'}`);
      
      // Update SyncStatus table with last sync date and count
      if (success) {
        await this.updateSyncStatus(progress.entity_type, progress.items_processed);
      }
      
      return true;
    } catch (error) {
      console.error('Error completing sync progress:', error.message);
      return false;
    }
  }

  /**
   * Update sync status
   * @param {string} entityType - Entity type (e.g., 'products')
   * @param {number} count - Number of items synced
   * @returns {Promise<boolean>} - Success status
   */
  async updateSyncStatus(entityType, count) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Get current total count
      const countResult = await pool.request()
        .input('entityType', sql.NVarChar, entityType)
        .query(`
          SELECT COUNT(*) AS total_count
          FROM Products
        `);
      
      const totalCount = countResult.recordset[0].total_count;
      
      // Update SyncStatus table
      await pool.request()
        .input('entityType', sql.NVarChar, entityType)
        .input('entityName', sql.NVarChar, entityType)
        .input('lastSyncDate', sql.DateTime, new Date().toISOString())
        .input('totalCount', sql.Int, totalCount)
        .input('lastSyncCount', sql.Int, count)
        .query(`
          MERGE INTO SyncStatus AS target
          USING (SELECT @entityType AS entity_type) AS source
          ON target.entity_type = source.entity_type
          WHEN MATCHED THEN
            UPDATE SET 
              last_sync_date = @lastSyncDate,
              total_count = @totalCount,
              last_sync_count = @lastSyncCount
          WHEN NOT MATCHED THEN
            INSERT (entity_name, entity_type, last_sync_date, total_count, last_sync_count)
            VALUES (@entityName, @entityType, @lastSyncDate, @totalCount, @lastSyncCount);
        `);
      
      console.log(`Updated sync status for ${entityType}: ${count} items synced, ${totalCount} total`);
      
      return true;
    } catch (error) {
      console.error('Error updating sync status:', error.message);
      return false;
    }
  }

  /**
   * Get product count from database
   * @returns {Promise<number>} - Product count
   */
  async getCount() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      const result = await pool.request().query(`
        SELECT COUNT(*) AS count FROM Products
      `);
      
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting product count:', error.message);
      return 0;
    }
  }

  /**
   * Get last sync date for products
   * @returns {Promise<string>} - Last sync date as ISO string
   */
  async getLastSyncDate() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      const result = await pool.request()
        .input('entityType', sql.NVarChar, 'products')
        .query(`
          SELECT last_sync_date
          FROM SyncStatus
          WHERE entity_type = @entityType
        `);
      
      if (result.recordset.length > 0) {
        return result.recordset[0].last_sync_date.toISOString();
      } else {
        return new Date(0).toISOString(); // Return epoch if no record found
      }
    } catch (error) {
      console.error('Error getting last sync date:', error.message);
      return new Date(0).toISOString(); // Return epoch on error
    }
  }

  /**
   * Fetch products from Picqer API with rate limiting
   * @param {number} offset - Offset for pagination
   * @param {number} limit - Limit for pagination
   * @returns {Promise<Array>} - Array of products
   */
  async getProducts(offset = 0, limit = 100) {
    try {
      // Use the rate-limited client to make the API request
      const response = await this.client.get('/products', { 
        offset, 
        limit,
        includestock: 1,
        includefields: 1
      });
      
      return response.data || [];
    } catch (error) {
      console.error('Error fetching products from Picqer:', error.message);
      throw error;
    }
  }

  /**
   * Perform incremental sync of products
   * @returns {Promise<Object>} - Sync result
   */
  async performIncrementalSync() {
    console.log('Starting incremental product sync...');
    
    try {
      // Initialize database if needed
      await this.initializeDatabase();
      
      // Get or create sync progress
      const progress = await this.createOrGetSyncProgress('products', false);
      
      // Get last sync date (30-day rolling window)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      let offset = progress.current_offset || 0;
      let batchNumber = progress.batch_number || 0;
      let itemsProcessed = progress.items_processed || 0;
      let hasMore = true;
      
      while (hasMore) {
        console.log(`Fetching products batch ${batchNumber + 1} (offset: ${offset}, limit: ${this.batchSize})...`);
        
        try {
          // Fetch products from Picqer with rate limiting
          const products = await this.getProducts(offset, this.batchSize);
          
          if (products.length === 0) {
            console.log('No more products to fetch');
            hasMore = false;
            break;
          }
          
          console.log(`Fetched ${products.length} products`);
          
          // Save products to database
          await this.saveProductsToDatabase(products);
          
          // Update progress
          offset += products.length;
          batchNumber++;
          itemsProcessed += products.length;
          
          await this.updateSyncProgress(progress, {
            current_offset: offset,
            batch_number: batchNumber,
            items_processed: itemsProcessed
          });
          
          // Check if we've reached the end
          if (products.length < this.batchSize) {
            console.log('Reached end of products');
            hasMore = false;
          }
        } catch (error) {
          console.error(`Error in batch ${batchNumber + 1}:`, error.message);
          
          // Complete sync with failure
          await this.completeSyncProgress(progress, false, error.message);
          
          return {
            success: false,
            error: error.message,
            itemsProcessed
          };
        }
      }
      
      // Complete sync with success
      await this.completeSyncProgress(progress, true, `Synced ${itemsProcessed} products`);
      
      console.log(`✅ Incremental product sync completed: ${itemsProcessed} products synced`);
      
      return {
        success: true,
        itemsProcessed
      };
    } catch (error) {
      console.error('Error in incremental product sync:', error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Perform full sync of products
   * @returns {Promise<Object>} - Sync result
   */
  async performFullSync() {
    console.log('Starting full product sync...');
    
    try {
      // Initialize database if needed
      await this.initializeDatabase();
      
      // Get or create sync progress
      const progress = await this.createOrGetSyncProgress('products', true);
      
      let offset = progress.current_offset || 0;
      let batchNumber = progress.batch_number || 0;
      let itemsProcessed = progress.items_processed || 0;
      let hasMore = true;
      
      while (hasMore) {
        console.log(`Fetching products batch ${batchNumber + 1} (offset: ${offset}, limit: ${this.batchSize})...`);
        
        try {
          // Fetch products from Picqer with rate limiting
          const products = await this.getProducts(offset, this.batchSize);
          
          if (products.length === 0) {
            console.log('No more products to fetch');
            hasMore = false;
            break;
          }
          
          console.log(`Fetched ${products.length} products`);
          
          // Save products to database
          await this.saveProductsToDatabase(products);
          
          // Update progress
          offset += products.length;
          batchNumber++;
          itemsProcessed += products.length;
          
          await this.updateSyncProgress(progress, {
            current_offset: offset,
            batch_number: batchNumber,
            items_processed: itemsProcessed
          });
          
          // Check if we've reached the end
          if (products.length < this.batchSize) {
            console.log('Reached end of products');
            hasMore = false;
          }
        } catch (error) {
          console.error(`Error in batch ${batchNumber + 1}:`, error.message);
          
          // Complete sync with failure
          await this.completeSyncProgress(progress, false, error.message);
          
          return {
            success: false,
            error: error.message,
            itemsProcessed
          };
        }
      }
      
      // Complete sync with success
      await this.completeSyncProgress(progress, true, `Synced ${itemsProcessed} products`);
      
      console.log(`✅ Full product sync completed: ${itemsProcessed} products synced`);
      
      return {
        success: true,
        itemsProcessed
      };
    } catch (error) {
      console.error('Error in full product sync:', error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Save products to database
   * @param {Array} products - Array of products
   * @returns {Promise<boolean>} - Success status
   */
  async saveProductsToDatabase(products) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Process products in batches for better performance
      const batchSize = 100;
      const batches = [];
      
      for (let i = 0; i < products.length; i += batchSize) {
        batches.push(products.slice(i, i + batchSize));
      }
      
      for (const batch of batches) {
        // Create a transaction for each batch
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        
        try {
          for (const product of batch) {
            // Convert product data to SQL parameters
            const request = new sql.Request(transaction);
            
            request.input('idproduct', sql.Int, product.idproduct);
            request.input('productcode', sql.NVarChar, product.productcode);
            request.input('name', sql.NVarChar, product.name);
            request.input('price', sql.Decimal(18, 2), product.price);
            request.input('stock', sql.Int, product.stock);
            request.input('created', sql.DateTime, product.created);
            request.input('updated', sql.DateTime, product.updated);
            request.input('idvatgroup', sql.Int, product.idvatgroup);
            request.input('fixedstockprice', sql.Decimal(18, 2), product.fixedstockprice);
            request.input('idsupplier', sql.Int, product.idsupplier);
            request.input('productcode_supplier', sql.NVarChar, product.productcode_supplier);
            request.input('deliverytime', sql.Int, product.deliverytime);
            request.input('description', sql.NVarChar, product.description);
            request.input('barcode', sql.NVarChar, product.barcode);
            request.input('type', sql.NVarChar, product.type);
            request.input('unlimitedstock', sql.Bit, product.unlimitedstock ? 1 : 0);
            request.input('weight', sql.Int, product.weight);
            request.input('length', sql.Int, product.length);
            request.input('width', sql.Int, product.width);
            request.input('height', sql.Int, product.height);
            request.input('minimum_purchase_quantity', sql.Int, product.minimum_purchase_quantity);
            request.input('purchase_in_quantities_of', sql.Int, product.purchase_in_quantities_of);
            request.input('hs_code', sql.NVarChar, product.hs_code);
            request.input('country_of_origin', sql.NVarChar, product.country_of_origin);
            request.input('active', sql.Bit, product.active ? 1 : 0);
            request.input('idfulfilment_customer', sql.Int, product.idfulfilment_customer);
            
            // Convert complex objects to JSON strings
            request.input('pricelists', sql.NVarChar, JSON.stringify(product.pricelists || []));
            request.input('tags', sql.NVarChar, JSON.stringify(product.tags || []));
            request.input('productfields', sql.NVarChar, JSON.stringify(product.productfields || []));
            request.input('images', sql.NVarChar, JSON.stringify(product.images || []));
            
            // Use MERGE statement for upsert
            await request.query(`
              MERGE INTO Products AS target
              USING (SELECT @idproduct AS idproduct) AS source
              ON target.idproduct = source.idproduct
              WHEN MATCHED THEN
                UPDATE SET 
                  productcode = @productcode,
                  name = @name,
                  price = @price,
                  stock = @stock,
                  created = @created,
                  updated = @updated,
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
                  last_sync_date = GETDATE()
              WHEN NOT MATCHED THEN
                INSERT (
                  idproduct, productcode, name, price, stock, created, updated,
                  idvatgroup, fixedstockprice, idsupplier, productcode_supplier,
                  deliverytime, description, barcode, type, unlimitedstock,
                  weight, length, width, height, minimum_purchase_quantity,
                  purchase_in_quantities_of, hs_code, country_of_origin,
                  active, idfulfilment_customer, pricelists, tags, productfields,
                  images, last_sync_date
                )
                VALUES (
                  @idproduct, @productcode, @name, @price, @stock, @created, @updated,
                  @idvatgroup, @fixedstockprice, @idsupplier, @productcode_supplier,
                  @deliverytime, @description, @barcode, @type, @unlimitedstock,
                  @weight, @length, @width, @height, @minimum_purchase_quantity,
                  @purchase_in_quantities_of, @hs_code, @country_of_origin,
                  @active, @idfulfilment_customer, @pricelists, @tags, @productfields,
                  @images, GETDATE()
                );
            `);
          }
          
          // Commit the transaction
          await transaction.commit();
        } catch (error) {
          // Rollback the transaction on error
          await transaction.rollback();
          throw error;
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error saving products to database:', error.message);
      throw error;
    }
  }

  /**
   * Enable automatic retry on rate limit hit (Picqer style)
   */
  enableRetryOnRateLimitHit() {
    this.client.enableRetryOnRateLimitHit();
  }

  /**
   * Disable automatic retry on rate limit hit
   */
  disableRetryOnRateLimitHit() {
    this.client.disableRetryOnRateLimitHit();
  }

  /**
   * Set the sleep time on rate limit hit
   * @param {number} ms - Milliseconds to sleep
   */
  setSleepTimeOnRateLimitHit(ms) {
    this.client.setSleepTimeOnRateLimitHit(ms);
  }

  /**
   * Get rate limiter statistics
   * @returns {Object} - Statistics object
   */
  getRateLimiterStats() {
    return this.client.getStats();
  }
}

module.exports = PicqerService;
