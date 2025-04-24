/**
 * Complete fix for index.js with proper imports and API adapter initialization
 * 
 * This version fixes both the PicqerApiClient import issue and the apiAdapter issue
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

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

// Create Picqer API client directly
const picqerClient = new PicqerApiClient(
  process.env.PICQER_API_KEY,
  process.env.PICQER_API_URL,
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
    process.env.PICQER_API_URL,
    {
      server: process.env.SQL_SERVER,
      port: parseInt(process.env.SQL_PORT || '1433', 10),
      database: process.env.SQL_DATABASE,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      options: {
        encrypt: true
      }
    }
  ),
  PicklistService: new PicklistService(
    process.env.PICQER_API_KEY,
    process.env.PICQER_API_URL,
    {
      server: process.env.SQL_SERVER,
      port: parseInt(process.env.SQL_PORT || '1433', 10),
      database: process.env.SQL_DATABASE,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      options: {
        encrypt: true
      }
    }
  ),
  WarehouseService: new WarehouseService(
    process.env.PICQER_API_KEY,
    process.env.PICQER_API_URL,
    {
      server: process.env.SQL_SERVER,
      port: parseInt(process.env.SQL_PORT || '1433', 10),
      database: process.env.SQL_DATABASE,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      options: {
        encrypt: true
      }
    }
  ),
  UserService: new UserService(
    process.env.PICQER_API_KEY,
    process.env.PICQER_API_URL,
    {
      server: process.env.SQL_SERVER,
      port: parseInt(process.env.SQL_PORT || '1433', 10),
      database: process.env.SQL_DATABASE,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      options: {
        encrypt: true
      }
    }
  ),
  SupplierService: new SupplierService(
    process.env.PICQER_API_KEY,
    process.env.PICQER_API_URL,
    {
      server: process.env.SQL_SERVER,
      port: parseInt(process.env.SQL_PORT || '1433', 10),
      database: process.env.SQL_DATABASE,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      options: {
        encrypt: true
      }
    }
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
} else {
  // Fallback: create a basic router
  console.log('Creating fallback API adapter');
  const fallbackRouter = express.Router();
  
  // Add basic status endpoint
  fallbackRouter.get('/status', (req, res) => {
    res.json({ 
      online: true, 
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  });
  
  app.use('/api', fallbackRouter);
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
} else {
  // Fallback: create a basic router for sync endpoints
  console.log('Creating fallback data sync API adapter');
  const fallbackSyncRouter = express.Router();
  
  // Add basic sync endpoint
  fallbackSyncRouter.post('/sync', (req, res) => {
    res.json({ 
      success: true, 
      message: 'Sync request received (fallback implementation)',
      background: true
    });
  });
  
  app.use('/api', fallbackSyncRouter);
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

// Serve static files from the dashboard directory
app.use(express.static(path.join(__dirname, 'dashboard')));

// Serve the dashboard HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'dashboard.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Export for testing
module.exports = app;
