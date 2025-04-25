/**
 * Authentication Fix for Azure SQL
 * 
 * This script demonstrates how to properly configure authentication for Azure SQL
 * when using email-based accounts (Azure AD) with SQL authentication.
 */

require('dotenv').config();
const sql = require('mssql');
const dbAdapter = require('../picqer-middleware-main/db-connection-adapter');

async function testAndFixAuthentication() {
  console.log('Starting authentication test and fix...');
  
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
    // Try to connect with current configuration
    console.log('Attempting to connect with current configuration...');
    let pool;
    
    try {
      pool = await new sql.ConnectionPool(dbConfig).connect();
      console.log('Successfully connected with current configuration!');
      await pool.close();
      return {
        success: true,
        message: 'Authentication is working correctly with current configuration',
        fixApplied: false
      };
    } catch (initialError) {
      console.error('Initial connection failed:', initialError.message);
      
      // If the error is related to authentication, try with enhanced options
      if (initialError.code === 'ELOGIN' || initialError.message.includes('Login failed')) {
        console.log('Authentication error detected, trying with enhanced options...');
        
        // Create enhanced configuration with additional Azure SQL specific options
        const enhancedConfig = {
          ...dbConfig,
          options: {
            ...dbConfig.options,
            authentication: {
              type: 'default'
            },
            encrypt: true,
            trustServerCertificate: false
          }
        };
        
        try {
          pool = await new sql.ConnectionPool(enhancedConfig).connect();
          console.log('Successfully connected with enhanced configuration!');
          
          // Test a simple query
          console.log('Testing simple query...');
          const result = await pool.request().query('SELECT @@VERSION AS version');
          console.log('Query successful. SQL Server version:', result.recordset[0].version);
          
          await pool.close();
          
          return {
            success: true,
            message: 'Authentication fixed with enhanced configuration',
            fixApplied: true,
            enhancedConfig
          };
        } catch (enhancedError) {
          console.error('Enhanced configuration also failed:', enhancedError.message);
          throw enhancedError;
        }
      } else {
        // If it's not an authentication error, rethrow
        throw initialError;
      }
    }
  } catch (error) {
    console.error('Authentication test and fix failed:', error.message);
    
    // Provide more detailed error information
    if (error.code === 'ELOGIN') {
      console.error('Login failed. Check your username and password.');
      console.error('For Azure SQL with email-based accounts, you may need to:');
      console.error('1. Create a dedicated SQL authentication user in Azure SQL');
      console.error('2. Grant appropriate permissions to this user');
      console.error('3. Use this dedicated user in your connection string');
    } else if (error.code === 'ETIMEOUT') {
      console.error('Connection timed out. Check your server address and firewall settings.');
      console.error('For Azure SQL, ensure your IP address is allowed in the firewall rules.');
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

// Run the authentication test and fix
testAndFixAuthentication()
  .then(result => {
    if (result.success) {
      console.log('✅ ' + result.message);
      if (result.fixApplied) {
        console.log('Enhanced configuration that worked:');
        console.log(JSON.stringify(result.enhancedConfig, null, 2));
        console.log('Consider updating your db-connection-adapter.js with these options');
      }
      process.exit(0);
    } else {
      console.error('❌ Authentication test and fix failed:', result.error);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
