/**
 * Simple database schema fix script
 * 
 * This script creates the necessary database tables with the correct column names
 * to fix the "Invalid column name" errors.
 */

require('dotenv').config();
const sql = require('mssql');

async function fixDatabaseSchema() {
  console.log('Starting database schema fix...');
  
  // Database configuration
  const config = {
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
  };
  
  try {
    console.log('Connecting to database...');
    const pool = await new sql.ConnectionPool(config).connect();
    console.log('Connected to database successfully');
    
    // Create SyncProgress table with correct columns
    console.log('Creating/updating SyncProgress table...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SyncProgress')
      BEGIN
        CREATE TABLE SyncProgress (
          id INT IDENTITY(1,1) PRIMARY KEY,
          sync_id VARCHAR(100) NOT NULL,
          entity_type VARCHAR(50) NOT NULL,
          status VARCHAR(20) NOT NULL,
          start_time DATETIMEOFFSET NOT NULL,
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
    
    console.log('Database schema fix completed successfully');
    await pool.close();
    
    return {
      success: true,
      message: 'Database schema fixed successfully'
    };
  } catch (error) {
    console.error('Error fixing database schema:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the fix
fixDatabaseSchema()
  .then(result => {
    if (result.success) {
      console.log('✅ ' + result.message);
      process.exit(0);
    } else {
      console.error('❌ Schema fix failed:', result.error);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
