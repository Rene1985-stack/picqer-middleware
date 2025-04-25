/**
 * Add Missing Columns Script
 * 
 * This script checks your database tables and adds any missing columns
 * that are required by the simplified Picqer to SQL DB synchronization code.
 */
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

// Import database connection adapter
let dbConnectionAdapter;
try {
  dbConnectionAdapter = require('../db-connection-adapter');
} catch (error) {
  try {
    dbConnectionAdapter = require('./db-connection-adapter');
  } catch (error) {
    console.error('Could not find db-connection-adapter.js. Please ensure it exists in the project directory.');
    process.exit(1);
  }
}

// Define required columns for each table
const requiredColumns = {
  'Warehouses': [
    { name: 'data', type: 'NVARCHAR(MAX)', nullable: true },
    { name: 'last_sync_date', type: 'DATETIMEOFFSET', nullable: true, default: 'GETDATE()' }
  ],
  'Products': [
    { name: 'data', type: 'NVARCHAR(MAX)', nullable: true },
    { name: 'last_sync_date', type: 'DATETIMEOFFSET', nullable: true, default: 'GETDATE()' }
  ],
  'Picklists': [
    { name: 'data', type: 'NVARCHAR(MAX)', nullable: true },
    { name: 'last_sync_date', type: 'DATETIMEOFFSET', nullable: true, default: 'GETDATE()' }
  ],
  'Users': [
    { name: 'data', type: 'NVARCHAR(MAX)', nullable: true },
    { name: 'last_sync_date', type: 'DATETIMEOFFSET', nullable: true, default: 'GETDATE()' }
  ],
  'Suppliers': [
    { name: 'data', type: 'NVARCHAR(MAX)', nullable: true },
    { name: 'last_sync_date', type: 'DATETIMEOFFSET', nullable: true, default: 'GETDATE()' }
  ],
  'Batches': [
    { name: 'data', type: 'NVARCHAR(MAX)', nullable: true },
    { name: 'last_sync_date', type: 'DATETIMEOFFSET', nullable: true, default: 'GETDATE()' }
  ],
  'SyncProgress': [
    { name: 'count', type: 'INT', nullable: true, default: '0' }
  ]
};

// Define required tables and their schemas
const requiredTables = {
  'SyncProgress': `
    CREATE TABLE SyncProgress (
      id INT IDENTITY(1,1) PRIMARY KEY,
      sync_id VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL,
      started_at DATETIMEOFFSET NOT NULL DEFAULT GETDATE(),
      ended_at DATETIMEOFFSET NULL,
      last_updated DATETIMEOFFSET NOT NULL DEFAULT GETDATE(),
      count INT DEFAULT 0,
      error NVARCHAR(MAX) NULL
    )
  `,
  'SyncStatus': `
    CREATE TABLE SyncStatus (
      id INT IDENTITY(1,1) PRIMARY KEY,
      entity_type VARCHAR(50) NOT NULL,
      entity_name VARCHAR(50) NOT NULL,
      last_sync_date DATETIMEOFFSET NOT NULL DEFAULT GETDATE()
    )
  `
};

/**
 * Add missing columns to a table
 * @param {sql.ConnectionPool} pool - SQL connection pool
 * @param {string} tableName - Table name
 * @returns {Promise<void>}
 */
async function addMissingColumns(pool, tableName) {
  try {
    console.log(`Checking columns for table: ${tableName}`);
    
    // Get existing columns
    const columnResult = await pool.request().query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = '${tableName}'
    `);
    
    const existingColumns = columnResult.recordset.map(record => record.COLUMN_NAME);
    console.log(`Existing columns in ${tableName}:`, existingColumns);
    
    // Check for missing columns
    const columnsToAdd = requiredColumns[tableName] || [];
    for (const column of columnsToAdd) {
      if (!existingColumns.includes(column.name)) {
        console.log(`Adding missing column ${column.name} to ${tableName}`);
        
        // Build ALTER TABLE statement
        let alterStatement = `ALTER TABLE ${tableName} ADD ${column.name} ${column.type}`;
        
        // Add NULL/NOT NULL constraint
        alterStatement += column.nullable ? ' NULL' : ' NOT NULL';
        
        // Add default constraint if specified
        if (column.default) {
          alterStatement += ` DEFAULT ${column.default}`;
        }
        
        // Execute ALTER TABLE statement
        await pool.request().query(alterStatement);
        console.log(`✅ Added column ${column.name} to ${tableName}`);
      } else {
        console.log(`Column ${column.name} already exists in ${tableName}`);
      }
    }
    
    console.log(`✅ All required columns exist in ${tableName}`);
  } catch (error) {
    console.error(`❌ Error adding columns to ${tableName}:`, error.message);
  }
}

/**
 * Create missing tables
 * @param {sql.ConnectionPool} pool - SQL connection pool
 * @returns {Promise<void>}
 */
async function createMissingTables(pool) {
  try {
    console.log('Checking for missing tables...');
    
    // Get existing tables
    const tableResult = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
    `);
    
    const existingTables = tableResult.recordset.map(record => record.TABLE_NAME);
    console.log('Existing tables:', existingTables);
    
    // Create missing tables
    for (const [tableName, createStatement] of Object.entries(requiredTables)) {
      if (!existingTables.includes(tableName)) {
        console.log(`Creating missing table: ${tableName}`);
        await pool.request().query(createStatement);
        console.log(`✅ Created table ${tableName}`);
      } else {
        console.log(`Table ${tableName} already exists`);
      }
    }
    
    console.log('✅ All required tables exist');
  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
  }
}

/**
 * Main function to add missing columns to all tables
 */
async function addMissingColumnsToAllTables() {
  let pool;
  
  try {
    console.log('Starting database schema check...');
    
    // Get database configuration
    const config = dbConnectionAdapter.getDatabaseConfig();
    console.log('Connecting to database...');
    
    // Connect to database
    pool = await new sql.ConnectionPool(config).connect();
    console.log('Connected to database successfully');
    
    // Create missing tables first
    await createMissingTables(pool);
    
    // Add missing columns to all tables
    for (const tableName of Object.keys(requiredColumns)) {
      await addMissingColumns(pool, tableName);
    }
    
    console.log('✅ Database schema check completed successfully');
  } catch (error) {
    console.error('❌ Error checking database schema:', error.message);
  } finally {
    if (pool) {
      await pool.close();
      console.log('Database connection closed');
    }
  }
}

// Run the script
addMissingColumnsToAllTables().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
