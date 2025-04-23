/**
 * Enhanced index.js with date fixing integration and root route handler
 * 
 * This file provides a complete implementation that correctly imports
 * all required modules and integrates the date fixing solution.
 * Added root route handler and improved static file serving.
 */

// Import required modules
const express = require('express');
const path = require('path');
const cors = require('cors');
const sql = require('mssql');
require('dotenv').config();


// Import service classes with rate limiting
const PicqerService = require('./picqer-service');
const PicklistService = require('./picklist-service');
const WarehouseService = require('./warehouse_service');
const UserService = require('./user_service');
const SupplierService = require('./supplier_service');
const BatchService = require('./batch_service');

// Import date fixer utility
const DateFixer = require('./fix-dates');

// Import API adapter with actual data sync implementation
const { router: apiAdapter, initializeServices } = require('./data_sync_api_adapter');

// Create Express app
const app = express();

// Configure middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enhanced database configuration with improved timeout settings
const startup = require('./startup');
const dbConfig = {
  server: process.env.SQL_SERVER,
  port: parseInt(process.env.SQL_PORT || '1433', 10), // Default to 1433 for SQL Server if not specified
  database: process.env.SQL_DATABASE,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    connectionTimeout: 60000,     // Increased to 60 seconds (from default 15)
    requestTimeout: 120000,       // Increased request timeout to 120 seconds
    pool: {
      max: 10,                    // Maximum number of connections in the pool
      min: 0,                     // Minimum number of connections in the pool
      idleTimeoutMillis: 30000    // How long a connection can be idle before being removed
    },
    retry: {
      max: 3,                     // Maximum number of connection retries
      interval: 5000              // Retry interval in milliseconds
    }
  }
};

// Log database configuration for debugging (without password)
console.log('Database configuration:', {
  server: dbConfig.server,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.user
});

startup(dbConfig);

// Picqer API configuration
const apiKey = process.env.PICQER_API_KEY;
const baseUrl = process.env.PICQER_BASE_URL;

// Initialize services
console.log('🚀 Initializing middleware services...');
const picqerService = new PicqerService(apiKey, baseUrl, dbConfig);

// Configure rate limiting based on environment
if (process.env.PICQER_RATE_LIMIT_WAIT === 'false') {
  picqerService.disableRetryOnRateLimitHit();
  console.log('Picqer rate limit auto-retry disabled');
} else {
  picqerService.enableRetryOnRateLimitHit();
  console.log('Picqer rate limit auto-retry enabled');
}

// Configure sleep time on rate limit hit (default: 20000ms / 20 seconds)
if (process.env.PICQER_RATE_LIMIT_SLEEP_MS) {
  const sleepTimeMs = parseInt(process.env.PICQER_RATE_LIMIT_SLEEP_MS, 10);
  if (!isNaN(sleepTimeMs) && sleepTimeMs > 0) {
    picqerService.setSleepTimeOnRateLimitHit(sleepTimeMs);
    console.log(`Picqer rate limit sleep time set to ${sleepTimeMs}ms`);
  }
}

// Initialize other services
const picklistService = new PicklistService(apiKey, baseUrl, dbConfig);
const warehouseService = new WarehouseService(apiKey, baseUrl, dbConfig);
const userService = new UserService(apiKey, baseUrl, dbConfig);
const supplierService = new SupplierService(apiKey, baseUrl, dbConfig);
const batchService = new BatchService(apiKey, baseUrl, dbConfig);

// Initialize date fixer
const dateFixer = new DateFixer(dbConfig);

// Initialize API adapter with service instances
initializeServices({
  ProductService: picqerService,
  PicklistService: picklistService,
  WarehouseService: warehouseService,
  UserService: userService,
  SupplierService: supplierService,
  BatchService: batchService
});

// Initialize database connection pool with improved error handling
let pool;

