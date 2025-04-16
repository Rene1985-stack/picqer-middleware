const axios = require('axios');
const sql = require('mssql');

/**
 * Enhanced service for interacting with the Picqer API and syncing all product attributes to Azure SQL
 * With improved pagination and duplicate prevention
 * Modified to work with existing database structure and dynamically create missing columns
 */
class PicqerService {
  constructor(apiKey, baseUrl, sqlConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.sqlConfig = sqlConfig;
    
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
   * Initialize the database with expanded product schema
   * Modified to work with existing database structure
   * @returns {Promise<boolean>} - Success status
   */
  async initializeDatabase() {
    try {
      console.log('Initializing database with expanded product schema...');
      const pool = await sql.connect(this.sqlConfig);
      
      // Create Products table if it doesn't exist
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Products')
        BEGIN
          CREATE TABLE Products (
            id INT IDENTITY(1,1) PRIMARY KEY,
            idproduct INT NOT NULL,
            name NVARCHAR(255) NOT NULL,
            productcode NVARCHAR(100) NOT NULL,
            price DECIMAL(18,2) NULL,
            stock INT NULL,
            created DATETIME NULL,
            updated DATETIME NULL,
            last_sync_date DATETIME NOT NULL DEFAULT GETDATE()
          );
          
          -- Create indexes for better performance
          CREATE INDEX IX_Products_idproduct ON Products(idproduct);
          CREATE INDEX IX_Products_productcode ON Products(productcode);
          CREATE INDEX IX_Products_updated ON Products(updated);
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
        } catch (columnError) {
          console.warn('Error checking for entity_name column:', columnError.message);
          // Continue initialization even if column check fails
        }
      }
      
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
        { name: 'tags', type: 'NVARCHAR(MAX)', nullable: true },
        { name: 'productfields', type: 'NVARCHAR(MAX)', nullable: true },
        { name: 'images', type: 'NVARCHAR(MAX)', nullable: true },
        { name: 'pricelists', type: 'NVARCHAR(MAX)', nullable: true }
      ];
      
