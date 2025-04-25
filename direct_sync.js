/**
 * Simple direct sync script
 * 
 * This script directly syncs data from Picqer to SQL database without relying on complex middleware.
 * It focuses on the core functionality of fetching data and storing it in the database.
 */

require('dotenv').config();
const axios = require('axios');
const sql = require('mssql');

// Configuration
const config = {
  picqer: {
    apiKey: process.env.PICQER_API_KEY,
    baseUrl: process.env.PICQER_BASE_URL || process.env.PICQER_API_URL,
    requestsPerMinute: 30
  },
  database: {
    server: process.env.SQL_SERVER || process.env.DB_HOST,
    port: parseInt(process.env.SQL_PORT || process.env.DB_PORT || '1433', 10),
    database: process.env.SQL_DATABASE || process.env.DB_NAME,
    user: process.env.SQL_USER || process.env.DB_USER,
    password: process.env.SQL_PASSWORD || process.env.DB_PASSWORD,
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

// Main sync function
async function syncPicqerData() {
  console.log('Starting Picqer data sync...');
  
  try {
    // Connect to database
    console.log('Connecting to database...');
    const pool = await new sql.ConnectionPool(config.database).connect();
    console.log('Connected to database successfully');
    
    // Sync each entity type
    await syncWarehouses(pool);
    await syncUsers(pool);
    await syncSuppliers(pool);
    await syncPicklists(pool);
    
    // Close database connection
    await pool.close();
    console.log('Database connection closed');
    
    return {
      success: true,
      message: 'Picqer data sync completed successfully'
    };
  } catch (error) {
    console.error('Error syncing Picqer data:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Sync warehouses
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
    throw error;
  }
}

// Sync users
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
            .input('email', sql.NVarChar, user.email || '')
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(user))
            .input('lastSyncDate', sql.DateTimeOffset, new Date())
            .query(`
              UPDATE Users
              SET name = @name,
                  email = @email,
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
            .input('email', sql.NVarChar, user.email || '')
            .input('createdAt', sql.DateTimeOffset, new Date())
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(user))
            .input('lastSyncDate', sql.DateTimeOffset, new Date())
            .query(`
              INSERT INTO Users (iduser, name, email, created, updated, data, last_sync_date)
              VALUES (@userId, @name, @email, @createdAt, @updatedAt, @data, @lastSyncDate)
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
    throw error;
  }
}

// Sync suppliers
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
    throw error;
  }
}

// Sync picklists
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
    throw error;
  }
}

// Run the sync
syncPicqerData()
  .then(result => {
    if (result.success) {
      console.log('✅ ' + result.message);
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
