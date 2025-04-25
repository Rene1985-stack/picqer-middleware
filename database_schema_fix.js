/**
 * Database Schema Requirements Fix
 * 
 * This script creates the necessary database schema with required columns
 * for proper synchronization tracking, including the 'last_sync_date' column
 * in entity tables.
 */

require('dotenv').config();
const sql = require('mssql');
const dbAdapter = require('../picqer-middleware-main/db-connection-adapter');

async function createRequiredSchema() {
  console.log('Starting database schema creation/verification...');
  
  // Get database configuration from adapter
  const dbConfig = dbAdapter.getDatabaseConfig();
  
  try {
    // Validate configuration
    dbAdapter.validateDatabaseConfig(dbConfig);
    console.log('Database configuration is valid');
    
    // Connect to database
    console.log('Connecting to database...');
    const pool = await new sql.ConnectionPool(dbConfig).connect();
    console.log('Connected to database');
    
    // Create SyncStatus table if it doesn't exist
    console.log('Checking/creating SyncStatus table...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SyncStatus')
      BEGIN
        CREATE TABLE SyncStatus (
          id INT IDENTITY(1,1) PRIMARY KEY,
          entity_type VARCHAR(50) NOT NULL,
          sync_type VARCHAR(20) NOT NULL,
          status VARCHAR(20) NOT NULL,
          started_at DATETIMEOFFSET NOT NULL,
          completed_at DATETIMEOFFSET NULL,
          records_processed INT DEFAULT 0,
          error_message NVARCHAR(MAX) NULL
        )
        PRINT 'SyncStatus table created'
      END
      ELSE
      BEGIN
        PRINT 'SyncStatus table already exists'
      END
    `);
    
    // Create or update Batches table with last_sync_date column
    console.log('Checking/creating Batches table...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Batches')
      BEGIN
        CREATE TABLE Batches (
          idpicklist_batch VARCHAR(50) PRIMARY KEY,
          name NVARCHAR(255) NULL,
          status NVARCHAR(50) NULL,
          created_at DATETIMEOFFSET NULL,
          updated_at DATETIMEOFFSET NULL,
          data NVARCHAR(MAX) NULL,
          last_sync_date DATETIMEOFFSET DEFAULT GETDATE()
        )
        PRINT 'Batches table created'
      END
      ELSE
      BEGIN
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Batches' AND COLUMN_NAME = 'last_sync_date')
        BEGIN
          ALTER TABLE Batches ADD last_sync_date DATETIMEOFFSET DEFAULT GETDATE()
          PRINT 'Added last_sync_date column to Batches table'
        END
        ELSE
        BEGIN
          PRINT 'Batches table already has last_sync_date column'
        END
      END
    `);
    
    // Create or update Picklists table with last_sync_date column
    console.log('Checking/creating Picklists table...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Picklists')
      BEGIN
        CREATE TABLE Picklists (
          idpicklist VARCHAR(50) PRIMARY KEY,
          name NVARCHAR(255) NULL,
          status NVARCHAR(50) NULL,
          created_at DATETIMEOFFSET NULL,
          updated_at DATETIMEOFFSET NULL,
          data NVARCHAR(MAX) NULL,
          last_sync_date DATETIMEOFFSET DEFAULT GETDATE()
        )
        PRINT 'Picklists table created'
      END
      ELSE
      BEGIN
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Picklists' AND COLUMN_NAME = 'last_sync_date')
        BEGIN
          ALTER TABLE Picklists ADD last_sync_date DATETIMEOFFSET DEFAULT GETDATE()
          PRINT 'Added last_sync_date column to Picklists table'
        END
        ELSE
        BEGIN
          PRINT 'Picklists table already has last_sync_date column'
        END
      END
    `);
    
    // Create or update Warehouses table with last_sync_date column
    console.log('Checking/creating Warehouses table...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Warehouses')
      BEGIN
        CREATE TABLE Warehouses (
          idwarehouse VARCHAR(50) PRIMARY KEY,
          name NVARCHAR(255) NULL,
          created DATETIMEOFFSET NULL,
          updated DATETIMEOFFSET NULL,
          data NVARCHAR(MAX) NULL,
          last_sync_date DATETIMEOFFSET DEFAULT GETDATE()
        )
        PRINT 'Warehouses table created'
      END
      ELSE
      BEGIN
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Warehouses' AND COLUMN_NAME = 'last_sync_date')
        BEGIN
          ALTER TABLE Warehouses ADD last_sync_date DATETIMEOFFSET DEFAULT GETDATE()
          PRINT 'Added last_sync_date column to Warehouses table'
        END
        ELSE
        BEGIN
          PRINT 'Warehouses table already has last_sync_date column'
        END
      END
    `);
    
    // Create or update Users table with last_sync_date column
    console.log('Checking/creating Users table...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Users')
      BEGIN
        CREATE TABLE Users (
          iduser VARCHAR(50) PRIMARY KEY,
          name NVARCHAR(255) NULL,
          email NVARCHAR(255) NULL,
          created DATETIMEOFFSET NULL,
          updated DATETIMEOFFSET NULL,
          data NVARCHAR(MAX) NULL,
          last_sync_date DATETIMEOFFSET DEFAULT GETDATE()
        )
        PRINT 'Users table created'
      END
      ELSE
      BEGIN
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'last_sync_date')
        BEGIN
          ALTER TABLE Users ADD last_sync_date DATETIMEOFFSET DEFAULT GETDATE()
          PRINT 'Added last_sync_date column to Users table'
        END
        ELSE
        BEGIN
          PRINT 'Users table already has last_sync_date column'
        END
      END
    `);
    
    // Create or update Suppliers table with last_sync_date column
    console.log('Checking/creating Suppliers table...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Suppliers')
      BEGIN
        CREATE TABLE Suppliers (
          idsupplier VARCHAR(50) PRIMARY KEY,
          name NVARCHAR(255) NULL,
          created DATETIMEOFFSET NULL,
          updated DATETIMEOFFSET NULL,
          data NVARCHAR(MAX) NULL,
          last_sync_date DATETIMEOFFSET DEFAULT GETDATE()
        )
        PRINT 'Suppliers table created'
      END
      ELSE
      BEGIN
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Suppliers' AND COLUMN_NAME = 'last_sync_date')
        BEGIN
          ALTER TABLE Suppliers ADD last_sync_date DATETIMEOFFSET DEFAULT GETDATE()
          PRINT 'Added last_sync_date column to Suppliers table'
        END
        ELSE
        BEGIN
          PRINT 'Suppliers table already has last_sync_date column'
        END
      END
    `);
    
    console.log('Database schema creation/verification completed successfully');
    
    // Close the connection
    await pool.close();
    console.log('Database connection closed');
    
    return {
      success: true,
      message: 'Database schema creation/verification completed successfully'
    };
  } catch (error) {
    console.error('Database schema creation/verification failed:', error.message);
    
    return {
      success: false,
      error: error.message,
      code: error.code
    };
  }
}

// Run the schema creation/verification
createRequiredSchema()
  .then(result => {
    if (result.success) {
      console.log('✅ ' + result.message);
      process.exit(0);
    } else {
      console.error('❌ Schema creation/verification failed:', result.error);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
