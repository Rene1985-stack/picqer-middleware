/**
 * Database Connection Adapter
 * 
 * This module provides a unified interface for database connection configuration,
 * handling different environment variable naming conventions between local development
 * and Railway deployment.
 */

// Get database configuration from environment variables with fallbacks
function getDatabaseConfig() {
  // Support both SQL_ prefix (used in code) and DB_ prefix (used in Railway)
  const config = {
    server: process.env.SQL_SERVER || process.env.DB_HOST,
    port: parseInt(process.env.SQL_PORT || process.env.DB_PORT || '1433', 10),
    database: process.env.SQL_DATABASE || process.env.DB_NAME,
    user: process.env.SQL_USER || process.env.DB_USER,
    password: process.env.SQL_PASSWORD || process.env.DB_PASSWORD,
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true,
      connectTimeout: 30000, // 30 seconds
      requestTimeout: 30000   // 30 seconds
    }
  };

  // Log configuration for debugging (without password)
  console.log('Database configuration:', {
    server: config.server,
    port: config.port,
    database: config.database,
    user: config.user,
    // Don't log password
  });

  return config;
}

// Validate database configuration
function validateDatabaseConfig(config) {
  const missingFields = [];
  
  if (!config.server) missingFields.push('server/host');
  if (!config.database) missingFields.push('database/name');
  if (!config.user) missingFields.push('user');
  if (!config.password) missingFields.push('password');
  
  if (missingFields.length > 0) {
    const errorMessage = `Missing required database configuration: ${missingFields.join(', ')}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
  
  return true;
}

module.exports = {
  getDatabaseConfig,
  validateDatabaseConfig
};
