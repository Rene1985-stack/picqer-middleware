/**
 * Complete Middleware Fix Script
 * 
 * This script combines database schema fixes and direct data syncing in one file.
 * It first fixes the database schema issues, then directly syncs data from Picqer to SQL.
 */

require('dotenv').config();
const axios = require('axios');
const sql = require('mssql');

// Configuration from environment variables
const config = {
  picqer: {
    apiKey: process.env.PICQER_API_KEY,
    baseUrl: process.env.PICQER_BASE_URL || process.env.PICQER_API_URL,
    requestsPerMinute: 30
  },
  database: {
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    port: parseInt(process.env.SQL_PORT || '1433'),
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true
    }
  }
};

// Create API client
const apiClient = axios.create({
  baseURL: config.picqer.baseUrl,
  headers: {
    'Authorization': `Bearer ${config.picqer.apiKey}`,
    'Content-Type': 'application/json'
  }
});

// Add delay between requests to respect rate limits
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const requestDelay = 60000 / config.picqer.requestsPerMinute;

// Step 1: Fix database schema
async function fixDatabaseSchema(pool) {
  console.log('Starting database schema fix...');
  
  try {
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
  }
}

// Step 2: Sync warehouses
async function syncWarehouses(pool) {
  console.log('Syncing warehouses...');
  
  try {
    // Get last sync date
    const lastSyncResult = await pool.request()
      .input('entityType', sql.VarChar, 'warehouse')
      .query(`
        SELECT TOP 1 last_sync_date
        FROM SyncStatus
        WHERE entity_type = @entityType
        ORDER BY last_sync_date DESC
      `);
    
    const lastSyncDate = lastSyncResult.recordset.length > 0 
      ? new Date(lastSyncResult.recordset[0].last_sync_date)
      : new Date(0);
    
    console.log(`Last warehouse sync date: ${lastSyncDate.toISOString()}`);
    
    // Create sync progress record
    const syncId = `warehouse_${Date.now()}`;
    await pool.request()
      .input('syncId', sql.VarChar, syncId)
      .input('entityType', sql.VarChar, 'warehouse')
      .input('status', sql.VarChar, 'in_progress')
      .input('startTime', sql.DateTimeOffset, new Date())
      .query(`
        INSERT INTO SyncProgress (sync_id, entity_type, status, start_time)
        VALUES (@syncId, @entityType, @status, @startTime)
      `);
    
    // Fetch warehouses from Picqer
    console.log('Fetching warehouses from Picqer...');
    const response = await apiClient.get('/warehouses');
    const warehouses = response.data.data;
    console.log(`Fetched ${warehouses.length} warehouses from Picqer`);
    
    // Save warehouses to database
    let count = 0;
    for (const warehouse of warehouses) {
      try {
        // Check if warehouse already exists
        const existingWarehouse = await pool.request()
          .input('warehouseId', sql.VarChar, warehouse.idwarehouse)
          .query(`
            SELECT idwarehouse
            FROM Warehouses
            WHERE idwarehouse = @warehouseId
          `);
        
        if (existingWarehouse.recordset.length > 0) {
          // Update existing warehouse
          await pool.request()
            .input('warehouseId', sql.VarChar, warehouse.idwarehouse)
            .input('name', sql.NVarChar, warehouse.name || '')
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(warehouse))
            .input('lastSyncDate', sql.DateTimeOffset, new Date())
            .query(`
              UPDATE Warehouses
              SET name = @name,
                  updated = @updatedAt,
                  data = @data,
                  last_sync_date = @lastSyncDate
              WHERE idwarehouse = @warehouseId
            `);
        } else {
          // Insert new warehouse
          await pool.request()
            .input('warehouseId', sql.VarChar, warehouse.idwarehouse)
            .input('name', sql.NVarChar, warehouse.name || '')
            .input('createdAt', sql.DateTimeOffset, new Date())
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(warehouse))
            .input('lastSyncDate', sql.DateTimeOffset, new Date())
            .query(`
              INSERT INTO Warehouses (idwarehouse, name, created, updated, data, last_sync_date)
              VALUES (@warehouseId, @name, @createdAt, @updatedAt, @data, @lastSyncDate)
            `);
        }
        
        count++;
      } catch (error) {
        console.error(`Error saving warehouse ${warehouse.idwarehouse}:`, error.message);
      }
      
      // Add delay between requests
      await delay(requestDelay);
    }
    
    // Update sync status
    await pool.request()
      .input('entityType', sql.VarChar, 'warehouse')
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
    
    // Update sync progress
    await pool.request()
      .input('syncId', sql.VarChar, syncId)
      .input('status', sql.VarChar, 'completed')
      .input('endTime', sql.DateTimeOffset, new Date())
      .input('count', sql.Int, count)
      .query(`
        UPDATE SyncProgress
        SET status = @status, end_time = @endTime, count = @count
        WHERE sync_id = @syncId
      `);
    
    console.log(`Warehouse sync completed. Synced ${count} warehouses.`);
    return count;
  } catch (error) {
    console.error('Error syncing warehouses:', error.message);
    return 0;
  }
}

