const axios = require('axios');
const sql = require('mssql');

/**
 * Enhanced service for interacting with the Picqer API and syncing all product attributes to Azure SQL
 * With improved pagination and duplicate prevention
 * Modified to work with existing database structure
 */
class PicqerService {
  constructor(apiKey, baseUrl, sqlConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.sqlConfig = sqlConfig;
    
    console.log('Initializing PicqerService with:');
    console.log('API Key (first 5 chars):', this.apiKey.substring(0, 5) + '...');
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
   * Initialize the database with expanded product schema
   * Modified to work with existing database structure
   * @returns {Promise<boolean>} - Success status
   */
  async initializeDatabase() {
    try {
      console.log('Initializing database with expanded product schema...');
      const pool = await sql.connect(this.sqlConfig);
      
      // Create expanded Products table with all Picqer attributes if it doesn't exist
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Products')
        BEGIN
          CREATE TABLE Products (
            id INT IDENTITY(1,1) PRIMARY KEY,
            idproduct INT NOT NULL,
            idvatgroup INT NULL,
            name NVARCHAR(255) NOT NULL,
            price DECIMAL(18,2) NULL,
            fixedstockprice DECIMAL(18,2) NULL,
            idsupplier INT NULL,
            productcode NVARCHAR(100) NOT NULL,
            productcode_supplier NVARCHAR(100) NULL,
            deliverytime INT NULL,
            description NVARCHAR(MAX) NULL,
            barcode NVARCHAR(100) NULL,
            type NVARCHAR(50) NULL,
            unlimitedstock BIT NULL,
            weight INT NULL,
            length INT NULL,
            width INT NULL,
            height INT NULL,
            minimum_purchase_quantity INT NULL,
            purchase_in_quantities_of INT NULL,
            hs_code NVARCHAR(50) NULL,
            country_of_origin NVARCHAR(2) NULL,
            active BIT NULL,
            idfulfilment_customer INT NULL,
            analysis_pick_amount_per_day FLOAT NULL,
            analysis_abc_classification NVARCHAR(1) NULL,
            tags NVARCHAR(MAX) NULL,
            productfields NVARCHAR(MAX) NULL,
            images NVARCHAR(MAX) NULL,
            pricelists NVARCHAR(MAX) NULL,
            stock INT NULL,
            created DATETIME NULL,
            updated DATETIME NULL,
            last_sync_date DATETIME NOT NULL DEFAULT GETDATE()
          );
          
          -- Create indexes for better performance
          CREATE INDEX IX_Products_idproduct ON Products(idproduct);
          CREATE INDEX IX_Products_productcode ON Products(productcode);
          CREATE INDEX IX_Products_updated ON Products(updated);
          CREATE INDEX IX_Products_barcode ON Products(barcode);
        END
      `);
      
      // Check if SyncStatus table exists
      const tableResult = await pool.request().query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'SyncStatus'
      `);
      
      const syncTableExists = tableResult.recordset[0].tableExists > 0;
      
      if (!syncTableExists) {
        // Create SyncStatus table if it doesn't exist
        console.log('Creating SyncStatus table...');
        await pool.request().query(`
          CREATE TABLE SyncStatus (
            id INT IDENTITY(1,1) PRIMARY KEY,
            entity_name NVARCHAR(50) NOT NULL,
            last_sync_date DATETIME NOT NULL,
            total_count INT NULL,
            last_sync_count INT NULL,
            CONSTRAINT UC_SyncStatus_entity_name UNIQUE (entity_name)
          );
          
          -- Insert initial record for products
          INSERT INTO SyncStatus (entity_name, last_sync_date)
          VALUES ('products', '2025-01-01T00:00:00.000Z');
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
            await pool.request().query(`
              ALTER TABLE SyncStatus 
              ADD entity_name NVARCHAR(50) NOT NULL DEFAULT 'products',
              CONSTRAINT UC_SyncStatus_entity_name UNIQUE (entity_name)
            `);
          }
        } catch (columnError) {
          console.warn('Error checking for entity_name column:', columnError.message);
          // Continue initialization even if column check fails
        }
      }
      
      console.log('✅ Database initialized successfully with expanded schema');
      return true;
    } catch (error) {
      console.error('❌ Error initializing database:', error.message);
      throw error;
    }
  }

  /**
   * Test the API connection
   * @returns {Promise<Object>} - API response
   */
  async testConnection() {
    try {
      console.log('Testing connection to Picqer API...');
      // Try to get a single product to test the connection
      const response = await this.client.get('/products', { 
        params: { 
          limit: 1 
        } 
      });
      console.log('Connection test successful!');
      return response.data;
    } catch (error) {
      console.error('Connection test failed:', error.message);
      throw error;
    }
  }

  /**
   * Get all products from Picqer with improved pagination and duplicate prevention
   * @param {Date} updatedSince - Only get products updated since this date
   * @returns {Promise<Array>} - Array of unique products
   */
  async getAllProducts(updatedSince = null) {
    console.log('Fetching all products from Picqer...');
    
    let allProducts = [];
    let offset = 0;
    const limit = 100; // Picqer's default page size
    let hasMoreProducts = true;
    
    // Track unique product IDs to prevent duplicates
    const seenProductIds = new Set();
    
    try {
      while (hasMoreProducts) {
        console.log(`Fetching products with offset ${offset}...`);
        
        // Build query parameters - use offset and limit
        const params = { offset, limit };
        
        // Add updated_since parameter if provided
        if (updatedSince) {
          const formattedDate = updatedSince.toISOString().replace('T', ' ').substring(0, 19);
          params.updated_since = formattedDate;
        }
        
        // Make API request
        const response = await this.client.get('/products', { params });
        
        // Check if we have data
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          // Filter out duplicates before adding to our collection
          const newProducts = response.data.filter(product => {
            if (seenProductIds.has(product.idproduct)) {
              return false; // Skip duplicate
            }
            seenProductIds.add(product.idproduct);
            return true;
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
      
      console.log(`✅ Retrieved ${allProducts.length} unique products from Picqer`);
      return allProducts;
    } catch (error) {
      console.error('Error fetching products from Picqer:', error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log('Rate limit hit, waiting before retrying...');
        
        // Wait for 20 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getAllProducts(updatedSince);
      }
      
      throw error;
    }
  }

  /**
   * Get a single product by its product code
   * @param {string} productCode - The product code to look up
   * @returns {Promise<Object>} - Product data
   */
  async getProductByCode(productCode) {
    try {
      const response = await this.client.get('/products', { 
        params: { productcode: productCode }
      });
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        return response.data[0];
      }
      
      return null;
    } catch (error) {
      console.error(`Error fetching product with code ${productCode}:`, error.message);
      throw error;
    }
  }

  /**
   * Get products updated since a specific date
   * @param {Date} date - The date to check updates from
   * @returns {Promise<Array>} - Array of updated products
   */
  async getProductsUpdatedSince(date) {
    return this.getAllProducts(date);
  }

  /**
   * Get the last sync date for a specific entity
   * Modified to work with existing database structure
   * @param {string} entityName - The entity name (e.g., 'products')
   * @returns {Promise<Date|null>} - Last sync date or null if not found
   */
  async getLastSyncDate(entityName = 'products') {
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
        // Check if entity_name column exists
        const columnResult = await pool.request().query(`
          SELECT COUNT(*) AS columnExists 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'SyncStatus' AND COLUMN_NAME = 'entity_name'
        `);
        
        const entityNameColumnExists = columnResult.recordset[0].columnExists > 0;
        
        if (entityNameColumnExists) {
          // Use entity_name column if it exists
          const result = await pool.request()
            .input('entityName', sql.NVarChar, entityName)
            .query('SELECT last_sync_date FROM SyncStatus WHERE entity_name = @entityName');
          
          if (result.recordset.length > 0) {
            return new Date(result.recordset[0].last_sync_date);
          }
        } else {
          // Fall back to just getting the first record if entity_name column doesn't exist
          const result = await pool.request()
            .query('SELECT TOP 1 last_sync_date FROM SyncStatus');
          
          if (result.recordset.length > 0) {
            return new Date(result.recordset[0].last_sync_date);
          }
        }
      }
      
      // If no record found or table doesn't exist, return January 1, 2025 as default start date
      return new Date('2025-01-01T00:00:00.000Z');
    } catch (error) {
      console.error(`Error getting last sync date for ${entityName}:`, error.message);
      // Return January 1, 2025 as fallback
      return new Date('2025-01-01T00:00:00.000Z');
    }
  }

  /**
   * Update the sync status for a specific entity
   * Modified to work with existing database structure
   * @param {string} entityName - The entity name (e.g., 'products')
   * @param {string} lastSyncDate - ISO string of the last sync date
   * @param {number} totalCount - Total count of entities in database
   * @param {number} lastSyncCount - Count of entities in last sync
   * @returns {Promise<boolean>} - Success status
   */
  async updateSyncStatus(entityName, lastSyncDate, totalCount = null, lastSyncCount = null) {
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
        // Create SyncStatus table if it doesn't exist
        await pool.request().query(`
          CREATE TABLE SyncStatus (
            id INT IDENTITY(1,1) PRIMARY KEY,
            entity_name NVARCHAR(50) NOT NULL,
            last_sync_date DATETIME NOT NULL,
            total_count INT NULL,
            last_sync_count INT NULL,
            CONSTRAINT UC_SyncStatus_entity_name UNIQUE (entity_name)
          );
        `);
        
        // Insert new record
        await pool.request()
          .input('entityName', sql.NVarChar, entityName)
          .input('lastSyncDate', sql.DateTime, new Date(lastSyncDate))
          .input('totalCount', sql.Int, totalCount)
          .input('lastSyncCount', sql.Int, lastSyncCount)
          .query(`
            INSERT INTO SyncStatus (entity_name, last_sync_date, total_count, last_sync_count)
            VALUES (@entityName, @lastSyncDate, @totalCount, @lastSyncCount);
          `);
        
        return true;
      }
      
      // Check if entity_name column exists
      const columnResult = await pool.request().query(`
        SELECT COUNT(*) AS columnExists 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'SyncStatus' AND COLUMN_NAME = 'entity_name'
      `);
      
      const entityNameColumnExists = columnResult.recordset[0].columnExists > 0;
      
      if (entityNameColumnExists) {
        // Use entity_name column if it exists
        const result = await pool.request()
          .input('entityName', sql.NVarChar, entityName)
          .query('SELECT COUNT(*) AS count FROM SyncStatus WHERE entity_name = @entityName');
        
        if (result.recordset[0].count > 0) {
          // Update existing record
          await pool.request()
            .input('entityName', sql.NVarChar, entityName)
            .input('lastSyncDate', sql.DateTime, new Date(lastSyncDate))
            .input('totalCount', sql.Int, totalCount)
            .input('lastSyncCount', sql.Int, lastSyncCount)
            .query(`
              UPDATE SyncStatus SET
                last_sync_date = @lastSyncDate,
                total_count = @totalCount,
                last_sync_count = @lastSyncCount
              WHERE entity_name = @entityName
            `);
        } else {
          // Insert new record
          await pool.request()
            .input('entityName', sql.NVarChar, entityName)
            .input('lastSyncDate', sql.DateTime, new Date(lastSyncDate))
            .input('totalCount', sql.Int, totalCount)
            .input('lastSyncCount', sql.Int, lastSyncCount)
            .query(`
              INSERT INTO SyncStatus (entity_name, last_sync_date, total_count, last_sync_count)
              VALUES (@entityName, @lastSyncDate, @totalCount, @lastSyncCount);
            `);
        }
      } else {
        // Just update the first record if entity_name column doesn't exist
        const countResult = await pool.request()
          .query('SELECT COUNT(*) AS count FROM SyncStatus');
        
        if (countResult.recordset[0].count > 0) {
          // Update first record
          await pool.request()
            .input('lastSyncDate', sql.DateTime, new Date(lastSyncDate))
            .query(`
              UPDATE TOP(1) SyncStatus SET
                last_sync_date = @lastSyncDate
            `);
        } else {
          // Try to insert without entity_name
          try {
            await pool.request()
              .input('lastSyncDate', sql.DateTime, new Date(lastSyncDate))
              .query(`
                INSERT INTO SyncStatus (last_sync_date)
                VALUES (@lastSyncDate);
              `);
          } catch (insertError) {
            console.warn('Error inserting sync status without entity_name:', insertError.message);
            // If insert fails, try to alter table to add entity_name column
            try {
              await pool.request().query(`
                ALTER TABLE SyncStatus 
                ADD entity_name NVARCHAR(50) NOT NULL DEFAULT 'products',
                CONSTRAINT UC_SyncStatus_entity_name UNIQUE (entity_name)
              `);
              
              // Try insert again with entity_name
              await pool.request()
                .input('entityName', sql.NVarChar, entityName)
                .input('lastSyncDate', sql.DateTime, new Date(lastSyncDate))
                .input('totalCount', sql.Int, totalCount)
                .input('lastSyncCount', sql.Int, lastSyncCount)
                .query(`
                  INSERT INTO SyncStatus (entity_name, last_sync_date, total_count, last_sync_count)
                  VALUES (@entityName, @lastSyncDate, @totalCount, @lastSyncCount);
                `);
            } catch (alterError) {
              console.error('Error altering SyncStatus table:', alterError.message);
              // Continue even if this fails
            }
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error(`Error updating sync status for ${entityName}:`, error.message);
      // Continue even if update fails
      return false;
    }
  }

  /**
   * Get the count of products in the database
   * @returns {Promise<number>} - Product count
   */
  async getProductCountFromDatabase() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      const result = await pool.request()
        .query('SELECT COUNT(*) AS count FROM Products');
      
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting product count from database:', error.message);
      return 0;
    }
  }

  /**
   * Save products to the database with all attributes
   * @param {Array} products - Array of products from Picqer API
   * @returns {Promise<number>} - Number of products saved
   */
  async saveProductsToDatabase(products) {
    if (!products || products.length === 0) {
      console.log('No products to save.');
      return 0;
    }
    
    console.log(`Saving ${products.length} products to database...`);
    let savedCount = 0;
    
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Process products in batches of 50 for better performance
      const batchSize = 50;
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(products.length / batchSize)}...`);
        
        // Process each product in the batch
        for (const product of batch) {
          try {
            // Check if product already exists
            const checkResult = await pool.request()
              .input('idproduct', sql.Int, product.idproduct)
              .query('SELECT COUNT(*) AS count FROM Products WHERE idproduct = @idproduct');
            
            const exists = checkResult.recordset[0].count > 0;
            
            // Prepare all inputs with proper type conversion
            const request = pool.request()
              .input('idproduct', sql.Int, product.idproduct)
              .input('idvatgroup', sql.Int, product.idvatgroup || null)
              .input('name', sql.NVarChar, product.name || '')
              .input('price', sql.Decimal(18, 2), product.price ? parseFloat(product.price) || 0 : 0)
              .input('fixedstockprice', sql.Decimal(18, 2), product.fixedstockprice ? parseFloat(product.fixedstockprice) || 0 : 0)
              .input('idsupplier', sql.Int, product.idsupplier || null)
              .input('productcode', sql.NVarChar, product.productcode || '')
              .input('productcode_supplier', sql.NVarChar, product.productcode_supplier || null)
              .input('deliverytime', sql.Int, product.deliverytime || null)
              .input('description', sql.NVarChar(sql.MAX), product.description || null)
              .input('barcode', sql.NVarChar, product.barcode || null)
              .input('type', sql.NVarChar, product.type || null)
              .input('unlimitedstock', sql.Bit, product.unlimitedstock ? 1 : 0)
              .input('weight', sql.Int, product.weight || null)
              .input('length', sql.Int, product.length || null)
              .input('width', sql.Int, product.width || null)
              .input('height', sql.Int, product.height || null)
              .input('minimum_purchase_quantity', sql.Int, product.minimum_purchase_quantity || null)
              .input('purchase_in_quantities_of', sql.Int, product.purchase_in_quantities_of || null)
              .input('hs_code', sql.NVarChar, product.hs_code || null)
              .input('country_of_origin', sql.NVarChar, product.country_of_origin || null)
              .input('active', sql.Bit, product.active ? 1 : 0)
              .input('idfulfilment_customer', sql.Int, product.idfulfilment_customer || null)
              .input('analysis_pick_amount_per_day', sql.Float, product.analysis_pick_amount_per_day || null)
              .input('analysis_abc_classification', sql.NVarChar(1), product.analysis_abc_classification || null)
              .input('tags', sql.NVarChar(sql.MAX), product.tags ? JSON.stringify(product.tags) : null)
              .input('productfields', sql.NVarChar(sql.MAX), product.productfields ? JSON.stringify(product.productfields) : null)
              .input('images', sql.NVarChar(sql.MAX), product.images ? JSON.stringify(product.images) : null)
              .input('pricelists', sql.NVarChar(sql.MAX), product.pricelists ? JSON.stringify(product.pricelists) : null)
              .input('stock', sql.Int, product.stock ? parseInt(product.stock, 10) || 0 : 0)
              .input('created', sql.DateTime, product.created ? new Date(product.created) : new Date())
              .input('updated', sql.DateTime, product.updated ? new Date(product.updated) : new Date())
              .input('last_sync_date', sql.DateTime, new Date());
            
            if (exists) {
              // Update existing product
              await request.query(`
                UPDATE Products SET
                  idvatgroup = @idvatgroup,
                  name = @name,
                  price = @price,
                  fixedstockprice = @fixedstockprice,
                  idsupplier = @idsupplier,
                  productcode = @productcode,
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
                  analysis_pick_amount_per_day = @analysis_pick_amount_per_day,
                  analysis_abc_classification = @analysis_abc_classification,
                  tags = @tags,
                  productfields = @productfields,
                  images = @images,
                  pricelists = @pricelists,
                  stock = @stock,
                  created = @created,
                  updated = @updated,
                  last_sync_date = @last_sync_date
                WHERE idproduct = @idproduct
              `);
            } else {
              // Insert new product
              await request.query(`
                INSERT INTO Products (
                  idproduct, idvatgroup, name, price, fixedstockprice, idsupplier,
                  productcode, productcode_supplier, deliverytime, description, barcode,
                  type, unlimitedstock, weight, length, width, height,
                  minimum_purchase_quantity, purchase_in_quantities_of, hs_code, country_of_origin,
                  active, idfulfilment_customer, analysis_pick_amount_per_day, analysis_abc_classification,
                  tags, productfields, images, pricelists, stock, created, updated, last_sync_date
                ) VALUES (
                  @idproduct, @idvatgroup, @name, @price, @fixedstockprice, @idsupplier,
                  @productcode, @productcode_supplier, @deliverytime, @description, @barcode,
                  @type, @unlimitedstock, @weight, @length, @width, @height,
                  @minimum_purchase_quantity, @purchase_in_quantities_of, @hs_code, @country_of_origin,
                  @active, @idfulfilment_customer, @analysis_pick_amount_per_day, @analysis_abc_classification,
                  @tags, @productfields, @images, @pricelists, @stock, @created, @updated, @last_sync_date
                )
              `);
            }
            
            savedCount++;
          } catch (productError) {
            console.error(`Error saving product ${product.idproduct}:`, productError.message);
            // Continue with next product
          }
        }
        
        // Log progress after each batch
        console.log(`Saved ${savedCount} products so far...`);
      }
      
      console.log(`✅ Successfully saved ${savedCount} products to database`);
      return savedCount;
    } catch (error) {
      console.error('❌ Error saving to database:', error.message);
      throw error;
    }
  }

