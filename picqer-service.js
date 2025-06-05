/**
 * Enhanced PicqerService with database initialization support
 * Added initializeDatabase method to align with index.js expectations
 */
const axios = require('axios');
const sql = require('mssql');
const syncProgressSchema = require('./sync_progress_schema');

/**
 * Service for interacting with the Picqer API using the same authentication method as Power BI
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
      console.log('Request headers:', JSON.stringify(request.headers));
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
          console.error('Response data:', JSON.stringify(error.response.data));
        } else if (error.request) {
          console.error('No response received:', error.request);
        } else {
          console.error('Error message:', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Initialize the database with products schema and sync progress tracking
   * @returns {Promise<boolean>} - Success status
   */
  async initializeDatabase() {
    try {
      console.log('Initializing database with products schema...');
      const pool = await sql.connect(this.sqlConfig);
      
      // Create Products table if it doesn't exist
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Products')
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
          // Check if products record exists
          const recordResult = await pool.request().query(`
            SELECT COUNT(*) AS recordExists 
            FROM SyncStatus 
            WHERE entity_type = 'products'
          `);
          
          const productsRecordExists = recordResult.recordset[0].recordExists > 0;
          
          if (productsRecordExists) {
            // Update existing record
            await pool.request().query(`
              UPDATE SyncStatus 
              SET entity_name = 'products' 
              WHERE entity_type = 'products'
            `);
            console.log('Updated existing products entity in SyncStatus');
          } else {
            // Insert new record
            await pool.request().query(`
              INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
              VALUES ('products', 'products', '2025-01-01T00:00:00.000Z')
            `);
            console.log('Added products record to SyncStatus table');
          }
        } else {
          console.warn('entity_type column does not exist in SyncStatus table');
        }
      } else {
        console.warn('SyncStatus table does not exist');
      }
      
      console.log('✅ Products database schema initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing products database schema:', error.message);
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
   * Get all products from Picqer with pagination
   * @param {Date} updatedSince - Only get products updated since this date
   * @returns {Promise<Array>} - Array of products
   */
  async getAllProducts(updatedSince = null) {
    console.log('Fetching all products from Picqer...');
    
    let allProducts = [];
    let offset = 0;
    let hasMoreProducts = true;
    
    try {
      while (hasMoreProducts) {
        console.log(`Fetching products with offset ${offset}...`);
        
        // Build query parameters
        const params = { offset };
        
        // Add updated_since parameter if provided
        if (updatedSince) {
          // Format date as YYYY-MM-DD HH:MM:SS
          const formattedDate = updatedSince.toISOString().replace('T', ' ').substring(0, 19);
          params.updated_since = formattedDate;
        }
        
        // Make API request
        const response = await this.client.get('/products', { params });
        
        // Check if we have data
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          // Add products to our collection
          allProducts = [...allProducts, ...response.data];
          
          // Check if we have more products (Picqer returns 100 items per page)
          hasMoreProducts = response.data.length === 100;
          
          // Increment offset for next page
          offset += 100;
          
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          hasMoreProducts = false;
        }
      }
      
      console.log(`Fetched ${allProducts.length} products in total.`);
      return allProducts;
    } catch (error) {
      console.error('Error fetching products from Picqer:', error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log('Rate limit hit, waiting before retrying...');
        
        // Wait for 20 seconds before retrying (same as Power BI query)
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
}

module.exports = PicqerService;
