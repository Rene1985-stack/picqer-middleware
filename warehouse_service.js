/**
 * Warehouse Service Class
 * Properly structured as a class for instantiation with 'new'
 */
const axios = require('axios');
const sql = require('mssql');

class WarehouseService {
  constructor(apiKey, baseUrl, sqlConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.sqlConfig = sqlConfig;
    this.autoFixDuplicates = true; // Enable automatic fixing of duplicates
    
    // Create Base64 encoded credentials
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
  }

  /**
   * Initialize warehouses database schema
   * @returns {Promise<boolean>} Success status
   */
  async initializeWarehousesDatabase() {
    try {
      console.log('Initializing database with warehouses schema...');
      const pool = await sql.connect(this.sqlConfig);
      
      // Create Warehouses table if it doesn't exist
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Warehouses')
        BEGIN
            CREATE TABLE Warehouses (
                id INT IDENTITY(1,1) PRIMARY KEY,
                idwarehouse INT NOT NULL,
                name NVARCHAR(255) NOT NULL,
                code NVARCHAR(50) NULL,
                address NVARCHAR(255) NULL,
                address2 NVARCHAR(255) NULL,
                zipcode NVARCHAR(50) NULL,
                city NVARCHAR(100) NULL,
                region NVARCHAR(100) NULL,
                country NVARCHAR(2) NULL,
                telephone NVARCHAR(50) NULL,
                email NVARCHAR(255) NULL,
                active BIT NOT NULL DEFAULT 1,
                last_sync_date DATETIME NOT NULL DEFAULT GETDATE()
            );
            
            -- Create index for better performance
            CREATE INDEX IX_Warehouses_idwarehouse ON Warehouses(idwarehouse);
        END
      `);
      
      // Add unique constraint to prevent duplicates if it doesn't exist
      await this.addUniqueConstraintToWarehousesTable();
      
      console.log('✅ Warehouses database schema initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing warehouses database schema:', error.message);
      throw error;
    }
  }

  /**
   * Get all warehouses from Picqer
   * @returns {Promise<Array>} Array of warehouses
   */
  async getAllWarehouses() {
    try {
      console.log('Fetching all warehouses from Picqer...');
      const response = await this.client.get('/warehouses');
      
      if (response.data && Array.isArray(response.data)) {
        console.log(`Fetched ${response.data.length} warehouses`);
        return response.data;
      }
      
      return [];
    } catch (error) {
      console.error('Error fetching warehouses from Picqer:', error.message);
      throw error;
    }
  }

  /**
   * Sync warehouses with duplicate prevention
   * @param {Array} warehouses - Array of warehouses from Picqer API
   * @returns {Promise<Object>} - Results of the sync operation
   */
  async syncWarehouses(warehouses) {
    try {
      if (!warehouses || warehouses.length === 0) {
        console.log('No warehouses to sync');
        return {
          success: true,
          savedCount: 0,
          errorCount: 0
        };
      }
      
      console.log(`Syncing ${warehouses.length} warehouses...`);
      const pool = await sql.connect(this.sqlConfig);
      let savedCount = 0;
      let errorCount = 0;
      let duplicateCount = 0;
      
      // First, check for potential duplicates in the incoming data
      const warehouseIds = warehouses.map(w => w.idwarehouse);
      const uniqueIds = [...new Set(warehouseIds)];
      
      if (uniqueIds.length < warehouseIds.length) {
        console.warn(`⚠️ Found ${warehouseIds.length - uniqueIds.length} duplicate warehouse IDs in the incoming data`);
        
        // Log the duplicates for investigation
        const idCounts = {};
        warehouseIds.forEach(id => {
          idCounts[id] = (idCounts[id] || 0) + 1;
        });
        
        Object.entries(idCounts)
          .filter(([_, count]) => count > 1)
          .forEach(([id, count]) => {
            console.warn(`Warehouse ID ${id} appears ${count} times in the incoming data`);
          });
      }
      
      // Process each warehouse with duplicate prevention
      for (const warehouse of warehouses) {
        try {
          // Check if this warehouse ID already exists in the database
          const checkResult = await pool.request()
            .input('idwarehouse', sql.Int, warehouse.idwarehouse)
            .query('SELECT id, idwarehouse FROM Warehouses WHERE idwarehouse = @idwarehouse');
          
          if (checkResult.recordset.length > 1) {
            // Found multiple records with the same warehouse ID - this shouldn't happen with our fix
            console.warn(`⚠️ Found ${checkResult.recordset.length} records with warehouse ID ${warehouse.idwarehouse} in the database`);
            
            // Log the issue but continue processing
            duplicateCount++;
          }
          
          if (checkResult.recordset.length > 0) {
            // Update existing warehouse
            await pool.request()
              .input('id', sql.Int, checkResult.recordset[0].id)
              .input('idwarehouse', sql.Int, warehouse.idwarehouse)
              .input('name', sql.NVarChar, warehouse.name || '')
              .input('code', sql.NVarChar, warehouse.code || '')
              .input('address', sql.NVarChar, warehouse.address || '')
              .input('address2', sql.NVarChar, warehouse.address2 || '')
              .input('zipcode', sql.NVarChar, warehouse.zipcode || '')
              .input('city', sql.NVarChar, warehouse.city || '')
              .input('region', sql.NVarChar, warehouse.region || '')
              .input('country', sql.NVarChar, warehouse.country || '')
              .input('telephone', sql.NVarChar, warehouse.telephone || '')
              .input('email', sql.NVarChar, warehouse.email || '')
              .input('active', sql.Bit, warehouse.active === true ? 1 : 0)
              .input('last_sync_date', sql.DateTime, new Date())
              .query(`
                UPDATE Warehouses SET
                  idwarehouse = @idwarehouse,
                  name = @name,
                  code = @code,
                  address = @address,
                  address2 = @address2,
                  zipcode = @zipcode,
                  city = @city,
                  region = @region,
                  country = @country,
                  telephone = @telephone,
                  email = @email,
                  active = @active,
                  last_sync_date = @last_sync_date
                WHERE id = @id
              `);
          } else {
            // Insert new warehouse
            await pool.request()
              .input('idwarehouse', sql.Int, warehouse.idwarehouse)
              .input('name', sql.NVarChar, warehouse.name || '')
              .input('code', sql.NVarChar, warehouse.code || '')
              .input('address', sql.NVarChar, warehouse.address || '')
              .input('address2', sql.NVarChar, warehouse.address2 || '')
              .input('zipcode', sql.NVarChar, warehouse.zipcode || '')
              .input('city', sql.NVarChar, warehouse.city || '')
              .input('region', sql.NVarChar, warehouse.region || '')
              .input('country', sql.NVarChar, warehouse.country || '')
              .input('telephone', sql.NVarChar, warehouse.telephone || '')
              .input('email', sql.NVarChar, warehouse.email || '')
              .input('active', sql.Bit, warehouse.active === true ? 1 : 0)
              .input('last_sync_date', sql.DateTime, new Date())
              .query(`
                INSERT INTO Warehouses (
                  idwarehouse, name, code, address, address2, zipcode,
                  city, region, country, telephone, email, active, last_sync_date
                ) VALUES (
                  @idwarehouse, @name, @code, @address, @address2, @zipcode,
                  @city, @region, @country, @telephone, @email, @active, @last_sync_date
                )
              `);
          }
          
          savedCount++;
        } catch (warehouseError) {
          console.error(`Error processing warehouse ${warehouse.idwarehouse}: ${warehouseError.message}`);
          errorCount++;
        }
      }
      
      // Check for any remaining duplicates in the database
      const duplicateCheck = await pool.request().query(`
        SELECT idwarehouse, COUNT(*) as count
        FROM Warehouses
        GROUP BY idwarehouse
        HAVING COUNT(*) > 1
      `);
      
      if (duplicateCheck.recordset.length > 0) {
        console.warn(`⚠️ Found ${duplicateCheck.recordset.length} warehouse IDs with duplicates in the database after sync`);
        
        // Log the duplicates for investigation
        duplicateCheck.recordset.forEach(record => {
          console.warn(`Warehouse ID ${record.idwarehouse} has ${record.count} records in the database`);
        });
        
        // Optionally, automatically fix duplicates
        if (this.autoFixDuplicates) {
          console.log('Automatically fixing duplicate warehouse IDs...');
          
          // Keep only the most recently updated record for each duplicate
          await pool.request().query(`
            WITH CTE AS (
                SELECT *, 
                       ROW_NUMBER() OVER (PARTITION BY idwarehouse ORDER BY last_sync_date DESC, id DESC) as rn
                FROM Warehouses
                WHERE idwarehouse IN (
                    SELECT idwarehouse
                    FROM Warehouses
                    GROUP BY idwarehouse
                    HAVING COUNT(*) > 1
                )
            )
            DELETE FROM CTE WHERE rn > 1
          `);
          
          console.log('Duplicate warehouse IDs fixed');
        }
      }
      
      console.log(`✅ Saved ${savedCount} warehouses to database (${errorCount} errors, ${duplicateCount} duplicates detected)`);
      return {
        success: true,
        savedCount,
        errorCount,
        duplicateCount
      };
    } catch (error) {
      console.error(`❌ Error syncing warehouses: ${error.message}`);
      return {
        success: false,
        savedCount: 0,
        errorCount: warehouses ? warehouses.length : 0,
        error: error.message
      };
    }
  }

  /**
   * Add a unique constraint to the Warehouses table to prevent future duplicates
   * @returns {Promise<boolean>} - Success status
   */
  async addUniqueConstraintToWarehousesTable() {
    try {
      console.log('Adding unique constraint to Warehouses table...');
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if the constraint already exists
      const constraintCheck = await pool.request().query(`
        SELECT COUNT(*) as constraintExists
        FROM sys.indexes 
        WHERE name = 'UX_Warehouses_idwarehouse' AND object_id = OBJECT_ID('Warehouses')
      `);
      
      if (constraintCheck.recordset[0].constraintExists > 0) {
        console.log('Unique constraint already exists on Warehouses.idwarehouse');
        return true;
      }
      
      // Add the unique constraint
      await pool.request().query(`
        CREATE UNIQUE INDEX UX_Warehouses_idwarehouse ON Warehouses(idwarehouse)
      `);
      
      console.log('✅ Added unique constraint to Warehouses.idwarehouse');
      return true;
    } catch (error) {
      console.error(`❌ Error adding unique constraint to Warehouses table: ${error.message}`);
      return false;
    }
  }

  /**
   * Sync all warehouses from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Sync results
   */
  async syncAllWarehouses(fullSync = false) {
    try {
      console.log(`Starting ${fullSync ? 'full' : 'incremental'} warehouse sync...`);
      
      // Get all warehouses from Picqer
      const warehouses = await this.getAllWarehouses();
      
      // Sync warehouses to database
      const syncResults = await this.syncWarehouses(warehouses);
      
      // Update sync status
      if (syncResults.success) {
        // Update sync status in database if needed
      }
      
      return {
        success: true,
        warehouses: warehouses.length,
        saved: syncResults.savedCount,
        errors: syncResults.errorCount
      };
    } catch (error) {
      console.error(`❌ Error syncing all warehouses: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = WarehouseService;
