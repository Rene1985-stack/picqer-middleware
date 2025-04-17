/**
 * Updated index.js with integrated API adapter for actual data syncing
 * 
 * This file integrates the API adapter with the actual sync services
 * to ensure data is properly synced from Picqer.
 */

const express = require('express');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();

// Import all services
const ProductService = require('./picqer-service');
const PicklistService = require('./picklist-service');
const WarehouseService = require('./warehouse_service');
const UserService = require('./user_service');
const SupplierService = require('./supplier_service');

// Import integrated API adapter middleware
const { router: apiAdapter, initializeServices } = require('./api-adapter');

// Initialize Express app
const app = express();
const port = process.env.PORT || 8080;

// Configure middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database configuration - using existing environment variable names
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

// Picqer API configuration - using existing environment variable names
const apiKey = process.env.PICQER_API_KEY;
const baseUrl = process.env.PICQER_BASE_URL;

// Create service instances
const productService = new ProductService(apiKey, baseUrl, dbConfig);
const picklistService = new PicklistService(apiKey, baseUrl, dbConfig);
const warehouseService = new WarehouseService(apiKey, baseUrl, dbConfig);
const userService = new UserService(apiKey, baseUrl, dbConfig);
const supplierService = new SupplierService(apiKey, baseUrl, dbConfig);

// Initialize the API adapter with service instances
initializeServices({
  ProductService: productService,
  PicklistService: picklistService,
  WarehouseService: warehouseService,
  UserService: userService,
  SupplierService: supplierService
});

// Mount API adapter middleware to handle dashboard API requests
app.use('/api', apiAdapter);

// Serve static dashboard files
app.use(express.static(path.join(__dirname, 'dashboard')));

// Initialize database
async function initializeDatabase() {
  try {
    console.log('Initializing database...');
    
    // Initialize all entity databases
    await productService.initializeDatabase();
    await picklistService.initializePicklistsDatabase();
    await warehouseService.initializeWarehousesDatabase();
    await userService.initializeUsersDatabase();
    await supplierService.initializeSuppliersDatabase();
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error.message);
  }
}

// Initialize database on startup
initializeDatabase();

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard/dashboard.html'));
});

// Schedule syncs
// Products - every hour
cron.schedule('0 * * * *', async () => {
  console.log('Running scheduled product sync...');
  try {
    await productService.performIncrementalSync();
    console.log('Scheduled product sync completed successfully');
  } catch (error) {
    console.error('Scheduled product sync failed:', error.message);
  }
});

// Picklists - every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  console.log('Running scheduled picklist sync...');
  try {
    await picklistService.performIncrementalSync();
    console.log('Scheduled picklist sync completed successfully');
  } catch (error) {
    console.error('Scheduled picklist sync failed:', error.message);
  }
});

// Warehouses - once daily at 1 AM
cron.schedule('0 1 * * *', async () => {
  console.log('Running scheduled warehouse sync...');
  try {
    await warehouseService.performIncrementalSync();
    console.log('Scheduled warehouse sync completed successfully');
  } catch (error) {
    console.error('Scheduled warehouse sync failed:', error.message);
  }
});

// Users - once daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  console.log('Running scheduled user sync...');
  try {
    await userService.performIncrementalSync();
    console.log('Scheduled user sync completed successfully');
  } catch (error) {
    console.error('Scheduled user sync failed:', error.message);
  }
});

// Suppliers - once daily at 3 AM
cron.schedule('0 3 * * *', async () => {
  console.log('Running scheduled supplier sync...');
  try {
    await supplierService.performIncrementalSync();
    console.log('Scheduled supplier sync completed successfully');
  } catch (error) {
    console.error('Scheduled supplier sync failed:', error.message);
  }
});

// Full sync for all entities - once weekly on Sunday at 4 AM
cron.schedule('0 4 * * 0', async () => {
  console.log('Running weekly full sync of all entities...');
  try {
    await productService.performFullSync();
    await picklistService.performFullSync();
    await warehouseService.performFullSync();
    await userService.performFullSync();
    await supplierService.performFullSync();
    console.log('Weekly full sync completed successfully');
  } catch (error) {
    console.error('Weekly full sync failed:', error.message);
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Picqer middleware server running on port ${port}`);
});
