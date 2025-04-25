/**
 * Simplified index.js
 * 
 * This is a streamlined version of the middleware that:
 * 1. Initializes services
 * 2. Sets up basic API routes
 * 3. Includes database schema fixes directly
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Import database connection adapter
const dbAdapter = require('./db-connection-adapter');

// Import services
const PicqerApiClient = require('./picqer-api-client');
const BatchService = require('./batch_service');
const PicklistService = require('./picklist-service');
const WarehouseService = require('./warehouse_service');
const UserService = require('./user_service');
const SupplierService = require('./supplier_service');

// Import API adapters
const apiAdapterModule = require('./api-adapter');
const batchDashboardApiModule = require('./batch_dashboard_api');

// Import sync module
const syncModule = require('./sync');

// Create Express app
const app = express();

// Use CORS middleware
app.use(cors());

// Use JSON middleware
app.use(express.json());

// Get port from environment variable or use default
const port = process.env.PORT || 8080;

// Environment variable consistency fix for Picqer API URL
const picqerApiUrl = process.env.PICQER_API_URL || process.env.PICQER_BASE_URL;
if (!picqerApiUrl) {
  console.error('ERROR: Neither PICQER_API_URL nor PICQER_BASE_URL environment variables are set');
  process.exit(1);
}

// Log for debugging
console.log(`Using Picqer API URL: ${picqerApiUrl}`);

// Get database configuration
const dbConfig = dbAdapter.getDatabaseConfig();

// Validate database configuration
try {
  dbAdapter.validateDatabaseConfig(dbConfig);
  console.log('Database configuration validated successfully');
} catch (error) {
  console.error('Database configuration validation failed:', error.message);
  console.error('The middleware will start, but database operations will likely fail');
}

// Create Picqer API client
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

// Create service instances
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

// Initialize services
async function initializeServices() {
  try {
    console.log('Initializing services...');
    
    // Initialize database schema
    await syncModule.fixDatabaseSchema(dbConfig);
    
    // Initialize each service
    for (const [serviceName, service] of Object.entries(services)) {
      if (typeof service.initialize === 'function') {
        await service.initialize();
        console.log(`${serviceName} initialized successfully`);
      }
    }
    
    console.log('All services initialized successfully');
  } catch (error) {
    console.error('Error initializing services:', error.message);
  }
}

// Initialize services on startup
initializeServices();

// Create API router
const apiRouter = express.Router();

// Status endpoint
apiRouter.get('/status', (req, res) => {
  res.json({
    online: true,
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Sync endpoints
apiRouter.post('/sync/warehouses', async (req, res) => {
  try {
    console.log('Warehouse sync request received');
    const result = await syncModule.syncWarehouses(services.WarehouseService);
    res.json(result);
  } catch (error) {
    console.error('Error syncing warehouses:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

apiRouter.post('/sync/users', async (req, res) => {
  try {
    console.log('Users sync request received');
    const result = await syncModule.syncUsers(services.UserService);
    res.json(result);
  } catch (error) {
    console.error('Error syncing users:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

apiRouter.post('/sync/suppliers', async (req, res) => {
  try {
    console.log('Suppliers sync request received');
    const result = await syncModule.syncSuppliers(services.SupplierService);
    res.json(result);
  } catch (error) {
    console.error('Error syncing suppliers:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

apiRouter.post('/sync/picklists', async (req, res) => {
  try {
    console.log('Picklists sync request received');
    const result = await syncModule.syncPicklists(services.PicklistService);
    res.json(result);
  } catch (error) {
    console.error('Error syncing picklists:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

apiRouter.post('/sync/batches', async (req, res) => {
  try {
    console.log('Batches sync request received');
    const result = await syncModule.syncBatches(services.BatchService);
    res.json(result);
  } catch (error) {
    console.error('Error syncing batches:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Sync all entities endpoint
apiRouter.post('/sync/all', async (req, res) => {
  try {
    console.log('Sync all request received');
    
    const results = {
      warehouses: await syncModule.syncWarehouses(services.WarehouseService),
      users: await syncModule.syncUsers(services.UserService),
      suppliers: await syncModule.syncSuppliers(services.SupplierService),
      picklists: await syncModule.syncPicklists(services.PicklistService),
      batches: await syncModule.syncBatches(services.BatchService)
    };
    
    const success = Object.values(results).every(result => result.success);
    
    res.json({
      success,
      message: success ? 'All entities synced successfully' : 'Some entities failed to sync',
      results
    });
  } catch (error) {
    console.error('Error syncing all entities:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get sync status endpoint
apiRouter.get('/sync/status', async (req, res) => {
  try {
    const status = await syncModule.getSyncStatus(dbConfig);
    res.json(status);
  } catch (error) {
    console.error('Error getting sync status:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Use our API router
app.use('/api', apiRouter);

// Initialize API adapters
if (apiAdapterModule && typeof apiAdapterModule.initializeServices === 'function') {
  apiAdapterModule.initializeServices(services);
}

// Initialize batch dashboard API adapter
if (batchDashboardApiModule && typeof batchDashboardApiModule.initializeServices === 'function') {
  batchDashboardApiModule.initializeServices(services);
}

// Use API routers
if (apiAdapterModule && apiAdapterModule.router) {
  app.use('/api', apiAdapterModule.router);
}

// Use batch dashboard API router
if (batchDashboardApiModule && batchDashboardApiModule.router) {
  app.use('/api', batchDashboardApiModule.router);
}

// Create dashboard directory if it doesn't exist
const dashboardDir = path.join(__dirname, 'dashboard');
if (!fs.existsSync(dashboardDir)) {
  console.log('Creating dashboard directory');
  fs.mkdirSync(dashboardDir, { recursive: true });
}

// Serve static dashboard files
app.use(express.static(path.join(__dirname, 'dashboard')));

// Add explicit route for /dashboard/ path
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
  console.log(`Dashboard available at: http://localhost:${port}/dashboard/`);
  console.log(`API available at: http://localhost:${port}/api/`);
});

module.exports = app;
