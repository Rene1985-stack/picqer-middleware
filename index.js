/**
 * Fixed index.js with dashboard routing and database connection adapter
 * 
 * This version fixes both issues:
 * 1. Adds explicit route handler for '/dashboard/' path
 * 2. Uses the db-connection-adapter to support both SQL_ and DB_ prefixed variables
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Import database connection adapter
const dbAdapter = require('./db-connection-adapter');

// Import services directly - no destructuring
const PicqerApiClient = require('./picqer-api-client');
const BatchService = require('./batch_service');
const PicklistService = require('./picklist-service');
const WarehouseService = require('./warehouse_service');
const UserService = require('./user_service');
const SupplierService = require('./supplier_service');

// Import API adapters - note that these are modules that export functions
const apiAdapterModule = require('./api-adapter');
const dataSyncApiAdapterModule = require('./data_sync_api_adapter');
const batchDashboardApiModule = require('./batch_dashboard_api');
const SyncImplementation = require('./sync_implementation');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Use environment variable with fallback - prioritize PICQER_BASE_URL as configured in Railway
const picqerApiUrl = process.env.PICQER_BASE_URL || process.env.PICQER_API_URL;

// Log the API URL being used for debugging
console.log(`Using Picqer API URL: ${picqerApiUrl}`);

// Get database configuration that works with both SQL_ and DB_ prefixed variables
const dbConfig = dbAdapter.getDatabaseConfig();

// Validate database configuration
try {
  dbAdapter.validateDatabaseConfig(dbConfig);
  console.log('Database configuration validated successfully');
} catch (error) {
  console.error('Database configuration validation failed:', error.message);
  console.error('The middleware will start, but database operations will likely fail');
}

// Create Picqer API client directly
const picqerClient = new PicqerApiClient(
  process.env.PICQER_API_KEY,
  picqerApiUrl,
  {
    requestsPerMinute: 30,
    maxRetries: 5,
    waitOnRateLimit: true,
    sleepTimeOnRateLimitHitInMs: 20000
  }
);

// Create service instances with the unified database configuration
const services = {
  BatchService: new BatchService(
    process.env.PICQER_API_KEY,
    picqerApiUrl,
    dbConfig
  ),
  PicklistService: new PicklistService(
    process.env.PICQER_API_KEY,
    picqerApiUrl,
    dbConfig
  ),
  WarehouseService: new WarehouseService(
    process.env.PICQER_API_KEY,
    picqerApiUrl,
    dbConfig
  ),
  UserService: new UserService(
    process.env.PICQER_API_KEY,
    picqerApiUrl,
    dbConfig
  ),
  SupplierService: new SupplierService(
    process.env.PICQER_API_KEY,
    picqerApiUrl,
    dbConfig
  )
};

// Create sync implementation
const syncImplementation = new SyncImplementation(services);

// Initialize services
async function initializeServices() {
  try {
    console.log('Initializing services...');
    
    // Initialize BatchService
    await services.BatchService.initialize();
    
    // Initialize PicklistService
    await services.PicklistService.initialize();
    
    // Initialize WarehouseService
    await services.WarehouseService.initialize();
    
    // Initialize UserService
    await services.UserService.initialize();
    
    // Initialize SupplierService
    await services.SupplierService.initialize();
    
    console.log('All services initialized successfully');
  } catch (error) {
    console.error('Error initializing services:', error.message);
  }
}

// Initialize services on startup
initializeServices();

// Create basic API endpoints for dashboard functionality
const apiRouter = express.Router();

// Status endpoint
apiRouter.get('/status', (req, res) => {
  res.json({
    online: true,
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Stats endpoint
apiRouter.get('/stats', async (req, res) => {
  try {
    const stats = {
      products: {
        totalCount: await services.PicklistService.getCount(),
        lastSyncDate: await services.PicklistService.getLastSyncDate(),
        status: 'OK'
      },
      picklists: {
        totalCount: await services.PicklistService.getCount(),
        lastSyncDate: await services.PicklistService.getLastSyncDate(),
        status: 'OK'
      },
      warehouses: {
        totalCount: await services.WarehouseService.getCount(),
        lastSyncDate: await services.WarehouseService.getLastSyncDate(),
        status: 'OK'
      },
      users: {
        totalCount: await services.UserService.getCount(),
        lastSyncDate: await services.UserService.getLastSyncDate(),
        status: 'OK'
      },
      suppliers: {
        totalCount: await services.SupplierService.getCount(),
        lastSyncDate: await services.SupplierService.getLastSyncDate(),
        status: 'OK'
      },
      batches: {
        totalCount: await services.BatchService.getCount(),
        lastSyncDate: await services.BatchService.getLastSyncDate(),
        status: 'OK'
      }
    };
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Logs endpoint
apiRouter.get('/logs', (req, res) => {
  res.json({
    success: true,
    logs: [
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'System is running normally'
      }
    ]
  });
});

// History endpoint
apiRouter.get('/history', (req, res) => {
  res.json({
    success: true,
    history: [
      {
        entity_type: 'products',
        timestamp: new Date().toISOString(),
        success: true,
        count: 0
      },
      {
        entity_type: 'picklists',
        timestamp: new Date().toISOString(),
        success: true,
        count: 0
      }
    ]
  });
});

// Sync all endpoint
apiRouter.post('/sync', async (req, res) => {
  try {
    // Start sync in background
    syncImplementation.syncAll();
    
    res.json({
      success: true,
      message: 'Sync started for all entities',
      background: true
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Sync products endpoint
apiRouter.post('/sync/products', async (req, res) => {
  try {
    // Start sync in background
    syncImplementation.syncProducts();
    
    res.json({
      success: true,
      message: 'Sync started for products',
      background: true
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Sync picklists endpoint
apiRouter.post('/sync/picklists', async (req, res) => {
  try {
    // Start sync in background
    syncImplementation.syncPicklists();
    
    res.json({
      success: true,
      message: 'Sync started for picklists',
      background: true
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Sync warehouses endpoint
apiRouter.post('/sync/warehouses', async (req, res) => {
  try {
    // Start sync in background
    syncImplementation.syncWarehouses();
    
    res.json({
      success: true,
      message: 'Sync started for warehouses',
      background: true
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Sync users endpoint
apiRouter.post('/sync/users', async (req, res) => {
  try {
    // Start sync in background
    syncImplementation.syncUsers();
    
    res.json({
      success: true,
      message: 'Sync started for users',
      background: true
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Sync suppliers endpoint
apiRouter.post('/sync/suppliers', async (req, res) => {
  try {
    // Start sync in background
    syncImplementation.syncSuppliers();
    
    res.json({
      success: true,
      message: 'Sync started for suppliers',
      background: true
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Sync batches endpoint
apiRouter.post('/sync/batches', async (req, res) => {
  try {
    // Start sync in background
    syncImplementation.syncBatches();
    
    res.json({
      success: true,
      message: 'Sync started for batches',
      background: true
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Use our API router
app.use('/api', apiRouter);

// Check if apiAdapterModule is a function or an object with a router
if (typeof apiAdapterModule === 'function') {
  // If it's a function, call it with services
  app.use('/api', apiAdapterModule(services));
} else if (apiAdapterModule && apiAdapterModule.router) {
  // If it has a router property, use that
  app.use('/api', apiAdapterModule.router);
  // And initialize it if it has an initializeServices method
  if (typeof apiAdapterModule.initializeServices === 'function') {
    apiAdapterModule.initializeServices(services);
  }
}

// Check if dataSyncApiAdapterModule is a function or an object with a router
if (typeof dataSyncApiAdapterModule === 'function') {
  // If it's a function, call it with services and syncImplementation
  app.use('/api', dataSyncApiAdapterModule(services, syncImplementation));
} else if (dataSyncApiAdapterModule && dataSyncApiAdapterModule.router) {
  // If it has a router property, use that
  app.use('/api', dataSyncApiAdapterModule.router);
  // And initialize it if it has an initializeServices method
  if (typeof dataSyncApiAdapterModule.initializeServices === 'function') {
    dataSyncApiAdapterModule.initializeServices(services, syncImplementation);
  }
}

// Check if batchDashboardApiModule is a function or an object with a router
if (typeof batchDashboardApiModule === 'function') {
  // If it's a function, call it with services
  app.use('/api', batchDashboardApiModule(services));
} else if (batchDashboardApiModule && batchDashboardApiModule.router) {
  // If it has a router property, use that
  app.use('/api', batchDashboardApiModule.router);
  // And initialize it if it has an initializeServices method
  if (typeof batchDashboardApiModule.initializeServices === 'function') {
    batchDashboardApiModule.initializeServices(services);
  }
}

// FIX: Create dashboard directory if it doesn't exist
const dashboardDir = path.join(__dirname, 'dashboard');
if (!fs.existsSync(dashboardDir)) {
  console.log('Creating dashboard directory');
  fs.mkdirSync(dashboardDir, { recursive: true });
}

// Serve static dashboard files
app.use(express.static(path.join(__dirname, 'dashboard')));

// FIX: Add explicit route for /dashboard/ path
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'dashboard.html'));
});

app.get('/dashboard/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'dashboard.html'));
});

// Serve dashboard at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'dashboard.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`Picqer middleware server running on port ${port}`);
});

module.exports = app;