// Function to initialize the database connection pool with retries
async function initializePool(retries = 3, delay = 5000) {
  try {
    console.log('Attempting to initialize database connection pool...');
    pool = await new sql.ConnectionPool(dbConfig).connect();
    console.log('Database connection pool initialized successfully');
    return pool;
  } catch (error) {
    console.error(`Error initializing database connection pool: ${error.message}`);
    
    if (retries > 0) {
      console.log(`Retrying in ${delay/1000} seconds... (${retries} attempts remaining)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return initializePool(retries - 1, delay);
    } else {
      console.error('Maximum retry attempts reached. Could not establish database connection.');
      throw error;
    }
  }
}

// API routes
app.use('/api', apiAdapter);

// Add rate limiting status endpoint
app.get('/api/status/rate-limit', (req, res) => {
  try {
    const stats = picqerService.getRateLimiterStats();
    res.json({
      success: true,
      stats: stats,
      config: {
        waitOnRateLimit: process.env.PICQER_RATE_LIMIT_WAIT !== 'false',
        sleepTimeMs: parseInt(process.env.PICQER_RATE_LIMIT_SLEEP_MS || '20000', 10)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add database connection status endpoint
app.get('/api/status/database', async (req, res) => {
  try {
    if (!pool || pool.connected === false) {
      await initializePool(1, 1000); // Quick retry with 1 second timeout
    }
    
    // Test query to verify connection
    const result = await pool.request().query('SELECT 1 AS connected');
    
    res.json({
      success: true,
      connected: result.recordset[0].connected === 1,
      server: process.env.SQL_SERVER,
      port: process.env.SQL_PORT || '1433',
      database: process.env.SQL_DATABASE
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      connected: false,
      error: error.message,
      server: process.env.SQL_SERVER,
      port: process.env.SQL_PORT || '1433',
      database: process.env.SQL_DATABASE
    });
  }
});

// Add endpoint to fix dates manually
app.get('/api/fix-dates', async (req, res) => {
  try {
    const result = await dateFixer.fixDates();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Root route handler - redirects to dashboard
app.get('/', (req, res) => {
  console.log('Root path accessed, redirecting to dashboard');
  res.redirect('/dashboard');
});

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard/dashboard.html'));
});

// Serve static files from dashboard directory
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

// Serve static files from root directory
app.use(express.static(path.join(__dirname)));

// Add test routes to verify routing is working
app.get('/api-test', (req, res) => {
  res.json({ message: 'API test route is working' });
});

app.get('/api/sync-test', (req, res) => {
  res.json({ message: 'API sync test route is working' });
});

// Initialize database with improved error handling
async function initializeDatabase() {
  try {
    console.log('Initializing database...');
    
    // Fix dates in SyncStatus table
    try {
      const fixResult = await dateFixer.fixDates();
      console.log('Date fix result:', fixResult);
    } catch (fixError) {
      console.error('Error fixing dates:', fixError.message);
      // Continue initialization even if date fixing fails
    }
    
    // ADDED: Early initialization of services
    console.log('Initializing services early...');
    try {
      // Check if the services have the initialize method (from our updated implementation)
      if (typeof picqerService.initialize === 'function') {
        await picqerService.initialize();
        console.log('✅ PicqerService initialized successfully');
      }
      
      if (typeof picklistService.initialize === 'function') {
        await picklistService.initialize();
        console.log('✅ PicklistService initialized successfully');
      }
      
      if (typeof warehouseService.initialize === 'function') {
        await warehouseService.initialize();
        console.log('✅ WarehouseService initialized successfully');
      }
      
      if (typeof userService.initialize === 'function') {
        await userService.initialize();
        console.log('✅ UserService initialized successfully');
      }
      
      if (typeof supplierService.initialize === 'function') {
        await supplierService.initialize();
        console.log('✅ SupplierService initialized successfully');
      }
      
      if (typeof batchService.initialize === 'function') {
        await batchService.initialize();
        console.log('✅ BatchService initialized successfully');
      }
    } catch (initError) {
      console.error('Error during service initialization:', initError.message);
      console.log('Continuing with traditional initialization...');
    }
    
    // Traditional initialization (as fallback)
    // Initialize product schema
    await picqerService.initializeDatabase().catch(err => {
      console.error('Error initializing product schema:', err.message);
    });
    
    // Initialize picklists schema
    await picklistService.initializePicklistsDatabase().catch(err => {
      console.error('Error initializing picklists schema:', err.message);
    });
    
    // Initialize warehouses schema
    await warehouseService.initializeWarehousesDatabase().catch(err => {
      console.error('Error initializing warehouses schema:', err.message);
    });
    
    // Initialize users schema
    await userService.initializeUsersDatabase().catch(err => {
      console.error('Error initializing users schema:', err.message);
    });
    
    // Initialize suppliers schema
    await supplierService.initializeSuppliersDatabase().catch(err => {
      console.error('Error initializing suppliers schema:', err.message);
    });
    
    // Initialize batches schema
    await batchService.initializeBatchesDatabase().catch(err => {
      console.error('Error initializing batches schema:', err.message);
    });
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error.message);
  }
}

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => {
  console.log(`Picqer middleware server running on port ${PORT}`);
  console.log(`Rate limiting: ${process.env.PICQER_RATE_LIMIT_WAIT === 'false' ? 'disabled' : 'enabled'}`);
  
  // Initialize database connection pool with retries
  try {
    await initializePool();
    
    // Initialize database after server starts
    await initializeDatabase();
    
    // Log rate limiter configuration
    console.log('Rate limiter configuration:');
    console.log('- Auto-retry on rate limit:', process.env.PICQER_RATE_LIMIT_WAIT !== 'false' ? 'Enabled' : 'Disabled');
    console.log('- Sleep time on rate limit hit:', parseInt(process.env.PICQER_RATE_LIMIT_SLEEP_MS || '20000', 10) + 'ms');
  } catch (error) {
    console.error('Failed to initialize database connection. The API will still be available but database operations will fail.');
    console.error('Please check your database configuration and ensure the Azure SQL server is accessible from Railway.');
  }
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Close database connection
  try {
    await sql.close();
    console.log('Database connection closed');
  } catch (err) {
    console.error('Error closing database connection:', err.message);
  }
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  
  // Close database connection
  try {
    await sql.close();
    console.log('Database connection closed');
  } catch (err) {
    console.error('Error closing database connection:', err.message);
  }
  
  process.exit(0);
});

module.exports = app;
