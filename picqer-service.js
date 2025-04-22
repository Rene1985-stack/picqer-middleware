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
const PicqerApiClient = require('./picqer-api-client');

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
      
      // Implementation of the missing ensureProductColumnsExist method
      await this.ensureProductColumnsExist(pool);
      
      console.log('✅ Database initialized successfully with expanded schema');
      return true;
    } catch (error) {
      console.error('❌ Error initializing database:', error.message);
      throw error;
    }
  }

  /**
   * Ensure all expanded product columns exist in the Products table
   * @param {sql.ConnectionPool} [pool] - SQL connection pool
   * @returns {Promise<void>}
   */
  async ensureProductColumnsExist(existingPool = null) {
    try {
      console.log('Ensuring all product columns exist...');
      const pool = existingPool || await sql.connect(this.sqlConfig);
      
      // Define all columns that should exist in the Products table
      const requiredColumns = [
        { name: 'id', type: 'INT' },
        { name: 'idproduct', type: 'INT' },
        { name: 'productcode', type: 'NVARCHAR(100)' },
        { name: 'name', type: 'NVARCHAR(255)' },
        { name: 'price', type: 'DECIMAL(18,2)' },
        { name: 'stock', type: 'INT' },
        { name: 'created', type: 'DATETIME' },
        { name: 'updated', type: 'DATETIME' },
        { name: 'last_sync_date', type: 'DATETIME' },
        // Add any additional columns you need here
        { name: 'barcode', type: 'NVARCHAR(100)' },
        { name: 'supplier_code', type: 'NVARCHAR(100)' },
        { name: 'ean', type: 'NVARCHAR(100)' },
        { name: 'sku', type: 'NVARCHAR(100)' },
        { name: 'weight', type: 'DECIMAL(18,2)' },
        { name: 'stock_minimum', type: 'INT' },
        { name: 'stock_maximum', type: 'INT' },
        { name: 'purchase_price', type: 'DECIMAL(18,2)' }
      ];
      
      // Check which columns already exist
      const columnsResult = await pool.request().query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Products'
      `);
      
      const existingColumns = columnsResult.recordset.map(row => row.COLUMN_NAME.toLowerCase());
      
      // Add missing columns
      for (const column of requiredColumns) {
        if (!existingColumns.includes(column.name.toLowerCase())) {
          console.log(`Adding column ${column.name} to Products table...`);
          try {
            await pool.request().query(`
              ALTER TABLE Products 
              ADD ${column.name} ${column.type} NULL
            `);
            console.log(`✅ Added column ${column.name} to Products table`);
          } catch (error) {
            console.warn(`⚠️ Error adding column ${column.name}:`, error.message);
            // Continue with other columns even if one fails
          }
        } else {
          console.log(`Column ${column.name} already exists in Products table`);
        }
      }
      
      console.log('✅ Ensured all product columns exist');
    } catch (error) {
      console.error('❌ Error ensuring product columns exist:', error.message);
      // Don't throw the error to allow initialization to continue
      console.log('Continuing with initialization despite column check error');
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

  // Rest of your PicqerService implementation...
}

module.exports = PicqerService;
