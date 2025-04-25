/**
 * Updated BatchService with database connection adapter support
 * 
 * This file updates the BatchService to use the database connection adapter,
 * supporting both SQL_ and DB_ prefixed environment variables.
 */

const axios = require('axios');
const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');
const batchesSchema = require('./batches_schema');
const dbAdapter = require('./db-connection-adapter');

class BatchService {
  constructor(apiKey, baseUrl, sqlConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    
    // Use the database connection adapter if sqlConfig is not provided
    if (!sqlConfig) {
      this.sqlConfig = dbAdapter.getDatabaseConfig();
      try {
        dbAdapter.validateDatabaseConfig(this.sqlConfig);
      } catch (error) {
        console.error('BatchService: Invalid database configuration:', error.message);
      }
    } else {
      // If sqlConfig is provided, use it but ensure it has all required properties
      this.sqlConfig = {
        ...sqlConfig,
        // Fallback to environment variables if any property is missing
        server: sqlConfig.server || process.env.SQL_SERVER || process.env.DB_HOST,
        port: sqlConfig.port || parseInt(process.env.SQL_PORT || process.env.DB_PORT || '1433', 10),
        database: sqlConfig.database || process.env.SQL_DATABASE || process.env.DB_NAME,
        user: sqlConfig.user || process.env.SQL_USER || process.env.DB_USER,
        password: sqlConfig.password || process.env.SQL_PASSWORD || process.env.DB_PASSWORD,
        options: {
          ...(sqlConfig.options || {}),
          encrypt: true
        }
      };
    }
    
    // Log configuration for debugging (without password)
    console.log('BatchService database config:', {
      server: this.sqlConfig.server,
      port: this.sqlConfig.port,
      database: this.sqlConfig.database,
      user: this.sqlConfig.user
    });
    
    this.pool = null;
    this.batchSize = 100;
    
    // Create Base64 encoded credentials (apiKey + ":")
    const credentials = `${this.apiKey}:`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');
    
    // Create client with Basic Authentication header
    this.apiClient = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Basic ${encodedCredentials}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PicqerMiddleware (middleware@skapa-global.com)'
      }
    });
    
    // Add request interceptor for debugging
    this.apiClient.interceptors.request.use(request => {
      console.log('Making request to:', request.baseURL + request.url);
      return request;
    });
    
    // Add response interceptor for debugging
    this.apiClient.interceptors.response.use(
      response => {
        console.log('Response status:', response.status);
        return response;
      },
      error => {
        console.error('Request failed:');
        if (error.response) {
          console.error('Response status:', error.response.status);
        } else if (error.request) {
          console.error('No response received');
        } else {
          console.error('Error message:', error.message);
        }
        return Promise.reject(error);
      }
    );
    
    console.log('BatchService initialized with rate-limited Picqer API client');
  }

  /**
   * Initialize the service
   * Establishes database connection early in the lifecycle
   * @returns {Promise<boolean>} - Success status
   */
  async initialize() {
    try {
      // Initialize the pool as early as possible
      if (!this.pool) {
        console.log('Initializing pool in BatchService...');
        this.pool = await this.initializePool();
      }
      
      // Initialize database schema
      await this.initializeBatchesDatabase();
      
      console.log('BatchService fully initialized');
      return true;
    } catch (error) {
      console.error('Error initializing BatchService:', error.message);
      return false;
    }
  }

  /**
   * Initialize the database connection pool with retry logic
   * @returns {Promise<sql.ConnectionPool>} - SQL connection pool
   */
  async initializePool() {
    if (!this.pool) {
      // Verify sqlConfig is properly defined with all required properties
      if (!this.sqlConfig) {
        console.error('Cannot initialize pool: sqlConfig is null or undefined');
        
        // Create config from environment variables as last resort
        this.sqlConfig = dbAdapter.getDatabaseConfig();
        
        try {
          dbAdapter.validateDatabaseConfig(this.sqlConfig);
        } catch (error) {
          throw new Error(`Database configuration is invalid: ${error.message}`);
        }
      }
      
      // Log the configuration being used (without password)
      console.log('Initializing pool with config:', {
        server: this.sqlConfig.server,
        port: this.sqlConfig.port,
        database: this.sqlConfig.database,
        user: this.sqlConfig.user,
        options: {
          encrypt: this.sqlConfig.options.encrypt
        }
      });
      
      let retries = 3;
      let lastError = null;
      
      while (retries > 0) {
        try {
          console.log(`Attempting to initialize database connection pool (${retries} retries left)...`);
          this.pool = await new sql.ConnectionPool(this.sqlConfig).connect();
          console.log('Database connection pool initialized successfully');
          return this.pool;
        } catch (error) {
          lastError = error;
          console.error(`Error initializing database connection pool (retrying): ${error.message}`);
          retries--;
          
          if (retries > 0) {
            // Wait before retrying (exponential backoff)
            const waitTime = (4 - retries) * 1000; // 1s, 2s, 3s
            console.log(`Waiting ${waitTime}ms before retrying...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }
      
      console.error('Failed to initialize database connection pool after multiple attempts');
      throw lastError;
    }
    
    return this.pool;
  }

  // Rest of the BatchService methods remain unchanged
  // ...
}

module.exports = BatchService;