// Step 3: Sync users
async function syncUsers(pool) {
  console.log('Syncing users...');
  
  try {
    // Get last sync date
    const lastSyncResult = await pool.request()
      .input('entityType', sql.VarChar, 'user')
      .query(`
        SELECT TOP 1 last_sync_date
        FROM SyncStatus
        WHERE entity_type = @entityType
        ORDER BY last_sync_date DESC
      `);
    
    const lastSyncDate = lastSyncResult.recordset.length > 0 
      ? new Date(lastSyncResult.recordset[0].last_sync_date)
      : new Date(0);
    
    console.log(`Last user sync date: ${lastSyncDate.toISOString()}`);
    
    // Create sync progress record
    const syncId = `user_${Date.now()}`;
    await pool.request()
      .input('syncId', sql.VarChar, syncId)
      .input('entityType', sql.VarChar, 'user')
      .input('status', sql.VarChar, 'in_progress')
      .input('startTime', sql.DateTimeOffset, new Date())
      .query(`
        INSERT INTO SyncProgress (sync_id, entity_type, status, start_time)
        VALUES (@syncId, @entityType, @status, @startTime)
      `);
    
    // Fetch users from Picqer
    console.log('Fetching users from Picqer...');
    const response = await apiClient.get('/users');
    const users = response.data.data;
    console.log(`Fetched ${users.length} users from Picqer`);
    
    // Save users to database
    let count = 0;
    for (const user of users) {
      try {
        // Check if user already exists
        const existingUser = await pool.request()
          .input('userId', sql.VarChar, user.iduser)
          .query(`
            SELECT iduser
            FROM Users
            WHERE iduser = @userId
          `);
        
        if (existingUser.recordset.length > 0) {
          // Update existing user
          await pool.request()
            .input('userId', sql.VarChar, user.iduser)
            .input('name', sql.NVarChar, user.name || '')
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(user))
            .input('lastSyncDate', sql.DateTimeOffset, new Date())
            .query(`
              UPDATE Users
              SET name = @name,
                  updated = @updatedAt,
                  data = @data,
                  last_sync_date = @lastSyncDate
              WHERE iduser = @userId
            `);
        } else {
          // Insert new user
          await pool.request()
            .input('userId', sql.VarChar, user.iduser)
            .input('name', sql.NVarChar, user.name || '')
            .input('createdAt', sql.DateTimeOffset, new Date())
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(user))
            .input('lastSyncDate', sql.DateTimeOffset, new Date())
            .query(`
              INSERT INTO Users (iduser, name, created, updated, data, last_sync_date)
              VALUES (@userId, @name, @createdAt, @updatedAt, @data, @lastSyncDate)
            `);
        }
        
        count++;
      } catch (error) {
        console.error(`Error saving user ${user.iduser}:`, error.message);
      }
      
      // Add delay between requests
      await delay(requestDelay);
    }
    
    // Update sync status
    await pool.request()
      .input('entityType', sql.VarChar, 'user')
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
    
    // Update sync progress
    await pool.request()
      .input('syncId', sql.VarChar, syncId)
      .input('status', sql.VarChar, 'completed')
      .input('endTime', sql.DateTimeOffset, new Date())
      .input('count', sql.Int, count)
      .query(`
        UPDATE SyncProgress
        SET status = @status, end_time = @endTime, count = @count
        WHERE sync_id = @syncId
      `);
    
    console.log(`User sync completed. Synced ${count} users.`);
    return count;
  } catch (error) {
    console.error('Error syncing users:', error.message);
    return 0;
  }
}

