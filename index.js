/**
 * Enhanced index.js with rate limiting integration
 * 
 * This file provides a complete implementation that correctly imports
 * all required modules and integrates the new rate limiting solution.
 */

// Import required modules
const express = require('express');
const path = require('path');
const cors = require('cors');
const sql = require('mssql');
require('dotenv').config();

// Import service classes with rate limiting
const PicqerService = require('./updated-picqer-service');
const PicklistService = require('./picklist-service');
const WarehouseService = require('./warehouse_service');
const UserService = require('./user_service');
const SupplierService = require('./supplier_service');
const BatchService = require('./batch_service');

// Import API adapter with actual data sync implementation
const { router: apiAdapter, initializeServices } = require('./data_sync_api_adapter');

// Create Express app
const app = express();

// Configure middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database configuration
const dbConfig = {
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

// Picqer API configuration
const apiKey = process.env.PICQER_API_KEY;
const baseUrl = process.env.PICQER_BASE_URL;

// Initialize services
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

// Initialize API adapter with service instances
initializeServices({
  ProductService: picqerService,
  PicklistService: picklistService,
  WarehouseService: warehouseService,
  UserService: userService,
  SupplierService: supplierService,
  BatchService: batchService
});

// Initialize database connection pool
let pool;

// Function to initialize the database connection pool
async function initializePool() {
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    console.log('Database connection pool initialized');
    return pool;
  } catch (error) {
    console.error('Error initializing database connection pool:', error.message);
    throw error;
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

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard/dashboard.html'));
});

// Serve static files from dashboard directory
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

// Initialize database
async function initializeDatabase() {
  try {
    console.log('Initializing database...');
    
    // Initialize product schema
    await picqerService.initializeDatabase();
    
    // Initialize picklists schema
    await picklistService.initializePicklistsDatabase();
    
    // Initialize warehouses schema
    await warehouseService.initializeWarehousesDatabase();
    
    // Initialize users schema
    await userService.initializeUsersDatabase();
    
    // Initialize suppliers schema
    await supplierService.initializeSuppliersDatabase();
    
    // Initialize batches schema
    await batchService.initializeBatchesDatabase();
    
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
  
  // Initialize database connection pool
  await initializePool();
  
  // Initialize database after server starts
  await initializeDatabase();
  
  // Log rate limiter configuration
  console.log('Rate limiter configuration:');
  console.log('- Auto-retry on rate limit:', process.env.PICQER_RATE_LIMIT_WAIT !== 'false' ? 'Enabled' : 'Disabled');
  console.log('- Sleep time on rate limit hit:', parseInt(process.env.PICQER_RATE_LIMIT_SLEEP_MS || '20000', 10) + 'ms');
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
