/**
 * Simplified Config Manager
 * 
 * Handles environment configuration for Picqer API and database connections.
 */
require('dotenv').config();

class ConfigManager {
  constructor() {
    this.config = {
      api: {
        baseUrl: process.env.PICQER_API_URL || 'https://skapa-global.picqer.com/api/v1',
        apiKey: process.env.PICQER_API_KEY,
        rateLimits: {
          requestsPerMinute: 30,
          maxRetries: 5,
          initialBackoffMs: 2000,
          waitOnRateLimit: true,
          sleepTimeOnRateLimitHitInMs: 20000
        }
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
          enableArithAbort: true,
          connectTimeout: 30000,
          requestTimeout: 30000
        }
      }
    };
  }
  
  getApiConfig() {
    return this.config.api;
  }
  
  getDatabaseConfig() {
    return this.config.database;
  }
  
  validateApiConfig() {
    const { baseUrl, apiKey } = this.config.api;
    
    if (!baseUrl) {
      throw new Error('Missing Picqer API base URL. Set PICQER_API_URL environment variable.');
    }
    
    if (!apiKey) {
      throw new Error('Missing Picqer API key. Set PICQER_API_KEY environment variable.');
    }
    
    return true;
  }
  
  validateDatabaseConfig() {
    const { server, database, user, password } = this.config.database;
    const missingFields = [];
    
    if (!server) missingFields.push('server/host');
    if (!database) missingFields.push('database/name');
    if (!user) missingFields.push('user');
    if (!password) missingFields.push('password');
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required database configuration: ${missingFields.join(', ')}`);
    }
    
    return true;
  }
}

module.exports = ConfigManager;
