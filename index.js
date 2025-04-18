/**
 * Updated index.js with batch dashboard API integration
 * 
 * This file integrates both the standard batch service and the batch dashboard API
 * to ensure batches are properly synced and displayed in the dashboard.
 */

// Import required modules
const express = require('express');
const path = require('path');
const cors = require('cors');
const sql = require('mssql');
require('dotenv').config();

// Import service classes
const PicqerService = require('./picqer-service');
const PicklistService = require('./picklist-service');
const WarehouseService = require('./warehouse_service');
const UserService = require('./user_service');
const SupplierService = require('./supplier_service');
const BatchService = require('./batch_service');

// Import API adapters
const { router: apiAdapter, initializeServices } = require('./data_sync_api_adapter');
const { router: dashboardApiRouter, initialize: initializeDashboardApi } = require('./dashboard-api');
const { router: batchDashboardRouter, initialize: initializeBatchDashboardApi } = require('./batch_dashboard_api');

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

// Initialize and use dashboard API
async function initializeApis() {
  try {
    // Initialize dashboard API
    const dashboardApi = initializeDashboardApi(pool);
    app.use('/api', dashboardApi);
    
    // Initialize batch dashboard API
    const batchApi = initializeBatchDashboardApi(pool, {
      BatchService: batchService
    });
    app.use('/api', batchApi);
    
    console.log('Dashboard APIs initialized');
  } catch (error) {
    console.error('Error initializing dashboard APIs:', error.message);
  }
}

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
  
  // Initialize database connection pool
  await initializePool();
  
  // Initialize APIs
  await initializeApis();
  
  // Initialize database after server starts
  await initializeDatabase();
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
