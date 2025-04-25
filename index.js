/**
 * Fixed index.js with proper sync method integration
 * 
 * This version fixes all identified issues:
 * 1. Uses the existing sync-method-integration.js to integrate sync methods
 * 2. Properly initializes data_sync_api_adapter with services
 * 3. Ensures dashboard routes work correctly
 * 4. Uses the db-connection-adapter for database connectivity
 * 5. Adds fallback for PICQER_API_URL and PICQER_BASE_URL
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

// Import API adapters
const apiAdapterModule = require('./api-adapter');
const dataSyncApiAdapterModule = require('./fixed-data-sync-api-adapter');
const batchDashboardApiModule = require('./batch_dashboard_api');

// Import sync method integration
const { integrateSyncMethods } = require('./sync-method-integration');

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

// Integrate sync methods into service classes
integrateSyncMethods(services);

// Initialize services
async function initializeServices() {
  try {
    console.log('Initializing services...');
    
    // Initialize BatchService
    if (typeof services.BatchService.initialize === 'function') {
      await services.BatchService.initialize();
    }
    
    // Initialize PicklistService
    if (typeof services.PicklistService.initialize === 'function') {
      await services.PicklistService.initialize();
    }
    
    // Initialize WarehouseService
    if (typeof services.WarehouseService.initialize === 'function') {
      await services.WarehouseService.initialize();
    }
    
    // Initialize UserService
    if (typeof services.UserService.initialize === 'function') {
      await services.UserService.initialize();
    }
    
    // Initialize SupplierService
    if (typeof services.SupplierService.initialize === 'function') {
      await services.SupplierService.initialize();
    }
    
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

// Use our API router
app.use('/api', apiRouter);

// Initialize API adapters
if (apiAdapterModule && typeof apiAdapterModule.initializeServices === 'function') {
  apiAdapterModule.initializeServices(services);
}

// Initialize data sync API adapter with services
if (dataSyncApiAdapterModule && typeof dataSyncApiAdapterModule.initializeServices === 'function') {
  dataSyncApiAdapterModule.initializeServices(services);
}

// Initialize batch dashboard API adapter
if (batchDashboardApiModule && typeof batchDashboardApiModule.initializeServices === 'function') {
  batchDashboardApiModule.initializeServices(services);
}

// Use API routers
if (apiAdapterModule && apiAdapterModule.router) {
  app.use('/api', apiAdapterModule.router);
}

// Use data sync API router
if (dataSyncApiAdapterModule && dataSyncApiAdapterModule.router) {
  app.use('/api', dataSyncApiAdapterModule.router);
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