// Step 4: Sync suppliers
async function syncSuppliers(pool) {
  console.log('Syncing suppliers...');
  
  try {
    // Get last sync date
    const lastSyncResult = await pool.request()
      .input('entityType', sql.VarChar, 'supplier')
      .query(`
        SELECT TOP 1 last_sync_date
        FROM SyncStatus
        WHERE entity_type = @entityType
        ORDER BY last_sync_date DESC
      `);
    
    const lastSyncDate = lastSyncResult.recordset.length > 0 
      ? new Date(lastSyncResult.recordset[0].last_sync_date)
      : new Date(0);
    
    console.log(`Last supplier sync date: ${lastSyncDate.toISOString()}`);
    
    // Create sync progress record
    const syncId = `supplier_${Date.now()}`;
    await pool.request()
      .input('syncId', sql.VarChar, syncId)
      .input('entityType', sql.VarChar, 'supplier')
      .input('status', sql.VarChar, 'in_progress')
      .input('startTime', sql.DateTimeOffset, new Date())
      .query(`
        INSERT INTO SyncProgress (sync_id, entity_type, status, start_time)
        VALUES (@syncId, @entityType, @status, @startTime)
      `);
    
    // Fetch suppliers from Picqer
    console.log('Fetching suppliers from Picqer...');
    const response = await apiClient.get('/suppliers');
    const suppliers = response.data.data;
    console.log(`Fetched ${suppliers.length} suppliers from Picqer`);
    
    // Save suppliers to database
    let count = 0;
    for (const supplier of suppliers) {
      try {
        // Check if supplier already exists
        const existingSupplier = await pool.request()
          .input('supplierId', sql.VarChar, supplier.idsupplier)
          .query(`
            SELECT idsupplier
            FROM Suppliers
            WHERE idsupplier = @supplierId
          `);
        
        if (existingSupplier.recordset.length > 0) {
          // Update existing supplier
          await pool.request()
            .input('supplierId', sql.VarChar, supplier.idsupplier)
            .input('name', sql.NVarChar, supplier.name || '')
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(supplier))
            .input('lastSyncDate', sql.DateTimeOffset, new Date())
            .query(`
              UPDATE Suppliers
              SET name = @name,
                  updated = @updatedAt,
                  data = @data,
                  last_sync_date = @lastSyncDate
              WHERE idsupplier = @supplierId
            `);
        } else {
          // Insert new supplier
          await pool.request()
            .input('supplierId', sql.VarChar, supplier.idsupplier)
            .input('name', sql.NVarChar, supplier.name || '')
            .input('createdAt', sql.DateTimeOffset, new Date())
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(supplier))
            .input('lastSyncDate', sql.DateTimeOffset, new Date())
            .query(`
              INSERT INTO Suppliers (idsupplier, name, created, updated, data, last_sync_date)
              VALUES (@supplierId, @name, @createdAt, @updatedAt, @data, @lastSyncDate)
            `);
        }
        
        count++;
      } catch (error) {
        console.error(`Error saving supplier ${supplier.idsupplier}:`, error.message);
      }
      
      // Add delay between requests
      await delay(requestDelay);
    }
    
    // Update sync status
    await pool.request()
      .input('entityType', sql.VarChar, 'supplier')
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
    
    // Update sync progress
    await pool.request()
      .input('syncId', sql.VarChar, syncId)
      .input('status', sql.VarChar, 'completed')
      .input('endTime', sql.DateTimeOffset, new Date())
      .input('count', sql.Int, count)
      .query(`
        UPDATE SyncProgress
        SET status = @status, end_time = @endTime, count = @count
        WHERE sync_id = @syncId
      `);
    
    console.log(`Supplier sync completed. Synced ${count} suppliers.`);
    return count;
  } catch (error) {
    console.error('Error syncing suppliers:', error.message);
    return 0;
  }
}

