/**
 * Standalone Database Connection Test
 * 
 * This script tests the connection to the Azure SQL database
 * and prints detailed information about the connection.
 * 
 * Use this to verify your database credentials are working correctly.
 */

require('dotenv').config();
const sql = require('mssql');

async function testDatabaseConnection() {
  console.log('Starting database connection test...');
  
  // Database configuration from environment variables
  const config = {
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
  };
  
  console.log('Using database configuration:');
  console.log(`Server: ${config.server}`);
  console.log(`Database: ${config.database}`);
  console.log(`User: ${config.user}`);
  console.log(`Port: ${config.port}`);
  
  let pool;
  
  try {
    // Connect to database
    console.log('Connecting to database...');
    pool = await new sql.ConnectionPool(config).connect();
    console.log('✅ Connected to database successfully');
    
    // Test query
    console.log('Testing query execution...');
    const result = await pool.request().query('SELECT @@VERSION AS version');
    console.log('✅ Query executed successfully');
    console.log('SQL Server version:', result.recordset[0].version);
    
    // List tables
    console.log('Listing tables in database...');
    const tables = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);
    
    console.log('Tables in database:');
    if (tables.recordset.length === 0) {
      console.log('No tables found');
    } else {
      tables.recordset.forEach(table => {
        console.log(`- ${table.TABLE_NAME}`);
      });
    }
    
    return {
      success: true,
      message: 'Database connection test completed successfully',
      tables: tables.recordset.map(t => t.TABLE_NAME)
    };
  } catch (error) {
    console.error('❌ Error connecting to database:', error.message);
    return {
      success: false,
      error: error.message
    };
  } finally {
    if (pool) {
      await pool.close();
      console.log('Database connection closed');
    }
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testDatabaseConnection()
    .then(result => {
      if (result.success) {
        console.log('✅ ' + result.message);
        process.exit(0);
      } else {
        console.error('❌ Connection test failed:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { testDatabaseConnection };
