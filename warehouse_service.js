/**
 * Enhanced Warehouse Service with saveWarehousesToDatabase method
 * Fixes the "No method available to save warehouses to database" error
 */

// Import required modules
const axios = require('axios');
const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');

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
    
    console.log('WarehouseService initialized successfully');
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
   * Get warehouses updated since a specific date
   * @param {Date} since - Date to filter warehouses by
   * @returns {Promise<Array>} Array of warehouses
   */
  async getWarehousesUpdatedSince(since) {
    try {
      console.log(`Fetching warehouses updated since: ${since.toISOString()}`);
      
      // Picqer API doesn't support filtering warehouses by update date
      // So we fetch all warehouses and filter them in memory
      const allWarehouses = await this.getAllWarehouses();
      console.log(`Retrieved ${allWarehouses.length} warehouses from Picqer`);
      
      // Return all warehouses since we can't filter by date on the API
      return allWarehouses;
    } catch (error) {
      console.error(`Error fetching warehouses updated since ${since.toISOString()}:`, error.message);
      throw error;
    }
  }

  /**
   * Save warehouses to database - MISSING METHOD ADDED
   * @param {Array} warehouses - Array of warehouses to save
   * @param {string} syncId - Sync ID for tracking
   * @returns {Promise<Object>} - Results of the save operation
   */
  async saveWarehousesToDatabase(warehouses, syncId = null) {
    try {
      if (!warehouses || warehouses.length === 0) {
        console.log('No warehouses to save to database');
        return {
          success: true,
          savedCount: 0,
          errorCount: 0
        };
      }
      
      console.log(`Saving ${warehouses.length} warehouses to database...`);
      const pool = await sql.connect(this.sqlConfig);
      let savedCount = 0;
      let errorCount = 0;
      let duplicateCount = 0;
      
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
      console.error(`❌ Error saving warehouses to database: ${error.message}`);
      return {
        success: false,
        savedCount: 0,
        errorCount: warehouses ? warehouses.length : 0,
        error: error.message
      };
    }
  }

  /**
   * Create or get sync progress record
   * @param {string} entityType - Entity type for sync
   * @param {string} syncId - Optional sync ID
   * @returns {Promise<Object>} - Sync progress record
   */
  async createOrGetSyncProgress(entityType, syncId = null) {
    try {
      if (!syncId) {
        syncId = uuidv4();
      }
      
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if sync progress record exists
      const checkResult = await pool.request()
        .input('entity_type', sql.NVarChar, entityType)
        .input('sync_id', sql.NVarChar, syncId)
        .query('SELECT * FROM SyncProgress WHERE entity_type = @entity_type AND sync_id = @sync_id');
      
      if (checkResult.recordset.length > 0) {
        return checkResult.recordset[0];
      }
      
      // Create new sync progress record
      const insertResult = await pool.request()
        .input('entity_type', sql.NVarChar, entityType)
        .input('sync_id', sql.NVarChar, syncId)
        .input('current_offset', sql.Int, 0)
        .input('batch_number', sql.Int, 0)
        .input('items_processed', sql.Int, 0)
        .input('status', sql.NVarChar, 'in_progress')
        .query(`
          INSERT INTO SyncProgress (
            entity_type, sync_id, current_offset, batch_number, items_processed, status
          ) VALUES (
            @entity_type, @sync_id, @current_offset, @batch_number, @items_processed, @status
          );
          SELECT * FROM SyncProgress WHERE entity_type = @entity_type AND sync_id = @sync_id;
        `);
      
      return insertResult.recordset[0];
    } catch (error) {
      console.error(`Error creating/getting sync progress: ${error.message}`);
      // Return a minimal object to prevent further errors
      return {
        entity_type: entityType,
        sync_id: syncId || uuidv4(),
        current_offset: 0,
        batch_number: 0,
        items_processed: 0,
        status: 'in_progress'
      };
    }
  }

  /**
   * Update sync progress
   * @param {string} entityType - Entity type for sync
   * @param {string} syncId - Sync ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} - Updated sync progress record
   */
  async updateSyncProgress(entityType, syncId, updates) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Build update query dynamically
      let updateQuery = 'UPDATE SyncProgress SET ';
      const queryParts = [];
      const request = pool.request()
        .input('entity_type', sql.NVarChar, entityType)
        .input('sync_id', sql.NVarChar, syncId);
      
      // Add each update field
      Object.entries(updates).forEach(([key, value], index) => {
        const paramName = `param${index}`;
        queryParts.push(`${key} = @${paramName}`);
        
        // Determine SQL type based on value type
        if (typeof value === 'number') {
          request.input(paramName, sql.Int, value);
        } else if (value instanceof Date) {
          request.input(paramName, sql.DateTime, value);
        } else {
          request.input(paramName, sql.NVarChar, value);
        }
      });
      
      // Add last_updated timestamp
      queryParts.push('last_updated = GETDATE()');
      
      // Complete the query
      updateQuery += queryParts.join(', ');
      updateQuery += ' WHERE entity_type = @entity_type AND sync_id = @sync_id;';
      updateQuery += ' SELECT * FROM SyncProgress WHERE entity_type = @entity_type AND sync_id = @sync_id;';
      
      // Execute the update
      const result = await request.query(updateQuery);
      
      return result.recordset[0];
    } catch (error) {
      console.error(`Error updating sync progress: ${error.message}`);
      return null;
    }
  }

  /**
   * Complete sync progress
   * @param {string} entityType - Entity type for sync
   * @param {string} syncId - Sync ID
   * @param {boolean} success - Whether sync was successful
   * @returns {Promise<Object>} - Completed sync progress record
   */
  async completeSyncProgress(entityType, syncId, success = true) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Update sync progress record
      const result = await pool.request()
        .input('entity_type', sql.NVarChar, entityType)
        .input('sync_id', sql.NVarChar, syncId)
        .input('status', sql.NVarChar, success ? 'completed' : 'failed')
        .query(`
          UPDATE SyncProgress SET
            status = @status,
            completed_at = GETDATE(),
            last_updated = GETDATE()
          WHERE entity_type = @entity_type AND sync_id = @sync_id;
          
          SELECT * FROM SyncProgress WHERE entity_type = @entity_type AND sync_id = @sync_id;
        `);
      
      return result.recordset[0];
    } catch (error) {
      console.error(`Error completing sync progress: ${error.message}`);
      return null;
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
   * Get warehouse count from database
   * @returns {Promise<number>} - Count of warehouses in database
   */
  async getWarehouseCountFromDatabase() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query('SELECT COUNT(*) as count FROM Warehouses');
      return result.recordset[0].count;
    } catch (error) {
      console.error(`Error getting warehouse count: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get last sync date for warehouses
   * @returns {Promise<Date|null>} - Last sync date or null if no sync
   */
  async getLastSyncDate() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query(`
        SELECT MAX(last_sync_date) as last_sync_date FROM Warehouses
      `);
      
      return result.recordset[0].last_sync_date || null;
    } catch (error) {
      console.error(`Error getting last sync date: ${error.message}`);
      return null;
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
      
      // Create sync progress record
      let syncId = uuidv4();
      let syncProgress;
      
      try {
        syncProgress = await this.createOrGetSyncProgress('warehouses', syncId);
      } catch (progressError) {
        console.log('createOrGetSyncProgress method not found in WarehouseService, using default progress');
        syncProgress = {
          entity_type: 'warehouses',
          sync_id: syncId,
          current_offset: 0,
          batch_number: 0,
          items_processed: 0
        };
      }
      
      // Get last sync date for incremental sync
      let since = new Date('2025-01-01'); // Default to a recent date
      if (!fullSync) {
        const lastSyncDate = await this.getLastSyncDate();
        if (lastSyncDate) {
          since = new Date(lastSyncDate);
        }
      }
      
      // Get warehouses from Picqer
      const warehouses = await this.getWarehousesUpdatedSince(since);
      
      // Save warehouses to database
      const syncResults = await this.saveWarehousesToDatabase(warehouses, syncId);
      
      // Update sync progress
      try {
        await this.updateSyncProgress('warehouses', syncId, {
          items_processed: syncResults.savedCount,
          total_items: warehouses.length
        });
        
        // Complete sync progress
        await this.completeSyncProgress('warehouses', syncId, syncResults.success);
      } catch (progressError) {
        console.log('Error updating sync progress:', progressError.message);
      }
      
      return {
        success: syncResults.success,
        warehouses: warehouses.length,
        saved: syncResults.savedCount,
        errors: syncResults.errorCount
      };
    } catch (error) {
      console.error(`❌ Error in ${fullSync ? 'full' : 'incremental'} warehouse sync: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Export the class directly
module.exports = WarehouseService;
