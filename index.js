/**
 * Final comprehensive fix for index.js with proper imports, API adapter initialization, dashboard routing, and dashboard files
 * 
 * This version fixes all identified issues:
 * 1. PicqerApiClient import issue
 * 2. API adapter function issue
 * 3. Dashboard routing issue
 * 4. Missing dashboard JavaScript files
 * 5. Dashboard HTML creation issue
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

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

// FIX: Create dashboard directory if it doesn't exist
const dashboardDir = path.join(__dirname, 'dashboard');
if (!fs.existsSync(dashboardDir)) {
  console.log('Creating dashboard directory');
  fs.mkdirSync(dashboardDir, { recursive: true });
}

// FIX: Create all required JavaScript files for the dashboard
const dashboardJsFiles = {
  'dashboard-api.js': fs.readFileSync(path.join(__dirname, 'dashboard-api.js'), 'utf8'),
  'batch-ui-components.js': fs.readFileSync(path.join(__dirname, 'batch-ui-components.js'), 'utf8'),
  'batch-charts.js': fs.readFileSync(path.join(__dirname, 'batch-charts.js'), 'utf8'),
  'sync-button-verifier.js': fs.readFileSync(path.join(__dirname, 'sync-button-verifier.js'), 'utf8'),
  'dashboard-date-formatter.js': fs.readFileSync(path.join(__dirname, 'dashboard-date-formatter.js'), 'utf8'),
  'api-endpoint-monitor.js': fs.readFileSync(path.join(__dirname, 'api-endpoint-monitor.js'), 'utf8')
};

// Write all JavaScript files to the dashboard directory
for (const [filename, content] of Object.entries(dashboardJsFiles)) {
  const filePath = path.join(dashboardDir, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`Creating ${filename} in dashboard directory`);
    fs.writeFileSync(filePath, content);
  }
}

// FIX: Create a basic dashboard.html file if it doesn't exist
const dashboardHtmlPath = path.join(dashboardDir, 'dashboard.html');
if (!fs.existsSync(dashboardHtmlPath)) {
  console.log('Creating basic dashboard.html file');
  const basicDashboardHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Picqer Middleware Dashboard</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background-color: white;
      padding: 20px;
      border-radius: 5px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    h1 {
      color: #333;
    }
    .card {
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 15px;
      margin-bottom: 20px;
    }
    .card h2 {
      margin-top: 0;
      border-bottom: 1px solid #eee;
      padding-bottom: 10px;
    }
    button {
      background-color: #4CAF50;
      color: white;
      border: none;
      padding: 10px 15px;
      text-align: center;
      text-decoration: none;
      display: inline-block;
      font-size: 16px;
      margin: 4px 2px;
      cursor: pointer;
      border-radius: 4px;
    }
    button:hover {
      background-color: #45a049;
    }
    .status {
      display: inline-block;
      padding: 5px 10px;
      border-radius: 3px;
      font-size: 14px;
    }
    .status.online {
      background-color: #dff0d8;
      color: #3c763d;
    }
    .status.offline {
      background-color: #f2dede;
      color: #a94442;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    table, th, td {
      border: 1px solid #ddd;
    }
    th, td {
      padding: 10px;
      text-align: left;
    }
    th {
      background-color: #f2f2f2;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Picqer Middleware Dashboard</h1>
    
    <div class="card">
      <h2>System Status</h2>
      <div id="status">Checking status...</div>
    </div>
    
    <div class="card">
      <h2>Sync Data</h2>
      <button id="syncAll">Sync All</button>
      <button id="syncProducts">Sync Products</button>
      <button id="syncPicklists">Sync Picklists</button>
      <button id="syncWarehouses">Sync Warehouses</button>
      <button id="syncUsers">Sync Users</button>
      <button id="syncSuppliers">Sync Suppliers</button>
      <button id="syncBatches">Sync Batches</button>
    </div>
    
    <div class="card">
      <h2>Statistics</h2>
      <div id="stats">Loading statistics...</div>
    </div>
    
    <div class="card">
      <h2>Sync History</h2>
      <div id="history">Loading history...</div>
    </div>
    
    <div class="card">
      <h2>API Endpoint Status</h2>
      <div id="endpoint-status">Loading endpoint status...</div>
    </div>
  </div>

  <!-- JavaScript files -->
  <script src="dashboard-api.js"></script>
  <script src="batch-ui-components.js"></script>
  <script src="batch-charts.js"></script>
  <script src="sync-button-verifier.js"></script>
  <script src="dashboard-date-formatter.js"></script>
  <script src="api-endpoint-monitor.js"></script>
</body>
</html>
  `;
  // FIX: Use basicDashboardHtml instead of content
  fs.writeFileSync(dashboardHtmlPath, basicDashboardHtml);
}

// Serve static files from the dashboard directory
app.use(express.static(path.join(__dirname, 'dashboard')));

// FIX: Serve dashboard.html for both root and /dashboard/ routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'dashboard.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'dashboard.html'));
});

app.get('/dashboard/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'dashboard.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Export for testing
module.exports = app;