      // Check each column and add if it doesn't exist
      for (const column of columns) {
        try {
          const columnResult = await pool.request().query(`
            SELECT COUNT(*) AS columnExists 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Products' AND COLUMN_NAME = '${column.name}'
          `);
          
          const columnExists = columnResult.recordset[0].columnExists > 0;
          
          if (!columnExists) {
            console.log(`Adding ${column.name} column to Products table...`);
            const nullableStr = column.nullable ? 'NULL' : 'NOT NULL';
            await pool.request().query(`
              ALTER TABLE Products 
              ADD ${column.name} ${column.type} ${nullableStr}
            `);
          }
        } catch (columnError) {
          console.warn(`Error checking/adding column ${column.name}:`, columnError.message);
          // Continue with next column even if this one fails
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error ensuring product columns exist:', error.message);
      // Return true anyway to allow the process to continue
      return true;
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
                ADD entity_name NVARCHAR(50) NOT NULL DEFAULT 'products'
              `);
              
              // Try to add constraint in a separate statement
              try {
                await pool.request().query(`
                  ALTER TABLE SyncStatus 
                  ADD CONSTRAINT UC_SyncStatus_entity_name UNIQUE (entity_name)
                `);
              } catch (constraintError) {
                console.warn('Error adding constraint:', constraintError.message);
                // Continue even if constraint creation fails
              }
              
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
   * Get the available columns in the Products table
   * @returns {Promise<Array<string>>} - Array of column names
   */
  async getProductTableColumns() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      const result = await pool.request().query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Products'
      `);
      
      return result.recordset.map(row => row.COLUMN_NAME);
    } catch (error) {
      console.error('Error getting product table columns:', error.message);
      // Return basic columns as fallback
      return ['id', 'idproduct', 'name', 'productcode', 'price', 'stock', 'created', 'updated', 'last_sync_date'];
    }
  }

  /**
   * Save products to the database with dynamic column handling
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
      
      // Get available columns in the Products table
      const availableColumns = await this.getProductTableColumns();
      console.log(`Available columns in Products table: ${availableColumns.length}`);
      
      // Process products in batches of 50 for better performance
      const batchSize = 50;
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(products.length / batchSize)}...`);
        
        // Process each product in the batch
        for (const product of batch) {
          try {
            // Check if product already exists
            const checkResult = await pool.request()
              .input('idproduct', sql.Int, product.idproduct)
              .query('SELECT COUNT(*) AS count FROM Products WHERE idproduct = @idproduct');
            
            const exists = checkResult.recordset[0].count > 0;
            
            // Start building the request with required fields
            const request = pool.request()
              .input('idproduct', sql.Int, product.idproduct)
              .input('name', sql.NVarChar, product.name || '')
              .input('productcode', sql.NVarChar, product.productcode || '')
              .input('last_sync_date', sql.DateTime, new Date());
            
            // Add optional fields only if the column exists in the database
            if (availableColumns.includes('price')) {
              request.input('price', sql.Decimal(18, 2), product.price ? parseFloat(product.price) || 0 : 0);
            }
            
            if (availableColumns.includes('stock')) {
              request.input('stock', sql.Int, product.stock ? parseInt(product.stock, 10) || 0 : 0);
            }
            
            if (availableColumns.includes('created')) {
              request.input('created', sql.DateTime, product.created ? new Date(product.created) : new Date());
            }
            
            if (availableColumns.includes('updated')) {
              request.input('updated', sql.DateTime, product.updated ? new Date(product.updated) : new Date());
            }
            
            // Add all other fields dynamically if they exist in the database
            const additionalFields = [
              { name: 'idvatgroup', type: sql.Int, value: product.idvatgroup || null },
              { name: 'fixedstockprice', type: sql.Decimal(18, 2), value: product.fixedstockprice ? parseFloat(product.fixedstockprice) || 0 : 0 },
              { name: 'idsupplier', type: sql.Int, value: product.idsupplier || null },
              { name: 'productcode_supplier', type: sql.NVarChar, value: product.productcode_supplier || null },
              { name: 'deliverytime', type: sql.Int, value: product.deliverytime || null },
              { name: 'description', type: sql.NVarChar(sql.MAX), value: product.description || null },
              { name: 'barcode', type: sql.NVarChar, value: product.barcode || null },
              { name: 'type', type: sql.NVarChar, value: product.type || null },
              { name: 'unlimitedstock', type: sql.Bit, value: product.unlimitedstock ? 1 : 0 },
              { name: 'weight', type: sql.Int, value: product.weight || null },
              { name: 'length', type: sql.Int, value: product.length || null },
              { name: 'width', type: sql.Int, value: product.width || null },
              { name: 'height', type: sql.Int, value: product.height || null },
              { name: 'minimum_purchase_quantity', type: sql.Int, value: product.minimum_purchase_quantity || null },
              { name: 'purchase_in_quantities_of', type: sql.Int, value: product.purchase_in_quantities_of || null },
              { name: 'hs_code', type: sql.NVarChar, value: product.hs_code || null },
              { name: 'country_of_origin', type: sql.NVarChar, value: product.country_of_origin || null },
              { name: 'active', type: sql.Bit, value: product.active ? 1 : 0 },
              { name: 'idfulfilment_customer', type: sql.Int, value: product.idfulfilment_customer || null },
              { name: 'analysis_pick_amount_per_day', type: sql.Float, value: product.analysis_pick_amount_per_day || null },
              { name: 'analysis_abc_classification', type: sql.NVarChar(1), value: product.analysis_abc_classification || null },
              { name: 'tags', type: sql.NVarChar(sql.MAX), value: product.tags ? JSON.stringify(product.tags) : null },
              { name: 'productfields', type: sql.NVarChar(sql.MAX), value: product.productfields ? JSON.stringify(product.productfields) : null },
              { name: 'images', type: sql.NVarChar(sql.MAX), value: product.images ? JSON.stringify(product.images) : null },
              { name: 'pricelists', type: sql.NVarChar(sql.MAX), value: product.pricelists ? JSON.stringify(product.pricelists) : null }
            ];
            
            for (const field of additionalFields) {
              if (availableColumns.includes(field.name)) {
                request.input(field.name, field.type, field.value);
              }
            }
            
            // Build column lists for SQL query
            const availableFieldNames = ['idproduct', 'name', 'productcode', 'last_sync_date'];
            const availableParamNames = ['@idproduct', '@name', '@productcode', '@last_sync_date'];
            
            if (availableColumns.includes('price')) {
              availableFieldNames.push('price');
              availableParamNames.push('@price');
            }
            
            if (availableColumns.includes('stock')) {
              availableFieldNames.push('stock');
              availableParamNames.push('@stock');
            }
            
            if (availableColumns.includes('created')) {
              availableFieldNames.push('created');
              availableParamNames.push('@created');
            }
            
            if (availableColumns.includes('updated')) {
              availableFieldNames.push('updated');
              availableParamNames.push('@updated');
            }
            
            // Add additional fields to column lists
            for (const field of additionalFields) {
              if (availableColumns.includes(field.name)) {
                availableFieldNames.push(field.name);
                availableParamNames.push(`@${field.name}`);
              }
            }
            
            // Execute query based on whether product exists
            if (exists) {
              // Build SET clause for UPDATE
              const setClause = availableFieldNames
                .filter(name => name !== 'idproduct') // Don't update primary key
                .map(name => `${name} = @${name}`)
                .join(', ');
              
              await request.query(`
                UPDATE Products SET ${setClause}
                WHERE idproduct = @idproduct
              `);
            } else {
              // Build column and value lists for INSERT
              const columnList = availableFieldNames.join(', ');
              const valueList = availableParamNames.join(', ');
              
              await request.query(`
                INSERT INTO Products (${columnList})
                VALUES (${valueList})
              `);
            }
            
            savedCount++;
          } catch (productError) {
            console.error(`Error saving product ${product.idproduct}:`, productError.message);
            // Continue with next product even if this one fails
          }
        }
      }
      
      console.log(`✅ Saved ${savedCount} products to database`);
      return savedCount;
    } catch (error) {
      console.error('❌ Error saving to database:', error.message);
      throw error;
    }
  }

  /**
   * Perform a full sync of all products
   * @returns {Promise<Object>} - Sync result
   */
  async performFullSync() {
    try {
      console.log('Starting full sync...');
      
      // Get all products from Picqer
      const products = await this.getAllProducts();
      console.log(`Retrieved ${products.length} products from Picqer`);
      
      // Save products to database
      const savedCount = await this.saveProductsToDatabase(products);
      
      // Update sync status
      const totalCount = await this.getProductCountFromDatabase();
      await this.updateSyncStatus('products', new Date().toISOString(), totalCount, savedCount);
      
      console.log('✅ Full sync completed successfully');
      return {
        success: true,
        message: `Full sync completed successfully. Saved ${savedCount} products.`,
        totalCount,
        savedCount
      };
    } catch (error) {
      console.error('❌ Sync failed:', error.message);
      return {
        success: false,
        message: `Sync failed: ${error.message}`
      };
    }
  }

  /**
   * Perform an incremental sync of products updated since last sync
   * @returns {Promise<Object>} - Sync result
   */
  async performIncrementalSync() {
    try {
      console.log('Starting incremental sync...');
      
      // Get last sync date
      const lastSyncDate = await this.getLastSyncDate('products');
      console.log(`Last sync date: ${lastSyncDate.toISOString()}`);
      
      // Get products updated since last sync
      const products = await this.getProductsUpdatedSince(lastSyncDate);
      console.log(`Retrieved ${products.length} updated products from Picqer`);
      
      // Save products to database
      const savedCount = await this.saveProductsToDatabase(products);
      
      // Update sync status
      const totalCount = await this.getProductCountFromDatabase();
      await this.updateSyncStatus('products', new Date().toISOString(), totalCount, savedCount);
      
      console.log('✅ Incremental sync completed successfully');
      return {
        success: true,
        message: `Incremental sync completed successfully. Saved ${savedCount} products.`,
        totalCount,
        savedCount
      };
    } catch (error) {
      console.error('❌ Sync failed:', error.message);
      return {
        success: false,
        message: `Sync failed: ${error.message}`
      };
    }
  }
}

module.exports = PicqerService;
