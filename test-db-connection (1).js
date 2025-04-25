/**
 * Database Connection Test Script
 * 
 * This script tests the database connection using the new db-connection-adapter
 * to verify that it can successfully connect to the SQL database using either
 * SQL_ or DB_ prefixed environment variables.
 */

require('dotenv').config();
const sql = require('mssql');
const dbAdapter = require('./db-connection-adapter');

async function testDatabaseConnection() {
  console.log('Starting database connection test...');
  
  // Get database configuration from adapter
  const dbConfig = dbAdapter.getDatabaseConfig();
  
  // Log configuration (without password)
  console.log('Database configuration:', {
    server: dbConfig.server,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    options: dbConfig.options
  });
  
  try {
    // Validate configuration
    dbAdapter.validateDatabaseConfig(dbConfig);
    console.log('Database configuration is valid');
    
    // Try to connect
    console.log('Attempting to connect to database...');
    const pool = await new sql.ConnectionPool(dbConfig).connect();
    
    console.log('Successfully connected to database!');
    
    // Test a simple query
    console.log('Testing simple query...');
    const result = await pool.request().query('SELECT @@VERSION AS version');
    
    console.log('Query successful. SQL Server version:');
    console.log(result.recordset[0].version);
    
    // Check if SyncStatus table exists
    console.log('Checking if SyncStatus table exists...');
    const tableResult = await pool.request().query(`
      SELECT COUNT(*) AS tableExists 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'SyncStatus'
    `);
    
    const syncTableExists = tableResult.recordset[0].tableExists > 0;
    
    if (syncTableExists) {
      console.log('SyncStatus table exists');
      
      // Check sync status records
      const syncStatusResult = await pool.request().query('SELECT * FROM SyncStatus');
      console.log('SyncStatus records:', syncStatusResult.recordset);
    } else {
      console.log('SyncStatus table does not exist');
    }
    
    // Close the connection
    await pool.close();
    console.log('Database connection closed');
    
    return {
      success: true,
      message: 'Database connection test successful'
    };
  } catch (error) {
    console.error('Database connection test failed:', error.message);
    
    // Provide more detailed error information
    if (error.code === 'ELOGIN') {
      console.error('Login failed. Check your username and password.');
    } else if (error.code === 'ETIMEOUT') {
      console.error('Connection timed out. Check your server address and firewall settings.');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('Connection refused. Check if the SQL Server is running and accessible.');
    }
    
    return {
      success: false,
      error: error.message,
      code: error.code
    };
  }
}

// Run the test
testDatabaseConnection()
  .then(result => {
    if (result.success) {
      console.log('✅ ' + result.message);
      process.exit(0);
    } else {
      console.error('❌ Test failed:', result.error);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
