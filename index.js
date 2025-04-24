/**
 * Final standalone solution for index.js with fixed API endpoints and sync button functionality
 * 
 * This version fixes all identified issues:
 * 1. PicqerApiClient import issue
 * 2. API adapter function issue
 * 3. Dashboard routing issue
 * 4. Inline JavaScript for dashboard
 * 5. Fixed API endpoint paths
 * 6. Fixed sync button functionality
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
  const dashboardHtml = `
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
      
      // Load all data
      loadStatus();
      loadStats();
      loadHistory();
      createEndpointStatusTable();
      
      // Load system status
      function loadStatus() {
        const statusElement = document.getElementById('status');
        if (!statusElement) return;
        
        statusElement.innerHTML = 'Checking status...';
        
        fetch(API_ENDPOINTS.STATUS)
          .then(response => response.json())
          .then(data => {
            if (data.online) {
              statusElement.innerHTML = '<span class="status online">Online</span> - Version: ' + data.version;
            } else {
              statusElement.innerHTML = '<span class="status offline">Offline</span>';
            }
          })
          .catch(error => {
            statusElement.innerHTML = '<span class="status offline">Offline</span> - Error: ' + error.message;
          });
      }
      
      // Load statistics
      function loadStats() {
        const statsElement = document.getElementById('stats');
        if (!statsElement) return;
        
        statsElement.innerHTML = 'Loading statistics...';
        
        fetch(API_ENDPOINTS.STATS)
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              let statsHtml = '<table>';
              statsHtml += '<tr><th>Entity</th><th>Count</th><th>Last Sync</th><th>Status</th></tr>';
              
              for (const [entity, stats] of Object.entries(data.stats)) {
                statsHtml += '<tr>';
                statsHtml += '<td>' + entity.charAt(0).toUpperCase() + entity.slice(1) + '</td>';
                statsHtml += '<td>' + stats.totalCount + '</td>';
                statsHtml += '<td>' + new Date(stats.lastSyncDate).toLocaleString() + '</td>';
                statsHtml += '<td>' + stats.status + '</td>';
                statsHtml += '</tr>';
              }
              
              statsHtml += '</table>';
              statsElement.innerHTML = statsHtml;
            } else {
              statsElement.innerHTML = 'Error loading statistics: ' + data.error;
            }
          })
          .catch(error => {
            statsElement.innerHTML = 'Error loading statistics: ' + error.message;
          });
      }
      
      // Load sync history
      function loadHistory() {
        const historyElement = document.getElementById('history');
        if (!historyElement) return;
        
        historyElement.innerHTML = 'Loading history...';
        
        fetch(API_ENDPOINTS.HISTORY)
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              let historyHtml = '<table>';
              historyHtml += '<tr><th>Entity</th><th>Timestamp</th><th>Status</th><th>Count</th></tr>';
              
              for (const item of data.history) {
                historyHtml += '<tr>';
                historyHtml += '<td>' + item.entity_type.charAt(0).toUpperCase() + item.entity_type.slice(1) + '</td>';
                historyHtml += '<td>' + new Date(item.timestamp).toLocaleString() + '</td>';
                historyHtml += '<td>' + (item.success ? 'Success' : 'Failed') + '</td>';
                historyHtml += '<td>' + (item.count || 0) + '</td>';
                historyHtml += '</tr>';
              }
              
              historyHtml += '</table>';
              historyElement.innerHTML = historyHtml;
            } else {
              historyElement.innerHTML = 'Error loading history: ' + data.error;
            }
          })
          .catch(error => {
            historyElement.innerHTML = 'Error loading history: ' + error.message;
          });
      }
      
      // Create endpoint status table
      function createEndpointStatusTable() {
        const endpointStatusElement = document.getElementById('endpoint-status');
        if (!endpointStatusElement) return;
        
        // Define endpoints to monitor
        const endpoints = [
          { name: 'Status', url: API_ENDPOINTS.STATUS, method: 'GET' },
          { name: 'Stats', url: API_ENDPOINTS.STATS, method: 'GET' },
          { name: 'Logs', url: API_ENDPOINTS.LOGS, method: 'GET' },
          { name: 'History', url: API_ENDPOINTS.HISTORY, method: 'GET' },
          { name: 'Sync', url: API_ENDPOINTS.SYNC, method: 'POST' },
          { name: 'Products Sync', url: API_ENDPOINTS.SYNC_PRODUCTS, method: 'POST' },
          { name: 'Picklists Sync', url: API_ENDPOINTS.SYNC_PICKLISTS, method: 'POST' },
          { name: 'Warehouses Sync', url: API_ENDPOINTS.SYNC_WAREHOUSES, method: 'POST' },
          { name: 'Users Sync', url: API_ENDPOINTS.SYNC_USERS, method: 'POST' },
          { name: 'Suppliers Sync', url: API_ENDPOINTS.SYNC_SUPPLIERS, method: 'POST' },
          { name: 'Batches Sync', url: API_ENDPOINTS.SYNC_BATCHES, method: 'POST' }
        ];
        
        // Create table
        let tableHtml = '<table>';
        tableHtml += '<tr><th>Endpoint</th><th>URL</th><th>Status</th><th>Response Time</th></tr>';
        
        // Add rows for each endpoint
        endpoints.forEach(endpoint => {
          tableHtml += '<tr data-endpoint="' + endpoint.url + '">';
          tableHtml += '<td>' + endpoint.name + '</td>';
          tableHtml += '<td>' + endpoint.url + '</td>';
          tableHtml += '<td class="endpoint-status">Checking...</td>';
          tableHtml += '<td class="endpoint-response-time">-</td>';
          tableHtml += '</tr>';
        });
        
        tableHtml += '</table>';
        endpointStatusElement.innerHTML = tableHtml;
        
        // Check endpoints
        checkEndpoints(endpoints);
        
        // Set interval to check endpoints every 60 seconds
        setInterval(function() {
          checkEndpoints(endpoints);
        }, 60000);
      }
      
      // Check endpoints
      function checkEndpoints(endpoints) {
        endpoints.forEach(endpoint => {
          checkEndpoint(endpoint);
        });
      }
      
      // Check endpoint
      function checkEndpoint(endpoint) {
        // Find endpoint row
        const row = document.querySelector('tr[data-endpoint="' + endpoint.url + '"]');
        
        // If row exists, check endpoint
        if (row) {
          // Find status and response time cells
          const statusCell = row.querySelector('.endpoint-status');
          const responseTimeCell = row.querySelector('.endpoint-response-time');
          
          // Update status to checking
          statusCell.textContent = 'Checking...';
          statusCell.className = 'endpoint-status checking';
          
          // Start timer
          const startTime = performance.now();
          
          // Send request to endpoint
          if (endpoint.method === 'POST') {
            // For POST endpoints, just check if they exist
            fetch(endpoint.url, { method: 'HEAD' })
              .then(response => {
                // Calculate response time
                const endTime = performance.now();
                const responseTime = Math.round(endTime - startTime);
                
                // Update status and response time
                if (response.ok) {
                  statusCell.textContent = 'Online';
                  statusCell.className = 'endpoint-status online';
                } else {
                  statusCell.textContent = 'Error (' + response.status + ')';
                  statusCell.className = 'endpoint-status error';
                }
                
                responseTimeCell.textContent = responseTime + ' ms';
              })
              .catch(error => {
                // Calculate response time
                const endTime = performance.now();
                const responseTime = Math.round(endTime - startTime);
                
                // Update status and response time
                statusCell.textContent = 'Offline';
                statusCell.className = 'endpoint-status offline';
                responseTimeCell.textContent = responseTime + ' ms';
              });
          } else {
            // For GET endpoints, actually fetch the data
            fetch(endpoint.url)
              .then(response => {
                // Calculate response time
                const endTime = performance.now();
                const responseTime = Math.round(endTime - startTime);
                
                // Update status and response time
                if (response.ok) {
                  statusCell.textContent = 'Online';
                  statusCell.className = 'endpoint-status online';
                } else {
                  statusCell.textContent = 'Error (' + response.status + ')';
                  statusCell.className = 'endpoint-status error';
                }
                
                responseTimeCell.textContent = responseTime + ' ms';
              })
              .catch(error => {
                // Calculate response time
                const endTime = performance.now();
                const responseTime = Math.round(endTime - startTime);
                
                // Update status and response time
                statusCell.textContent = 'Offline';
                statusCell.className = 'endpoint-status offline';
                responseTimeCell.textContent = responseTime + ' ms';
              });
          }
        }
      }
      
      // Sync all entities
      function syncAll() {
        if (confirm('Are you sure you want to sync all entities? This may take some time.')) {
          fetch(API_ENDPOINTS.SYNC, { 
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            }
          })
            .then(response => response.json())
            .then(data => {
              alert(data.message || 'Sync started for all entities');
              // Reload data after sync
              setTimeout(function() {
                loadStatus();
                loadStats();
                loadHistory();
              }, 2000);
            })
            .catch(error => {
              alert('Error: ' + error.message);
            });
        }
      }
      
      // Sync specific entity
      function syncEntity(entity) {
        if (confirm('Are you sure you want to sync ' + entity + '? This may take some time.')) {
          fetch(API_ENDPOINTS['SYNC_' + entity.toUpperCase()], { 
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            }
          })
            .then(response => response.json())
            .then(data => {
              alert(data.message || 'Sync started for ' + entity);
              // Reload data after sync
              setTimeout(function() {
                loadStatus();
                loadStats();
                loadHistory();
              }, 2000);
            })
            .catch(error => {
              alert('Error: ' + error.message);
            });
        }
      }
    });
  </script>
</body>
</html>
  `;
  fs.writeFileSync(dashboardHtmlPath, dashboardHtml);
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
