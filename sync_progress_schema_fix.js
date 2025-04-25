/**
 * SyncProgress Schema Fix
 * 
 * This script fixes issues with the SyncProgress table schema:
 * 1. Ensures started_at column has a default value
 * 2. Adds the missing count column
 */

const sql = require('mssql');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Database configuration
const dbConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  port: parseInt(process.env.SQL_PORT || '1433'),
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

async function fixSyncProgressSchema() {
  console.log('Starting SyncProgress schema fix...');
  
  let pool;
  
  try {
    // Connect to database
    console.log('Connecting to database...');
    pool = await new sql.ConnectionPool(dbConfig).connect();
    console.log('Connected to database successfully');
    
    // Check if SyncProgress table exists
    console.log('Checking if SyncProgress table exists...');
    const tableResult = await pool.request().query(`
      SELECT COUNT(*) AS tableExists 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'SyncProgress'
    `);
    
    const syncProgressExists = tableResult.recordset[0].tableExists > 0;
    
    if (!syncProgressExists) {
      console.log('SyncProgress table does not exist, creating it...');
      
      // Create SyncProgress table with all required columns
      await pool.request().query(`
        CREATE TABLE SyncProgress (
          id VARCHAR(50) PRIMARY KEY,
          entity_type VARCHAR(50) NOT NULL,
          started_at DATETIME NOT NULL DEFAULT GETDATE(),
          ended_at DATETIME NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'in_progress',
          error NVARCHAR(MAX) NULL,
          count INT NOT NULL DEFAULT 0
        )
      `);
      
      console.log('✅ Created SyncProgress table with all required columns');
    } else {
      console.log('SyncProgress table exists, checking columns...');
      
      // Check if started_at column allows nulls
      const startedAtResult = await pool.request().query(`
        SELECT IS_NULLABLE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'SyncProgress' AND COLUMN_NAME = 'started_at'
      `);
      
      if (startedAtResult.recordset.length > 0 && startedAtResult.recordset[0].IS_NULLABLE === 'YES') {
        console.log('Fixing started_at column to not allow nulls and add default value...');
        
        // Update started_at column to not allow nulls and add default value
        await pool.request().query(`
          ALTER TABLE SyncProgress 
          ALTER COLUMN started_at DATETIME NOT NULL
        `);
        
        await pool.request().query(`
          ALTER TABLE SyncProgress 
          ADD CONSTRAINT DF_SyncProgress_started_at DEFAULT GETDATE() FOR started_at
        `);
        
        console.log('✅ Fixed started_at column');
      } else {
        console.log('started_at column is already configured correctly');
      }
      
      // Check if count column exists
      const countResult = await pool.request().query(`
        SELECT COUNT(*) AS columnExists 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'SyncProgress' AND COLUMN_NAME = 'count'
      `);
      
      const countColumnExists = countResult.recordset[0].columnExists > 0;
      
      if (!countColumnExists) {
        console.log('Adding missing count column...');
        
        // Add count column
        await pool.request().query(`
          ALTER TABLE SyncProgress 
          ADD count INT NOT NULL DEFAULT 0
        `);
        
        console.log('✅ Added count column');
      } else {
        console.log('count column already exists');
      }
    }
    
    console.log('SyncProgress schema fix completed successfully');
    return true;
  } catch (error) {
    console.error('Error fixing SyncProgress schema:', error.message);
    throw error;
  } finally {
    if (pool) {
      await pool.close();
      console.log('Database connection closed');
    }
  }
}

// Execute the function if this script is run directly
if (require.main === module) {
  fixSyncProgressSchema()
    .then(() => {
      console.log('Schema fix completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Schema fix failed:', error);
      process.exit(1);
    });
}

module.exports = { fixSyncProgressSchema };
