/**
 * Configuration Manager for Picqer Middleware
 * 
 * This module handles loading and validating configuration from environment variables.
 * It provides a centralized place for all configuration settings.
 */
require('dotenv').config();

class ConfigManager {
  constructor() {
    // Database configuration
    this.dbConfig = {
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      server: process.env.SQL_SERVER,
      database: process.env.SQL_DATABASE,
      port: parseInt(process.env.SQL_PORT || '1433'),
      options: {
        encrypt: true,
        trustServerCertificate: true,
        connectionTimeout: 30000,
        requestTimeout: 30000
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      }
    };

    // Picqer API configuration
    this.picqerConfig = {
      apiUrl: process.env.PICQER_API_URL || process.env.PICQER_BASE_URL,
      apiKey: process.env.PICQER_API_KEY,
      waitOnRateLimit: process.env.PICQER_RATE_LIMIT_WAIT === 'true',
      sleepTimeOnRateLimitHit: parseInt(process.env.PICQER_RATE_LIMIT_SLEEP_MS || '20000'),
      requestDelay: parseInt(process.env.PICQER_REQUEST_DELAY_MS || '100')
    };

    // Server configuration
    this.serverConfig = {
      port: parseInt(process.env.PORT || '3000'),
      logLevel: process.env.LOG_LEVEL || 'info'
    };

    this.validateConfig();
    this.logConfig();
  }

  validateConfig() {
    const requiredEnvVars = [
      'SQL_USER',
      'SQL_PASSWORD',
      'SQL_SERVER',
      'SQL_DATABASE',
      'PICQER_API_KEY',
      'PICQER_API_URL'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('[ConfigManager] Missing required environment variables:', missingVars.join(', '));
      console.error('[ConfigManager] Please check your .env file or environment settings.');
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
  }

  logConfig() {
    console.log('[ConfigManager] Configuration loaded:');
    console.log('[ConfigManager] Database:', {
      server: this.dbConfig.server,
      database: this.dbConfig.database,
      user: this.dbConfig.user,
      port: this.dbConfig.port
    });
    console.log('[ConfigManager] Picqer API:', {
      apiUrl: this.picqerConfig.apiUrl,
      apiKey: this.picqerConfig.apiKey ? `${this.picqerConfig.apiKey.substring(0, 5)}...` : 'Not set',
      waitOnRateLimit: this.picqerConfig.waitOnRateLimit,
      requestDelay: this.picqerConfig.requestDelay
    });
    console.log('[ConfigManager] Server:', this.serverConfig);
  }

  getDbConfig() {
    return this.dbConfig;
  }

  getPicqerConfig() {
    return this.picqerConfig;
  }

  getServerConfig() {
    return this.serverConfig;
  }
}

module.exports = new ConfigManager();
