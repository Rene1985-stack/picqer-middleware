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
const ReceiptService = require('./receipt_service');

// Import API adapters
const DataSyncApiAdapter = require('./data_sync_api_adapter');
const SyncImplementation = require('./sync_implementation');

// Load environment variables
dotenv.config();

console.log('Initializing PicqerService with:');
console.log('API Key (first 5 chars):', process.env.PICQER_API_KEY ? process.env.PICQER_API_KEY.substring(0, 5) + '...' : 'NOT SET');
console.log('Base URL:', process.env.PICQER_API_URL || 'NOT SET');

// Validate required environment variables - USING SQL_ PREFIXED VARIABLES
const requiredEnvVars = ['PICQER_API_KEY', 'PICQER_API_URL', 'SQL_USER', 'SQL_PASSWORD', 'SQL_DATABASE'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please check your Railway environment variables and ensure all required variables are set.');
  console.error('Expected variables: SQL_USER, SQL_PASSWORD, SQL_DATABASE, SQL_SERVER, PICQER_API_KEY, PICQER_API_URL');
  process.exit(1);
}

// Validate database server configuration
if (!process.env.SQL_SERVER) {
  console.error('Missing database server configuration. Please set SQL_SERVER in Railway environment variables.');
  process.exit(1);
}

// Configure SQL connection using SQL_ prefixed environment variables
const sqlConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DATABASE,
  server: process.env.SQL_SERVER,
  port: parseInt(process.env.SQL_PORT) || 1433,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 60000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200
  },
  connectionTimeout: 60000, // 60 seconds
  requestTimeout: 60000, // 60 seconds
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true,
    connectTimeout: 60000,
    requestTimeout: 60000,
    cancelTimeout: 5000,
    packetSize: 4096,
    useUTC: false
  }
};

console.log('Database configuration:');
console.log('Server:', sqlConfig.server);
console.log('Database:', sqlConfig.database);
console.log('User:', sqlConfig.user);
console.log('Port:', sqlConfig.port, '(type:', typeof sqlConfig.port, ')');

// Configure Picqer API connection
const apiKey = process.env.PICQER_API_KEY;
const baseUrl = process.env.PICQER_BASE_URL || process.env.PICQER_API_URL;

// Initialize Express app
const app = express();
const port = process.env.PORT || 8080;

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
let receiptService;
let dataSyncAdapter;

// Database connection with retry logic
async function connectToDatabase(retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Database connection attempt ${attempt}/${retries}...`);
      await sql.connect(sqlConfig);
      console.log('✅ Connected to SQL Server database successfully');
      
      // Test the connection
      const request = new sql.Request();
      await request.query('SELECT 1 as test');
      console.log('✅ Database connection test successful');
      
      // Initialize services after database connection
      picqerService = new PicqerService(apiKey, baseUrl);
      picklistService = new PicklistService(sql, picqerService);
      warehouseService = new WarehouseService(sql, picqerService);
      userService = new UserService(sql, picqerService);
      supplierService = new SupplierService(sql, picqerService);
      batchService = new BatchService(sql, picqerService);
      purchaseOrderService = new PurchaseOrderService(sql, picqerService);
      receiptService = new ReceiptService(sql, picqerService);
      
      // Initialize data sync adapter
      dataSyncAdapter = new DataSyncApiAdapter(sql, {
        picqerService,
        picklistService,
        warehouseService,
        userService,
        supplierService,
        batchService,
        purchaseOrderService,
        receiptService
      });
      
      console.log('Data sync API adapter initialized with services:', Object.keys({
        picqerService,
        picklistService,
        warehouseService,
        userService,
        supplierService,
        batchService,
        purchaseOrderService,
        receiptService
      }).filter(key => key.endsWith('Service')));
      
      return; // Success, exit the retry loop
      
    } catch (error) {
      console.error(`❌ Database connection attempt ${attempt} failed:`, error.message);
      
      if (error.code === 'ETIMEOUT') {
        console.error('🔥 Connection timeout - this usually indicates:');
        console.error('   1. Azure SQL firewall is blocking Railway connections');
        console.error('   2. Network connectivity issues');
        console.error('   3. Incorrect server name or port');
      }
      
      if (attempt === retries) {
        console.error('💥 All database connection attempts failed');
        console.error('🛠️  Troubleshooting steps:');
        console.error('   1. Check Azure SQL firewall settings');
        console.error('   2. Verify server name and credentials');
        console.error('   3. Ensure "Allow Azure services" is enabled');
        throw error;
      }
      
      // Wait before retrying (exponential backoff)
      const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
      console.log(`⏳ Waiting ${waitTime/1000}s before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

// API Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Purchase Orders endpoints
app.get('/api/sync/purchaseorders', async (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days) : null;
    const full = req.query.full === 'true';
    const result = await purchaseOrderService.syncPurchaseOrders(days, full);
    res.json(result);
  } catch (error) {
    console.error('Error syncing purchase orders:', error);
    res.status(500).json({ error: 'Failed to sync purchase orders' });
  }
});

app.get('/api/purchaseorders', async (req, res) => {
  try {
    const purchaseOrders = await purchaseOrderService.getAllPurchaseOrdersFromDatabase();
    res.json(purchaseOrders);
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
});

app.get('/api/purchaseorders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const purchaseOrder = await purchaseOrderService.getPurchaseOrderByIdFromDatabase(id);
    if (!purchaseOrder) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    res.json(purchaseOrder);
  } catch (error) {
    console.error('Error fetching purchase order:', error);
    res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
});

// Receipt endpoints
app.get('/api/sync/receipts', async (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days) : null;
    const full = req.query.full === 'true';
    const result = await receiptService.syncReceipts(days, full);
    res.json(result);
  } catch (error) {
    console.error('Error syncing receipts:', error);
    res.status(500).json({ error: 'Failed to sync receipts' });
  }
});

app.get('/api/receipts', async (req, res) => {
  try {
    const receipts = await receiptService.getAllReceiptsFromDatabase();
    res.json(receipts);
  } catch (error) {
    console.error('Error fetching receipts:', error);
    res.status(500).json({ error: 'Failed to fetch receipts' });
  }
});

app.get('/api/receipts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const receipt = await receiptService.getReceiptByIdFromDatabase(id);
    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }
    res.json(receipt);
  } catch (error) {
    console.error('Error fetching receipt:', error);
    res.status(500).json({ error: 'Failed to fetch receipt' });
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
      console.log(`Picqer middleware server running on port ${port}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Database: ${sqlConfig.server}/${sqlConfig.database}`);
      console.log(`Picqer API: ${baseUrl}`);
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