  /**
   * Perform a full sync of all products
   * @returns {Promise<Object>} - Sync results
   */
  async performFullSync() {
    try {
      console.log('Starting full product sync...');
      
      // Initialize database if needed
      await this.initializeDatabase();
      
      // Get all products from Picqer
      const products = await this.getAllProducts();
      const totalProducts = products.length;
      
      console.log(`Retrieved ${totalProducts} unique products from Picqer`);
      
      // Save products to database
      const savedCount = await this.saveProductsToDatabase(products);
      const totalInDb = await this.getProductCountFromDatabase();
      
      // Update sync status
      await this.updateSyncStatus('products', new Date().toISOString(), totalInDb, savedCount);
      
      console.log(`✅ Full sync completed: ${savedCount} products processed`);
      
      return {
        success: true,
        message: `Full sync completed: ${savedCount} products processed`,
        stats: {
          retrieved: totalProducts,
          saved: savedCount,
          totalInDatabase: totalInDb
        }
      };
    } catch (error) {
      console.error('❌ Full sync failed:', error.message);
      return {
        success: false,
        message: `Full sync failed: ${error.message}`
      };
    }
  }

  /**
   * Perform an incremental sync of products updated since last sync
   * @returns {Promise<Object>} - Sync results
   */
  async performIncrementalSync() {
    try {
      console.log('Starting incremental product sync...');
      
      // Initialize database if needed
      await this.initializeDatabase();
      
      // Get last sync date
      const lastSyncDate = await this.getLastSyncDate('products');
      console.log(`Last sync date: ${lastSyncDate.toISOString()}`);
      
      // Get products updated since last sync
      const products = await this.getProductsUpdatedSince(lastSyncDate);
      const totalProducts = products.length;
      
      console.log(`Retrieved ${totalProducts} updated products from Picqer`);
      
      if (totalProducts === 0) {
        console.log('No products updated since last sync.');
        return {
          success: true,
          message: 'No products updated since last sync.',
          stats: {
            retrieved: 0,
            saved: 0,
            totalInDatabase: await this.getProductCountFromDatabase()
          }
        };
      }
      
      // Save products to database
      const savedCount = await this.saveProductsToDatabase(products);
      const totalInDb = await this.getProductCountFromDatabase();
      
      // Update sync status
      await this.updateSyncStatus('products', new Date().toISOString(), totalInDb, savedCount);
      
      console.log(`✅ Incremental sync completed: ${savedCount} products processed`);
      
      return {
        success: true,
        message: `Incremental sync completed: ${savedCount} products processed`,
        stats: {
          retrieved: totalProducts,
          saved: savedCount,
          totalInDatabase: totalInDb
        }
      };
    } catch (error) {
      console.error('❌ Incremental sync failed:', error.message);
      return {
        success: false,
        message: `Incremental sync failed: ${error.message}`
      };
    }
  }
}

module.exports = PicqerService;
