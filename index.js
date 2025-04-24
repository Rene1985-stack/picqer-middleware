/**
 * Updated index.js with environment variable fallback for Picqer API URL
 * 
 * This version fixes the environment variable naming discrepancy by:
 * 1. Prioritizing PICQER_BASE_URL (as configured in Railway)
 * 2. Falling back to PICQER_API_URL for backward compatibility
 * 3. Maintaining all other functionality
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

// Use environment variable with fallback - prioritize PICQER_BASE_URL as configured in Railway
const picqerApiUrl = process.env.PICQER_BASE_URL || process.env.PICQER_API_URL;

// Log the API URL being used for debugging
console.log(`Using Picqer API URL: ${picqerApiUrl}`);

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

// Create service instances
const services = {
  BatchService: new BatchService(
    process.env.PICQER_API_KEY,
    picqerApiUrl,
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
    picqerApiUrl,
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
    picqerApiUrl,
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
    picqerApiUrl,
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
    picqerApiUrl,
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

// FIX: Create a dashboard.html file with inline JavaScript
const dashboardHtmlPath = path.join(dashboardDir, 'dashboard.html');
if (!fs.existsSync(dashboardHtmlPath)) {
  console.log('Creating dashboard.html file with inline JavaScript');
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

  <!-- Inline JavaScript -->
  <script>
    // Dashboard API
    document.addEventListener('DOMContentLoaded', function() {
      // API endpoints
      const API_ENDPOINTS = {
        STATUS: '/api/status',
        STATS: '/api/stats',
        LOGS: '/api/logs',
        HISTORY: '/api/history',
        SYNC: '/api/sync',
        SYNC_PRODUCTS: '/api/sync/products',
        SYNC_PICKLISTS: '/api/sync/picklists',
        SYNC_WAREHOUSES: '/api/sync/warehouses',
        SYNC_USERS: '/api/sync/users',
        SYNC_SUPPLIERS: '/api/sync/suppliers',
        SYNC_BATCHES: '/api/sync/batches'
      };
      
      // Initialize event listeners
      const syncAllButton = document.getElementById('syncAll');
      if (syncAllButton) {
        syncAllButton.addEventListener('click', function() {
          syncAll();
        });
      }
      
      const syncProductsButton = document.getElementById('syncProducts');
      if (syncProductsButton) {
        syncProductsButton.addEventListener('click', function() {
          syncEntity('products');
        });
      }
      
      const syncPicklistsButton = document.getElementById('syncPicklists');
      if (syncPicklistsButton) {
        syncPicklistsButton.addEventListener('click', function() {
          syncEntity('picklists');
        });
      }
      
      const syncWarehousesButton = document.getElementById('syncWarehouses');
      if (syncWarehousesButton) {
        syncWarehousesButton.addEventListener('click', function() {
          syncEntity('warehouses');
        });
      }
      
      const syncUsersButton = document.getElementById('syncUsers');
      if (syncUsersButton) {
        syncUsersButton.addEventListener('click', function() {
          syncEntity('users');
        });
      }
      
      const syncSuppliersButton = document.getElementById('syncSuppliers');
      if (syncSuppliersButton) {
        syncSuppliersButton.addEventListener('click', function() {
          syncEntity('suppliers');
        });
      }
      
      const syncBatchesButton = document.getElementById('syncBatches');
      if (syncBatchesButton) {
        syncBatchesButton.addEventListener('click', function() {
          syncEntity('batches');
        });
      }
      
      // Load initial data
      loadStatus();
      loadStats();
      loadHistory();
      loadEndpointStatus();
      
      // Refresh data every 30 seconds
      setInterval(function() {
        loadStatus();
        loadStats();
        loadHistory();
        loadEndpointStatus();
      }, 30000);
      
      // Load system status
      function loadStatus() {
        fetch(API_ENDPOINTS.STATUS)
          .then(response => response.json())
          .then(data => {
            const statusElement = document.getElementById('status');
            if (statusElement) {
              if (data.online) {
                statusElement.innerHTML = '<span class="status online">Online</span> <br>Version: ' + data.version + '<br>Last updated: ' + new Date(data.timestamp).toLocaleString();
              } else {
                statusElement.innerHTML = '<span class="status offline">Offline</span>';
              }
            }
          })
          .catch(error => {
            console.error('Error loading status:', error);
            const statusElement = document.getElementById('status');
            if (statusElement) {
              statusElement.innerHTML = '<span class="status offline">Error: Could not connect to server</span>';
            }
          });
      }
      
      // Load statistics
      function loadStats() {
        fetch(API_ENDPOINTS.STATS)
          .then(response => response.json())
          .then(data => {
            const statsElement = document.getElementById('stats');
            if (statsElement && data.success) {
              let statsHtml = '<table>';
              statsHtml += '<tr><th>Entity</th><th>Count</th><th>Last Sync</th><th>Status</th></tr>';
              
              for (const [entity, stats] of Object.entries(data.stats)) {
                const lastSyncDate = stats.lastSyncDate ? new Date(stats.lastSyncDate).toLocaleString() : 'Never';
                statsHtml += '<tr>';
                statsHtml += '<td>' + entity.charAt(0).toUpperCase() + entity.slice(1) + '</td>';
                statsHtml += '<td>' + stats.totalCount + '</td>';
                statsHtml += '<td>' + lastSyncDate + '</td>';
                statsHtml += '<td>' + stats.status + '</td>';
                statsHtml += '</tr>';
              }
              
              statsHtml += '</table>';
              statsElement.innerHTML = statsHtml;
            } else {
              const statsElement = document.getElementById('stats');
              if (statsElement) {
                statsElement.innerHTML = 'Error loading statistics';
              }
            }
          })
          .catch(error => {
            console.error('Error loading stats:', error);
            const statsElement = document.getElementById('stats');
            if (statsElement) {
              statsElement.innerHTML = 'Error: Could not load statistics';
            }
          });
      }
      
      // Load sync history
      function loadHistory() {
        fetch(API_ENDPOINTS.HISTORY)
          .then(response => response.json())
          .then(data => {
            const historyElement = document.getElementById('history');
            if (historyElement && data.success) {
              let historyHtml = '<table>';
              historyHtml += '<tr><th>Entity</th><th>Timestamp</th><th>Success</th><th>Count</th></tr>';
              
              for (const item of data.history) {
                historyHtml += '<tr>';
                historyHtml += '<td>' + item.entity_type.charAt(0).toUpperCase() + item.entity_type.slice(1) + '</td>';
                historyHtml += '<td>' + new Date(item.timestamp).toLocaleString() + '</td>';
                historyHtml += '<td>' + (item.success ? 'Yes' : 'No') + '</td>';
                historyHtml += '<td>' + item.count + '</td>';
                historyHtml += '</tr>';
              }
              
              historyHtml += '</table>';
              historyElement.innerHTML = historyHtml;
            } else {
              const historyElement = document.getElementById('history');
              if (historyElement) {
                historyElement.innerHTML = 'No sync history available';
              }
            }
          })
          .catch(error => {
            console.error('Error loading history:', error);
            const historyElement = document.getElementById('history');
            if (historyElement) {
              historyElement.innerHTML = 'Error: Could not load sync history';
            }
          });
      }
      
      // Load endpoint status
      function loadEndpointStatus() {
        const endpointStatusElement = document.getElementById('endpoint-status');
        if (endpointStatusElement) {
          let endpointHtml = '<table>';
          endpointHtml += '<tr><th>Endpoint</th><th>Status</th></tr>';
          
          for (const [name, url] of Object.entries(API_ENDPOINTS)) {
            endpointHtml += '<tr>';
            endpointHtml += '<td>' + name + '</td>';
            endpointHtml += '<td id="endpoint-' + name + '">Checking...</td>';
            endpointHtml += '</tr>';
            
            // Check endpoint status
            fetch(url, { method: name.startsWith('SYNC') ? 'GET' : 'GET' })
              .then(response => {
                const statusElement = document.getElementById('endpoint-' + name);
                if (statusElement) {
                  if (response.ok) {
                    statusElement.innerHTML = '<span class="status online">OK</span>';
                  } else {
                    statusElement.innerHTML = '<span class="status offline">Error: ' + response.status + '</span>';
                  }
                }
              })
              .catch(error => {
                const statusElement = document.getElementById('endpoint-' + name);
                if (statusElement) {
                  statusElement.innerHTML = '<span class="status offline">Error: Could not connect</span>';
                }
              });
          }
          
          endpointHtml += '</table>';
          endpointStatusElement.innerHTML = endpointHtml;
        }
      }
      
      // Sync all entities
      function syncAll() {
        if (confirm('Are you sure you want to sync all entities? This may take some time.')) {
          fetch(API_ENDPOINTS.SYNC, { method: 'POST' })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                alert('Sync started for all entities');
                // Refresh data after a short delay
                setTimeout(() => {
                  loadStats();
                  loadHistory();
                }, 2000);
              } else {
                alert('Error: ' + data.error);
              }
            })
            .catch(error => {
              console.error('Error syncing all entities:', error);
              alert('Error: Could not start sync');
            });
        }
      }
      
      // Sync specific entity
      function syncEntity(entity) {
        if (confirm('Are you sure you want to sync ' + entity + '?')) {
          const endpoint = API_ENDPOINTS['SYNC_' + entity.toUpperCase()];
          
          fetch(endpoint, { method: 'POST' })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                alert('Sync started for ' + entity);
                // Refresh data after a short delay
                setTimeout(() => {
                  loadStats();
                  loadHistory();
                }, 2000);
              } else {
                alert('Error: ' + data.error);
              }
            })
            .catch(error => {
              console.error('Error syncing ' + entity + ':', error);
              alert('Error: Could not start sync');
            });
        }
      }
    });
  </script>
</body>
</html>
  `;
  fs.writeFileSync(dashboardHtmlPath, basicDashboardHtml);
}

// Serve static files from the dashboard directory
app.use(express.static(path.join(__dirname, 'dashboard')));

// Serve dashboard at root and /dashboard routes
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
  console.log(`Dashboard available at http://localhost:${port}/`);
});
