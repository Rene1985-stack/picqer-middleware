/**
 * Simplified Sync Module
 * 
 * This module handles all synchronization between Picqer and SQL database.
 * It includes database schema fixes and entity-specific sync functions.
 */
const sql = require('mssql');
const axios = require('axios');

// Add delay between requests to respect rate limits
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fix database schema to ensure all required tables and columns exist
 * @param {Object} dbConfig - Database configuration
 * @returns {Promise<boolean>} - Whether the schema fix was successful
 */
async function fixDatabaseSchema(dbConfig) {
  console.log('Starting database schema fix...');
  
  let pool;
  
  try {
    // Connect to database
    console.log('Connecting to database...');
    pool = await new sql.ConnectionPool(dbConfig).connect();
    console.log('Connected to database successfully');
    
    // Create SyncProgress table with all required columns
    console.log('Creating/updating SyncProgress table...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SyncProgress')
      BEGIN
        CREATE TABLE SyncProgress (
          id INT IDENTITY(1,1) PRIMARY KEY,
          sync_id VARCHAR(100) NOT NULL,
          entity_type VARCHAR(50) NOT NULL,
          status VARCHAR(20) NOT NULL,
          start_time DATETIMEOFFSET NOT NULL DEFAULT GETDATE(),
          end_time DATETIMEOFFSET NULL,
          count INT DEFAULT 0,
          error NVARCHAR(MAX) NULL
        );
        PRINT 'Created SyncProgress table';
      END
      ELSE
      BEGIN
        -- Check if columns exist and add them if they don't
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SyncProgress' AND COLUMN_NAME = 'start_time')
        BEGIN
          ALTER TABLE SyncProgress ADD start_time DATETIMEOFFSET NOT NULL DEFAULT GETDATE();
          PRINT 'Added start_time column to SyncProgress table';
        END
        
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SyncProgress' AND COLUMN_NAME = 'end_time')
        BEGIN
          ALTER TABLE SyncProgress ADD end_time DATETIMEOFFSET NULL;
          PRINT 'Added end_time column to SyncProgress table';
        END
        
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SyncProgress' AND COLUMN_NAME = 'error')
        BEGIN
          ALTER TABLE SyncProgress ADD error NVARCHAR(MAX) NULL;
          PRINT 'Added error column to SyncProgress table';
        END
        
        PRINT 'Updated SyncProgress table';
      END
    `);
    
    // Create SyncStatus table if it doesn't exist
    console.log('Creating/updating SyncStatus table...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SyncStatus')
      BEGIN
        CREATE TABLE SyncStatus (
          id INT IDENTITY(1,1) PRIMARY KEY,
          entity_type VARCHAR(50) NOT NULL,
          entity_name VARCHAR(50) NOT NULL,
          last_sync_date DATETIMEOFFSET NOT NULL DEFAULT GETDATE()
        );
        PRINT 'Created SyncStatus table';
      END
      ELSE
      BEGIN
        PRINT 'SyncStatus table already exists';
      END
    `);
    
    // Create entity tables with last_sync_date column
    const entityTables = [
      { name: 'Products', idColumn: 'idproduct' },
      { name: 'Picklists', idColumn: 'idpicklist' },
      { name: 'Warehouses', idColumn: 'idwarehouse' },
      { name: 'Users', idColumn: 'iduser' },
      { name: 'Suppliers', idColumn: 'idsupplier' },
      { name: 'Batches', idColumn: 'idpicklist_batch' }
    ];
    
    for (const table of entityTables) {
      console.log(`Creating/updating ${table.name} table...`);
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${table.name}')
        BEGIN
          CREATE TABLE ${table.name} (
            ${table.idColumn} VARCHAR(50) PRIMARY KEY,
            name NVARCHAR(255) NULL,
            created DATETIMEOFFSET NULL DEFAULT GETDATE(),
            updated DATETIMEOFFSET NULL DEFAULT GETDATE(),
            data NVARCHAR(MAX) NULL,
            last_sync_date DATETIMEOFFSET NULL DEFAULT GETDATE()
          );
          PRINT 'Created ${table.name} table';
        END
        ELSE
        BEGIN
          -- Check if last_sync_date column exists and add it if it doesn't
          IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${table.name}' AND COLUMN_NAME = 'last_sync_date')
          BEGIN
            ALTER TABLE ${table.name} ADD last_sync_date DATETIMEOFFSET NULL DEFAULT GETDATE();
            PRINT 'Added last_sync_date column to ${table.name} table';
          END
          
          PRINT 'Updated ${table.name} table';
        END
      `);
    }
    
    // Insert initial records into SyncStatus if needed
    console.log('Adding initial records to SyncStatus if needed...');
    for (const table of entityTables) {
      const entityType = table.name.toLowerCase().slice(0, -1); // Remove 's' from end
      
      await pool.request()
        .input('entityType', sql.VarChar, entityType)
        .input('entityName', sql.VarChar, entityType)
        .input('lastSyncDate', sql.DateTimeOffset, new Date(0)) // Start with epoch time
        .query(`
          IF NOT EXISTS (SELECT * FROM SyncStatus WHERE entity_type = @entityType)
          BEGIN
            INSERT INTO SyncStatus (entity_type, entity_name, last_sync_date)
            VALUES (@entityType, @entityName, @lastSyncDate);
            PRINT 'Added initial record for ${entityType} in SyncStatus';
          END
          ELSE
          BEGIN
            PRINT '${entityType} record already exists in SyncStatus';
          END
        `);
    }
    
    console.log('✅ Database schema fix completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Error fixing database schema:', error.message);
    return false;
  } finally {
    if (pool) {
      await pool.close();
      console.log('Database connection closed');
    }
  }
}

/**
 * Sync warehouses from Picqer to SQL database
 * @param {Object} warehouseService - Warehouse service instance
 * @returns {Promise<Object>} - Sync result
 */
async function syncWarehouses(warehouseService) {
  console.log('Starting warehouses sync...');
  
  try {
    // Ensure pool is initialized
    if (!warehouseService.pool) {
      warehouseService.pool = await warehouseService.initializePool();
    }
    
    // Get last sync date
    const lastSyncDate = await getLastSyncDate(warehouseService.pool, 'warehouse');
    console.log(`Last warehouses sync date: ${lastSyncDate.toISOString()}`);
    
    // Create sync progress record
    const syncId = `warehouse_${Date.now()}`;
    await createSyncProgressRecord(warehouseService.pool, syncId, 'warehouse');
    
    // Fetch warehouses from Picqer
    console.log('Fetching warehouses from Picqer...');
    const warehouses = await warehouseService.fetchWarehouses();
    console.log(`Fetched ${warehouses.length} warehouses from Picqer`);
    
    // Save warehouses to database
    let count = 0;
    for (const warehouse of warehouses) {
      try {
        await warehouseService.saveWarehouse(warehouse);
        count++;
      } catch (error) {
        console.error(`Error saving warehouse ${warehouse.idwarehouse}:`, error.message);
      }
      
      // Add delay between requests
      await delay(2000);
    }
    
    // Update sync status
    await updateSyncStatus(warehouseService.pool, 'warehouse');
    
    // Update sync progress
    await updateSyncProgressRecord(warehouseService.pool, syncId, 'completed', count);
    
    console.log(`Warehouse sync completed. Synced ${count} warehouses.`);
    return {
      success: true,
      message: `Synced ${count} warehouses successfully`,
      count
    };
  } catch (error) {
    console.error('Error syncing warehouses:', error.message);
    return {
      success: false,
      message: `Error syncing warehouses: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * Sync users from Picqer to SQL database
 * @param {Object} userService - User service instance
 * @returns {Promise<Object>} - Sync result
 */
async function syncUsers(userService) {
  console.log('Starting users sync...');
  
  try {
    // Ensure pool is initialized
    if (!userService.pool) {
      userService.pool = await userService.initializePool();
    }
    
    // Get last sync date
    const lastSyncDate = await getLastSyncDate(userService.pool, 'user');
    console.log(`Last users sync date: ${lastSyncDate.toISOString()}`);
    
    // Create sync progress record
    const syncId = `user_${Date.now()}`;
    await createSyncProgressRecord(userService.pool, syncId, 'user');
    
    // Fetch users from Picqer
    console.log('Fetching users from Picqer...');
    const users = await userService.fetchUsers();
    console.log(`Fetched ${users.length} users from Picqer`);
    
    // Save users to database
    let count = 0;
    for (const user of users) {
      try {
        await userService.saveUser(user);
        count++;
      } catch (error) {
        console.error(`Error saving user ${user.iduser}:`, error.message);
      }
      
      // Add delay between requests
      await delay(2000);
    }
    
    // Update sync status
    await updateSyncStatus(userService.pool, 'user');
    
    // Update sync progress
    await updateSyncProgressRecord(userService.pool, syncId, 'completed', count);
    
    console.log(`User sync completed. Synced ${count} users.`);
    return {
      success: true,
      message: `Synced ${count} users successfully`,
      count
    };
  } catch (error) {
    console.error('Error syncing users:', error.message);
    return {
      success: false,
      message: `Error syncing users: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * Sync suppliers from Picqer to SQL database
 * @param {Object} supplierService - Supplier service instance
 * @returns {Promise<Object>} - Sync result
 */
async function syncSuppliers(supplierService) {
  console.log('Starting suppliers sync...');
  
  try {
    // Ensure pool is initialized
    if (!supplierService.pool) {
      supplierService.pool = await supplierService.initializePool();
    }
    
    // Get last sync date
    const lastSyncDate = await getLastSyncDate(supplierService.pool, 'supplier');
    console.log(`Last suppliers sync date: ${lastSyncDate.toISOString()}`);
    
    // Create sync progress record
    const syncId = `supplier_${Date.now()}`;
    await createSyncProgressRecord(supplierService.pool, syncId, 'supplier');
    
    // Fetch suppliers from Picqer
    console.log('Fetching suppliers from Picqer...');
    const suppliers = await supplierService.fetchSuppliers();
    console.log(`Fetched ${suppliers.length} suppliers from Picqer`);
    
    // Save suppliers to database
    let count = 0;
    for (const supplier of suppliers) {
      try {
        await supplierService.saveSupplier(supplier);
        count++;
      } catch (error) {
        console.error(`Error saving supplier ${supplier.idsupplier}:`, error.message);
      }
      
      // Add delay between requests
      await delay(2000);
    }
    
    // Update sync status
    await updateSyncStatus(supplierService.pool, 'supplier');
    
    // Update sync progress
    await updateSyncProgressRecord(supplierService.pool, syncId, 'completed', count);
    
    console.log(`Supplier sync completed. Synced ${count} suppliers.`);
    return {
      success: true,
      message: `Synced ${count} suppliers successfully`,
      count
    };
  } catch (error) {
    console.error('Error syncing suppliers:', error.message);
    return {
      success: false,
      message: `Error syncing suppliers: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * Sync picklists from Picqer to SQL database
 * @param {Object} picklistService - Picklist service instance
 * @returns {Promise<Object>} - Sync result
 */
async function syncPicklists(picklistService) {
  console.log('Starting picklists sync...');
  
  try {
    // Ensure pool is initialized
    if (!picklistService.pool) {
      picklistService.pool = await picklistService.initializePool();
    }
    
    // Get last sync date
    const lastSyncDate = await getLastSyncDate(picklistService.pool, 'picklist');
    console.log(`Last picklists sync date: ${lastSyncDate.toISOString()}`);
    
    // Create sync progress record
    const syncId = `picklist_${Date.now()}`;
    await createSyncProgressRecord(picklistService.pool, syncId, 'picklist');
    
    // Fetch picklists from Picqer
    console.log('Fetching picklists from Picqer...');
    const picklists = await picklistService.fetchPicklists();
    console.log(`Fetched ${picklists.length} picklists from Picqer`);
    
    // Save picklists to database
    let count = 0;
    for (const picklist of picklists) {
      try {
        await picklistService.savePicklist(picklist);
        count++;
      } catch (error) {
        console.error(`Error saving picklist ${picklist.idpicklist}:`, error.message);
      }
      
      // Add delay between requests
      await delay(2000);
    }
    
    // Update sync status
    await updateSyncStatus(picklistService.pool, 'picklist');
    
    // Update sync progress
    await updateSyncProgressRecord(picklistService.pool, syncId, 'completed', count);
    
    console.log(`Picklist sync completed. Synced ${count} picklists.`);
    return {
      success: true,
      message: `Synced ${count} picklists successfully`,
      count
    };
  } catch (error) {
    console.error('Error syncing picklists:', error.message);
    return {
      success: false,
      message: `Error syncing picklists: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * Sync batches from Picqer to SQL database
 * @param {Object} batchService - Batch service instance
 * @returns {Promise<Object>} - Sync result
 */
async function syncBatches(batchService) {
  console.log('Starting batches sync...');
  
  try {
    // Ensure pool is initialized
    if (!batchService.pool) {
      batchService.pool = await batchService.initializePool();
    }
    
    // Get last sync date
    const lastSyncDate = await getLastSyncDate(batchService.pool, 'batch');
    console.log(`Last batches sync date: ${lastSyncDate.toISOString()}`);
    
    // Create sync progress record
    const syncId = `batch_${Date.now()}`;
    await createSyncProgressRecord(batchService.pool, syncId, 'batch');
    
    // Fetch batches from Picqer
    console.log('Fetching batches from Picqer...');
    const batches = await batchService.fetchBatches();
    console.log(`Fetched ${batches.length} batches from Picqer`);
    
    // Save batches to database
    let count = 0;
    for (const batch of batches) {
      try {
        await batchService.saveBatch(batch);
        count++;
      } catch (error) {
        console.error(`Error saving batch ${batch.idpicklist_batch}:`, error.message);
      }
      
      // Add delay between requests
      await delay(2000);
    }
    
    // Update sync status
    await updateSyncStatus(batchService.pool, 'batch');
    
    // Update sync progress
    await updateSyncProgressRecord(batchService.pool, syncId, 'completed', count);
    
    console.log(`Batch sync completed. Synced ${count} batches.`);
    return {
      success: true,
      message: `Synced ${count} batches successfully`,
      count
    };
  } catch (error) {
    console.error('Error syncing batches:', error.message);
    return {
      success: false,
      message: `Error syncing batches: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * Get sync status for all entities
 * @param {Object} dbConfig - Database configuration
 * @returns {Promise<Object>} - Sync status
 */
async function getSyncStatus(dbConfig) {
  console.log('Getting sync status...');
  
  let pool;
  
  try {
    // Connect to database
    console.log('Connecting to database...');
    pool = await new sql.ConnectionPool(dbConfig).connect();
    console.log('Connected to database successfully');
    
    // Get sync status for all entities
    const result = await pool.request().query(`
      SELECT entity_type, entity_name, last_sync_date
      FROM SyncStatus
      ORDER BY entity_type
    `);
    
    // Get counts for all entities
    const counts = {};
    const entityTables = ['Products', 'Picklists', 'Warehouses', 'Users', 'Suppliers', 'Batches'];
    
    for (const table of entityTables) {
      const countResult = await pool.request().query(`
        SELECT COUNT(*) AS count
        FROM ${table}
      `);
      
      counts[table.toLowerCase()] = countResult.recordset[0].count;
    }
    
    // Get recent sync progress
    const progressResult = await pool.request().query(`
      SELECT TOP 10 sync_id, entity_type, status, start_time, end_time, count, error
      FROM SyncProgress
      ORDER BY start_time DESC
    `);
    
    return {
      success: true,
      status: result.recordset,
      counts,
      recentSyncs: progressResult.recordset
    };
  } catch (error) {
    console.error('Error getting sync status:', error.message);
    return {
      success: false,
      message: `Error getting sync status: ${error.message}`,
      error: error.message
    };
  } finally {
    if (pool) {
      await pool.close();
      console.log('Database connection closed');
    }
  }
}

/**
 * Get last sync date for an entity
 * @param {Object} pool - SQL connection pool
 * @param {string} entityType - Entity type
 * @returns {Promise<Date>} - Last sync date
 */
async function getLastSyncDate(pool, entityType) {
  try {
    const result = await pool.request()
      .input('entityType', sql.VarChar, entityType)
      .query(`
        SELECT TOP 1 last_sync_date
        FROM SyncStatus
        WHERE entity_type = @entityType
        ORDER BY last_sync_date DESC
      `);
    
    if (result.recordset.length > 0) {
      return new Date(result.recordset[0].last_sync_date);
    } else {
      console.log(`No last sync date found for ${entityType}, using default`);
      return new Date(0); // Default to epoch time if no sync has been performed
    }
  } catch (error) {
    console.error(`Error getting last sync date for ${entityType}:`, error.message);
    return new Date(0); // Default to epoch time on error
  }
}

/**
 * Create sync progress record
 * @param {Object} pool - SQL connection pool
 * @param {string} syncId - Sync ID
 * @param {string} entityType - Entity type
 * @returns {Promise<void>}
 */
async function createSyncProgressRecord(pool, syncId, entityType) {
  try {
    await pool.request()
      .input('syncId', sql.VarChar, syncId)
      .input('entityType', sql.VarChar, entityType)
      .input('status', sql.VarChar, 'in_progress')
      .input('startTime', sql.DateTimeOffset, new Date())
      .query(`
        INSERT INTO SyncProgress (sync_id, entity_type, status, start_time)
        VALUES (@syncId, @entityType, @status, @startTime)
      `);
  } catch (error) {
    console.error(`Error creating sync progress record for ${entityType}:`, error.message);
  }
}

/**
 * Update sync status
 * @param {Object} pool - SQL connection pool
 * @param {string} entityType - Entity type
 * @returns {Promise<void>}
 */
async function updateSyncStatus(pool, entityType) {
  try {
    await pool.request()
      .input('entityType', sql.VarChar, entityType)
      .input('lastSyncDate', sql.DateTimeOffset, new Date())
      .query(`
        UPDATE SyncStatus
        SET last_sync_date = @lastSyncDate
        WHERE entity_type = @entityType
        
        IF @@ROWCOUNT = 0
        BEGIN
          INSERT INTO SyncStatus (entity_type, entity_name, last_sync_date)
          VALUES (@entityType, @entityType, @lastSyncDate)
        END
      `);
  } catch (error) {
    console.error(`Error updating sync status for ${entityType}:`, error.message);
  }
}

/**
 * Update sync progress record
 * @param {Object} pool - SQL connection pool
 * @param {string} syncId - Sync ID
 * @param {string} status - Status
 * @param {number} count - Count
 * @param {string} error - Error message
 * @returns {Promise<void>}
 */
async function updateSyncProgressRecord(pool, syncId, status, count, error = null) {
  try {
    await pool.request()
      .input('syncId', sql.VarChar, syncId)
      .input('status', sql.VarChar, status)
      .input('endTime', sql.DateTimeOffset, new Date())
      .input('count', sql.Int, count)
      .input('error', sql.NVarChar, error)
      .query(`
        UPDATE SyncProgress
        SET status = @status, end_time = @endTime, count = @count, error = @error
        WHERE sync_id = @syncId
      `);
  } catch (error) {
    console.error(`Error updating sync progress record for ${syncId}:`, error.message);
  }
}

module.exports = {
  fixDatabaseSchema,
  syncWarehouses,
  syncUsers,
  syncSuppliers,
  syncPicklists,
  syncBatches,
  getSyncStatus
};