// Step 5: Sync picklists
async function syncPicklists(pool) {
  console.log('Syncing picklists...');
  
  try {
    // Get last sync date
    const lastSyncResult = await pool.request()
      .input('entityType', sql.VarChar, 'picklist')
      .query(`
        SELECT TOP 1 last_sync_date
        FROM SyncStatus
        WHERE entity_type = @entityType
        ORDER BY last_sync_date DESC
      `);
    
    const lastSyncDate = lastSyncResult.recordset.length > 0 
      ? new Date(lastSyncResult.recordset[0].last_sync_date)
      : new Date(0);
    
    console.log(`Last picklist sync date: ${lastSyncDate.toISOString()}`);
    
    // Create sync progress record
    const syncId = `picklist_${Date.now()}`;
    await pool.request()
      .input('syncId', sql.VarChar, syncId)
      .input('entityType', sql.VarChar, 'picklist')
      .input('status', sql.VarChar, 'in_progress')
      .input('startTime', sql.DateTimeOffset, new Date())
      .query(`
        INSERT INTO SyncProgress (sync_id, entity_type, status, start_time)
        VALUES (@syncId, @entityType, @status, @startTime)
      `);
    
    // Fetch picklists from Picqer
    console.log('Fetching picklists from Picqer...');
    const response = await apiClient.get('/picklists');
    const picklists = response.data.data;
    console.log(`Fetched ${picklists.length} picklists from Picqer`);
    
    // Save picklists to database
    let count = 0;
    for (const picklist of picklists) {
      try {
        // Check if picklist already exists
        const existingPicklist = await pool.request()
          .input('picklistId', sql.VarChar, picklist.idpicklist)
          .query(`
            SELECT idpicklist
            FROM Picklists
            WHERE idpicklist = @picklistId
          `);
        
        if (existingPicklist.recordset.length > 0) {
          // Update existing picklist
          await pool.request()
            .input('picklistId', sql.VarChar, picklist.idpicklist)
            .input('status', sql.NVarChar, picklist.status || '')
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(picklist))
            .input('lastSyncDate', sql.DateTimeOffset, new Date())
            .query(`
              UPDATE Picklists
              SET status = @status,
                  updated = @updatedAt,
                  data = @data,
                  last_sync_date = @lastSyncDate
              WHERE idpicklist = @picklistId
            `);
        } else {
          // Insert new picklist
          await pool.request()
            .input('picklistId', sql.VarChar, picklist.idpicklist)
            .input('status', sql.NVarChar, picklist.status || '')
            .input('createdAt', sql.DateTimeOffset, new Date())
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(picklist))
            .input('lastSyncDate', sql.DateTimeOffset, new Date())
            .query(`
              INSERT INTO Picklists (idpicklist, status, created, updated, data, last_sync_date)
              VALUES (@picklistId, @status, @createdAt, @updatedAt, @data, @lastSyncDate)
            `);
        }
        
        count++;
      } catch (error) {
        console.error(`Error saving picklist ${picklist.idpicklist}:`, error.message);
      }
      
      // Add delay between requests
      await delay(requestDelay);
    }
    
    // Update sync status
    await pool.request()
      .input('entityType', sql.VarChar, 'picklist')
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
    
    // Update sync progress
    await pool.request()
      .input('syncId', sql.VarChar, syncId)
      .input('status', sql.VarChar, 'completed')
      .input('endTime', sql.DateTimeOffset, new Date())
      .input('count', sql.Int, count)
      .query(`
        UPDATE SyncProgress
        SET status = @status, end_time = @endTime, count = @count
        WHERE sync_id = @syncId
      `);
    
    console.log(`Picklist sync completed. Synced ${count} picklists.`);
    return count;
  } catch (error) {
    console.error('Error syncing picklists:', error.message);
    return 0;
  }
}

// Main function to run everything
async function runCompleteSync() {
  console.log('Starting complete Picqer to SQL sync process...');
  console.log('Step 1: Connect to database and fix schema');
  
  try {
    // Connect to database
    console.log('Connecting to database...');
    console.log(`Server: ${config.database.server}`);
    console.log(`Database: ${config.database.database}`);
    console.log(`User: ${config.database.user}`);
    
    const pool = await new sql.ConnectionPool(config.database).connect();
    console.log('Connected to database successfully');
    
    // Fix database schema
    const schemaFixed = await fixDatabaseSchema(pool);
    if (!schemaFixed) {
      console.error('Failed to fix database schema. Aborting sync process.');
      await pool.close();
      return {
        success: false,
        error: 'Failed to fix database schema'
      };
    }
    
    // Sync all entity types
    console.log('Step 2: Sync warehouses');
    const warehouseCount = await syncWarehouses(pool);
    
    console.log('Step 3: Sync users');
    const userCount = await syncUsers(pool);
    
    console.log('Step 4: Sync suppliers');
    const supplierCount = await syncSuppliers(pool);
    
    console.log('Step 5: Sync picklists');
    const picklistCount = await syncPicklists(pool);
    
    // Close database connection
    await pool.close();
    console.log('Database connection closed');
    
    // Return results
    return {
      success: true,
      message: 'Complete sync process finished successfully',
      counts: {
        warehouses: warehouseCount,
        users: userCount,
        suppliers: supplierCount,
        picklists: picklistCount
      }
    };
  } catch (error) {
    console.error('Error in complete sync process:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the complete sync process
runCompleteSync()
  .then(result => {
    if (result.success) {
      console.log('✅ ' + result.message);
      if (result.counts) {
        console.log('Sync counts:');
        console.log(`- Warehouses: ${result.counts.warehouses}`);
        console.log(`- Users: ${result.counts.users}`);
        console.log(`- Suppliers: ${result.counts.suppliers}`);
        console.log(`- Picklists: ${result.counts.picklists}`);
      }
      process.exit(0);
    } else {
      console.error('❌ Sync failed:', result.error);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
