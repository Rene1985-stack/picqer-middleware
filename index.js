/**
 * Final fix for index.js with proper imports, API adapter initialization, and dashboard routing
 * 
 * This version fixes all identified issues:
 * 1. PicqerApiClient import issue
 * 2. API adapter function issue
 * 3. Dashboard routing issue
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

// Serve static files from the dashboard directory
app.use(express.static(path.join(__dirname, 'dashboard')));

// FIX: Create dashboard directory if it doesn't exist
const dashboardDir = path.join(__dirname, 'dashboard');
if (!fs.existsSync(dashboardDir)) {
  console.log('Creating dashboard directory');
  fs.mkdirSync(dashboardDir, { recursive: true });
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
  </div>

  <script>
    // Check system status
    fetch('/api/status')
      .then(response => response.json())
      .then(data => {
        const statusDiv = document.getElementById('status');
        if (data.online) {
          statusDiv.innerHTML = '<span class="status online">Online</span> - Version: ' + data.version;
        } else {
          statusDiv.innerHTML = '<span class="status offline">Offline</span>';
        }
      })
      .catch(error => {
        document.getElementById('status').innerHTML = '<span class="status offline">Offline</span> - Error: ' + error.message;
      });
    
    // Load statistics
    fetch('/api/stats')
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
          document.getElementById('stats').innerHTML = statsHtml;
        } else {
          document.getElementById('stats').innerHTML = 'Error loading statistics: ' + data.error;
        }
      })
      .catch(error => {
        document.getElementById('stats').innerHTML = 'Error loading statistics: ' + error.message;
      });
    
    // Load sync history
    fetch('/api/history')
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
          document.getElementById('history').innerHTML = historyHtml;
        } else {
          document.getElementById('history').innerHTML = 'Error loading history: ' + data.error;
        }
      })
      .catch(error => {
        document.getElementById('history').innerHTML = 'Error loading history: ' + error.message;
      });
    
    // Sync button event listeners
    document.getElementById('syncAll').addEventListener('click', () => {
      fetch('/api/sync', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
          alert(data.message);
        })
        .catch(error => {
          alert('Error: ' + error.message);
        });
    });
    
    document.getElementById('syncProducts').addEventListener('click', () => {
      fetch('/api/sync/products', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
          alert(data.message);
        })
        .catch(error => {
          alert('Error: ' + error.message);
        });
    });
    
    document.getElementById('syncPicklists').addEventListener('click', () => {
      fetch('/api/sync/picklists', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
          alert(data.message);
        })
        .catch(error => {
          alert('Error: ' + error.message);
        });
    });
    
    document.getElementById('syncWarehouses').addEventListener('click', () => {
      fetch('/api/sync/warehouses', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
          alert(data.message);
        })
        .catch(error => {
          alert('Error: ' + error.message);
        });
    });
    
    document.getElementById('syncUsers').addEventListener('click', () => {
      fetch('/api/sync/users', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
          alert(data.message);
        })
        .catch(error => {
          alert('Error: ' + error.message);
        });
    });
    
    document.getElementById('syncSuppliers').addEventListener('click', () => {
      fetch('/api/sync/suppliers', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
          alert(data.message);
        })
        .catch(error => {
          alert('Error: ' + error.message);
        });
    });
    
    document.getElementById('syncBatches').addEventListener('click', () => {
      fetch('/api/sync/batches', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
          alert(data.message);
        })
        .catch(error => {
          alert('Error: ' + error.message);
        });
    });
  </script>
</body>
</html>
  `;
  fs.writeFileSync(dashboardHtmlPath, basicDashboardHtml);
}

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
