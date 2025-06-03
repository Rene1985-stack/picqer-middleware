/**
 * Final Index.js with Integrated Data Sync Implementation
 * 
 * This file integrates the actual data sync implementation with the API adapter,
 * ensuring that when sync buttons are clicked in the dashboard, real data is
 * synced from Picqer to the database.
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
const PurchaseOrderService = require('./purchase_order_service');

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
  port: parseInt(process.env.SQL_PORT) || 1433,
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

// Picqer API configuration
const apiKey = process.env.PICQER_API_KEY;
const baseUrl = process.env.PICQER_BASE_URL || process.env.PICQER_API_URL;

// Validate required environment variables
if (!apiKey || !baseUrl) {
  console.error('Missing required environment variables: PICQER_API_KEY and PICQER_BASE_URL/PICQER_API_URL');
  process.exit(1);
}

// Initialize services
const picqerService = new PicqerService(apiKey, baseUrl, dbConfig);
const picklistService = new PicklistService(apiKey, baseUrl, dbConfig);
const warehouseService = new WarehouseService(apiKey, baseUrl, dbConfig);
const userService = new UserService(apiKey, baseUrl, dbConfig);
const supplierService = new SupplierService(apiKey, baseUrl, dbConfig);
const purchaseOrderService = new PurchaseOrderService(apiKey, baseUrl, dbConfig);

// Import API adapter AFTER services are initialized to avoid circular dependency
const { router: apiAdapter, initializeServices } = require('./data_sync_api_adapter');

// Initialize API adapter with service instances
initializeServices({
  ProductService: picqerService,
  PicklistService: picklistService,
  WarehouseService: warehouseService,
  UserService: userService,
  SupplierService: supplierService,
  PurchaseOrderService: purchaseOrderService
});

// API routes
app.use('/api', apiAdapter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Purchase Orders API endpoints (direct endpoints for immediate access)
app.get('/api/sync/purchaseorders', async (req, res) => {
  try {
    const fullSync = req.query.full === 'true';
    const days = req.query.days ? parseInt(req.query.days) : null;
    
    console.log(`Received request to ${fullSync ? 'fully' : 'incrementally'} sync purchase orders${days ? ` for the last ${days} days` : ''}`);
    
    const result = await purchaseOrderService.syncPurchaseOrders(fullSync, days);
    
    res.json({
      success: true,
      message: `Purchase orders sync ${result.success ? 'completed' : 'failed'}`,
      details: result
    });
  } catch (error) {
    console.error('Error syncing purchase orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing purchase orders',
      error: error.message
    });
  }
});

app.get('/api/purchaseorders', async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request().query(`
      SELECT po.*, 
        (SELECT COUNT(*) FROM PurchaseOrderProducts WHERE idpurchaseorder = po.idpurchaseorder) AS product_count,
        (SELECT COUNT(*) FROM PurchaseOrderComments WHERE idpurchaseorder = po.idpurchaseorder) AS comment_count
      FROM PurchaseOrders po
      ORDER BY po.updated DESC
    `);
    
    res.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length
    });
  } catch (error) {
    console.error('Error getting purchase orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting purchase orders',
      error: error.message
    });
  }
});

app.get('/api/purchaseorders/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pool = await sql.connect(dbConfig);
    
    // Get purchase order details
    const poResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT * FROM PurchaseOrders 
        WHERE idpurchaseorder = @id
      `);
    
    if (poResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Purchase order not found'
      });
    }
    
    const purchaseOrder = poResult.recordset[0];
    
    // Get purchase order products
    const productsResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT * FROM PurchaseOrderProducts 
        WHERE idpurchaseorder = @id
      `);
    
    // Get purchase order comments
    const commentsResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT * FROM PurchaseOrderComments 
        WHERE idpurchaseorder = @id
        ORDER BY created DESC
      `);
    
    purchaseOrder.products = productsResult.recordset;
    purchaseOrder.comments = commentsResult.recordset;
    
    res.json({
      success: true,
      data: purchaseOrder
    });
  } catch (error) {
    console.error('Error getting purchase order:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting purchase order',
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
    if (picqerService && typeof picqerService.initializeDatabase === 'function') {
      await picqerService.initializeDatabase();
    }
    
    // Initialize picklists schema
    if (picklistService && typeof picklistService.initializePicklistsDatabase === 'function') {
      await picklistService.initializePicklistsDatabase();
    }
    
    // Initialize warehouses schema
    if (warehouseService && typeof warehouseService.initializeWarehousesDatabase === 'function') {
      await warehouseService.initializeWarehousesDatabase();
    }
    
    // Initialize users schema
    if (userService && typeof userService.initializeUsersDatabase === 'function') {
      await userService.initializeUsersDatabase();
    }
    
    // Initialize suppliers schema
    if (supplierService && typeof supplierService.initializeSuppliersDatabase === 'function') {
      await supplierService.initializeSuppliersDatabase();
    }
    
    // Initialize purchase orders schema
    if (purchaseOrderService && typeof purchaseOrderService.initializePurchaseOrdersDatabase === 'function') {
      await purchaseOrderService.initializePurchaseOrdersDatabase();
    }
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error.message);
  }
}

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => {
  console.log(`Picqer middleware server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database: ${dbConfig.server}/${dbConfig.database}`);
  console.log(`Picqer API: ${baseUrl}`);
  
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

// Export services for use by other modules (avoiding circular dependency)
module.exports = {
  app,
  purchaseOrderService,
  picqerService,
  picklistService,
  warehouseService,
  userService,
  supplierService
};

