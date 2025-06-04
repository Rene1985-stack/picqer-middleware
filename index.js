/**
 * Picqer Middleware - Main Entry Point
 * Integrates with Picqer API and provides middleware services for
 * data synchronization
 */

// Import required modules
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const sql = require('mssql');
const morgan = require('morgan');

// Import service classes
const PicqerService = require('./picqer-service');
const PicklistService = require('./picklist-service');
const WarehouseService = require('./warehouse_service');
const UserService = require('./user_service');
const SupplierService = require('./supplier_service');
const BatchService = require('./batch_service');
const PurchaseOrderService = require('./purchase_order_service');

// Import API adapters
const DataSyncApiAdapter = require('./data_sync_api_adapter');
const SyncImplementation = require('./sync_implementation');

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['PICQER_API_KEY', 'PICQER_API_URL', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please check your .env file and ensure all required variables are set.');
  process.exit(1);
}

// Validate database server configuration
if (!process.env.DB_HOST && !process.env.DB_SERVER) {
  console.error('Missing database server configuration. Please set either DB_HOST or DB_SERVER.');
  process.exit(1);
}

// Configure SQL connection
const sqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  server: process.env.DB_HOST || process.env.DB_SERVER,
  port: process.env.DB_PORT || 1433,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

// Configure Picqer API connection
const apiKey = process.env.PICQER_API_KEY;
const apiUrl = process.env.PICQER_API_URL;

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize services
let picqerService;
let picklistService;
let warehouseService;
let userService;
let supplierService;
let batchService;
let purchaseOrderService;
let dataSyncAdapter;

// Database connection
async function connectToDatabase() {
  try {
    await sql.connect(sqlConfig);
    console.log('Connected to SQL Server database');
    
    // Initialize services after database connection
    picqerService = new PicqerService(apiKey, apiUrl);
    picklistService = new PicklistService(sql, picqerService);
    warehouseService = new WarehouseService(sql, picqerService);
    userService = new UserService(sql, picqerService);
    supplierService = new SupplierService(sql, picqerService);
    batchService = new BatchService(sql, picqerService);
    purchaseOrderService = new PurchaseOrderService(sql, picqerService);
    
    // Initialize data sync adapter
    dataSyncAdapter = new DataSyncApiAdapter(sql, {
      picqerService,
      picklistService,
      warehouseService,
      userService,
      supplierService,
      batchService,
      purchaseOrderService
    });
    
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

// API Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Purchase Orders endpoints
app.get('/api/sync/purchaseorders', async (req, res) => {
  try {
    const result = await purchaseOrderService.syncPurchaseOrders();
    res.json(result);
  } catch (error) {
    console.error('Error syncing purchase orders:', error);
    res.status(500).json({ error: 'Failed to sync purchase orders' });
  }
});

app.get('/api/purchaseorders', async (req, res) => {
  try {
    const purchaseOrders = await purchaseOrderService.getAllPurchaseOrders();
    res.json(purchaseOrders);
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
});

app.get('/api/purchaseorders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const purchaseOrder = await purchaseOrderService.getPurchaseOrderById(id);
    if (!purchaseOrder) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    res.json(purchaseOrder);
  } catch (error) {
    console.error('Error fetching purchase order:', error);
    res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
});

// General sync endpoints
app.get('/api/sync/all', async (req, res) => {
  try {
    const results = await dataSyncAdapter.syncAll();
    res.json(results);
  } catch (error) {
    console.error('Error in full sync:', error);
    res.status(500).json({ error: 'Failed to perform full sync' });
  }
});

// Individual entity sync endpoints
app.get('/api/sync/picklists', async (req, res) => {
  try {
    const result = await picklistService.syncPicklists();
    res.json(result);
  } catch (error) {
    console.error('Error syncing picklists:', error);
    res.status(500).json({ error: 'Failed to sync picklists' });
  }
});

app.get('/api/sync/warehouses', async (req, res) => {
  try {
    const result = await warehouseService.syncWarehouses();
    res.json(result);
  } catch (error) {
    console.error('Error syncing warehouses:', error);
    res.status(500).json({ error: 'Failed to sync warehouses' });
  }
});

app.get('/api/sync/batches', async (req, res) => {
  try {
    const result = await batchService.syncBatches();
    res.json(result);
  } catch (error) {
    console.error('Error syncing batches:', error);
    res.status(500).json({ error: 'Failed to sync batches' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
async function startServer() {
  try {
    await connectToDatabase();
    app.listen(port, '0.0.0.0', () => {
      console.log(`Picqer Middleware server running on port ${port}`);
      console.log(`Health check available at: http://localhost:${port}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  try {
    await sql.close();
    console.log('Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start the application
startServer();

