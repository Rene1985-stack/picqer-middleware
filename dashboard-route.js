/**
 * Dashboard Route for Picqer Middleware with Embedded HTML
 * Serves the dashboard HTML directly from the route handler
 */
const express = require('express');
const router = express.Router();

// Debug middleware to log requests
router.use((req, res, next) => {
  console.log(`Dashboard request: ${req.path}`);
  next();
});

// Serve the dashboard HTML directly from the route handler
router.get('/', (req, res) => {
  console.log('Serving embedded dashboard HTML');
  
  // Send the HTML directly
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Skapa Picqer <-> SQL Middleware</title>
    <!-- Chart.js library -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        /* CSS styles */
        :root {
            --primary: #00c853; /* Skapa green */
            --primary-light: #5efc82;
            --primary-dark: #009624;
            --secondary: #002654; /* Skapa dark blue */
            --secondary-light: #335781;
            --secondary-dark: #00002c;
            --accent: #4fc3f7; /* Light blue accent */
            --success: #28a745;
            --warning: #ffc107;
            --danger: #dc3545;
            --light: #f8f9fa;
            --dark: #002654;
            --gray: #6c757d;
            --light-gray: #e9ecef;
            --white: #ffffff;
        }
        
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        body {
            background-color: #f5f5f5;
            color: var(--secondary);
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--light-gray);
        }
        
        .logo {
            display: flex;
            align-items: center;
        }
        
        .logo h1 {
            font-size: 24px;
            color: var(--secondary);
            font-weight: 700;
        }
        
        .logo span {
            color: var(--primary);
        }
        
        .status {
            display: flex;
            align-items: center;
            font-weight: 500;
        }
        
        .status-indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        
        .status-online {
            background-color: var(--primary);
        }
        
        .status-offline {
            background-color: var(--danger);
        }
        
        .dashboard-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        
        @media (max-width: 768px) {
            .dashboard-grid {
                grid-template-columns: 1fr;
            }
        }
        
        .card {
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
            padding: 20px;
            margin-bottom: 20px;
            border-top: 4px solid var(--primary);
        }
        
        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 1px solid var(--light-gray);
        }
        
        .card-title {
            font-size: 18px;
            font-weight: 600;
            color: var(--secondary);
        }
        
        .card-actions {
            display: flex;
            gap: 10px;
        }
        
        .btn {
            padding: 8px 16px;
            border-radius: 4px;
            border: none;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .btn-primary {
            background-color: var(--primary);
            color: white;
        }
        
        .btn-primary:hover {
            background-color: var(--primary-dark);
        }
        
        .btn-outline {
            background-color: transparent;
            border: 1px solid var(--primary);
            color: var(--primary);
        }
        
        .btn-outline:hover {
            background-color: var(--primary);
            color: white;
        }
        
        .btn-danger {
            background-color: var(--danger);
            color: white;
        }
        
        .btn-danger:hover {
            background-color: #bd2130;
        }
        
        .log-container {
            height: 300px;
            overflow-y: auto;
            background-color: var(--secondary);
            border-radius: 4px;
            padding: 10px;
            font-family: monospace;
            font-size: 14px;
            color: var(--light);
        }
        
        .log-entry {
            margin-bottom: 5px;
            padding: 5px;
            border-radius: 3px;
        }
        
        .log-info {
            color: var(--accent);
        }
        
        .log-success {
            color: var(--primary);
        }
        
        .log-warning {
            color: var(--warning);
        }
        
        .log-error {
            color: var(--danger);
            font-weight: bold;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
        }
        
        .stat-card {
            background-color: var(--light-gray);
            border-radius: 6px;
            padding: 15px;
            text-align: center;
        }
        
        .stat-value {
            font-size: 24px;
            font-weight: 700;
            color: var(--primary);
            margin-bottom: 5px;
        }
        
        .stat-label {
            font-size: 14px;
            color: var(--secondary);
            font-weight: 500;
        }
        
        .sync-history {
            list-style: none;
        }
        
        .sync-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid var(--light-gray);
        }
        
        .sync-item:last-child {
            border-bottom: none;
        }
        
        .sync-time {
            font-size: 14px;
            color: var(--gray);
        }
        
        .sync-status {
            display: flex;
            align-items: center;
            font-size: 14px;
            font-weight: 500;
        }
        
        .sync-success {
            color: var(--success);
        }
        
        .sync-error {
            color: var(--danger);
        }
        
        .sync-count {
            background-color: var(--light-gray);
            border-radius: 20px;
            padding: 2px 8px;
            margin-left: 8px;
            font-size: 12px;
            color: var(--secondary);
        }
        
        footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid var(--light-gray);
            color: var(--gray);
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="logo">
                <h1>Skapa <span>Picqer</span> Middleware</h1>
            </div>
            <div class="status" id="status">
                <div class="status-indicator status-offline"></div>
                Checking status...
            </div>
        </header>
        
        <div class="dashboard-grid">
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">Data Synchronization</h2>
                    <div class="card-actions">
                        <button id="syncAll" class="btn btn-primary">Sync All</button>
                    </div>
                </div>
                <div class="entity-tabs">
                    <div class="entity-tab active" data-entity="product">Products</div>
                    <div class="entity-tab" data-entity="warehouse">Warehouses</div>
                    <div class="entity-tab" data-entity="picklist">Picklists</div>
                    <div class="entity-tab" data-entity="batch">Batches</div>
                    <div class="entity-tab" data-entity="user">Users</div>
                    <div class="entity-tab" data-entity="supplier">Suppliers</div>
                </div>
                <div class="entity-content active" id="product-content">
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-value" id="product-count">-</div>
                            <div class="stat-label">Products</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value" id="product-last-sync">-</div>
                            <div class="stat-label">Last Sync</div>
                        </div>
                    </div>
                    <div class="card-actions" style="margin-top: 15px;">
                        <button class="btn btn-outline sync-entity-btn" data-entity="product">Sync Products</button>
                    </div>
                </div>
                <!-- Other entity content divs would go here -->
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">Sync Logs</h2>
                    <div class="card-actions">
                        <button id="clearLogs" class="btn btn-outline">Clear</button>
                    </div>
                </div>
                <div class="log-container" id="logContainer">
                    <div class="log-entry log-info">Dashboard initialized. Ready to sync data.</div>
                </div>
            </div>
        </div>
        
        <div class="card">
            <div class="card-header">
                <h2 class="card-title">Recent Synchronizations</h2>
            </div>
            <ul class="sync-history" id="syncHistory">
                <!-- Sync history will be populated here -->
                <li class="sync-item">
                    <div>
                        <strong>All Entities</strong>
                        <span class="sync-time">Loading history...</span>
                    </div>
                    <div class="sync-status">
                        <span>Checking...</span>
                    </div>
                </li>
            </ul>
        </div>
        
        <footer>
            <p>Skapa Picqer Middleware &copy; 2025 | Version 2.0.0</p>
        </footer>
    </div>

    <script>
        // Base API URL
        const API_BASE_URL = window.location.origin;
        
        // DOM Elements
        const statusIndicator = document.querySelector('.status-indicator');
        const statusText = document.querySelector('#status');
        const syncAllBtn = document.querySelector('#syncAll');
        const clearLogsBtn = document.querySelector('#clearLogs');
        const logContainer = document.querySelector('#logContainer');
        const syncHistory = document.querySelector('#syncHistory');
        const entityTabs = document.querySelectorAll('.entity-tab');
        const entityContents = document.querySelectorAll('.entity-content');
        const syncEntityBtns = document.querySelectorAll('.sync-entity-btn');
        
        // Entity-specific elements
        const productCount = document.querySelector('#product-count');
        const productLastSync = document.querySelector('#product-last-sync');
        
        // Check API status
        async function checkApiStatus() {
            try {
                const response = await fetch(API_BASE_URL);
                const data = await response.json();
                
                if (data && data.message) {
                    statusIndicator.classList.remove('status-offline');
                    statusIndicator.classList.add('status-online');
                    statusText.innerHTML = '<div class="status-indicator status-online"></div>API Online';
                    
                    addLogEntry('API connection established', 'success');
                    loadSyncStatus();
                }
            } catch (error) {
                statusIndicator.classList.remove('status-online');
                statusIndicator.classList.add('status-offline');
                statusText.innerHTML = '<div class="status-indicator status-offline"></div>API Offline';
                
                addLogEntry('Failed to connect to API: ' + error.message, 'error');
            }
        }
        
        // Load sync status for all entities
        async function loadSyncStatus() {
            try {
                const response = await fetch(`${API_BASE_URL}/api/sync/status`);
                const data = await response.json();
                
                if (data) {
                    // Update product stats
                    if (data.product) {
                        productCount.textContent = data.product.count || 0;
                        productLastSync.textContent = formatDate(data.product.lastSync);
                    }
                    
                    // Update sync history
                    syncHistory.innerHTML = '';
                    
                    for (const [entity, info] of Object.entries(data)) {
                        const listItem = document.createElement('li');
                        listItem.className = 'sync-item';
                        
                        const entityName = entity.charAt(0).toUpperCase() + entity.slice(1);
                        const syncTime = formatDate(info.lastSync);
                        
                        listItem.innerHTML = `
                            <div>
                                <strong>${entityName}</strong>
                                <span class="sync-time">${syncTime}</span>
                            </div>
                            <div class="sync-status">
                                <span class="sync-success">Synced</span>
                                <span class="sync-count">${info.count || 0}</span>
                            </div>
                        `;
                        
                        syncHistory.appendChild(listItem);
                    }
                    
                    addLogEntry('Sync status loaded successfully', 'info');
                }
            } catch (error) {
                addLogEntry('Failed to load sync status: ' + error.message, 'error');
            }
        }
        
        // Sync all entities
        async function syncAll() {
            syncAllBtn.disabled = true;
            syncAllBtn.textContent = 'Syncing...';
            
            addLogEntry('Starting sync for all entities...', 'info');
            
            try {
                const response = await fetch(`${API_BASE_URL}/api/sync/all`, {
                    method: 'POST'
                });
                
                const data = await response.json();
                
                if (data.success) {
                    addLogEntry('All entities synced successfully', 'success');
                } else {
                    addLogEntry('Sync completed with issues: ' + data.message, 'warning');
                }
                
                // Reload sync status
                loadSyncStatus();
            } catch (error) {
                addLogEntry('Failed to sync all entities: ' + error.message, 'error');
            } finally {
                syncAllBtn.disabled = false;
                syncAllBtn.textContent = 'Sync All';
            }
        }
        
        // Sync specific entity
        async function syncEntity(entityType) {
            const button = document.querySelector(`.sync-entity-btn[data-entity="${entityType}"]`);
            
            if (button) {
                button.disabled = true;
                button.textContent = 'Syncing...';
            }
            
            addLogEntry(`Starting sync for ${entityType}...`, 'info');
            
            try {
                const response = await fetch(`${API_BASE_URL}/api/sync/${entityType}`, {
                    method: 'POST'
                });
                
                const data = await response.json();
                
                if (data.success) {
                    addLogEntry(`${entityType} synced successfully`, 'success');
                } else {
                    addLogEntry(`${entityType} sync completed with issues: ${data.message}`, 'warning');
                }
                
                // Reload sync status
                loadSyncStatus();
            } catch (error) {
                addLogEntry(`Failed to sync ${entityType}: ${error.message}`, 'error');
            } finally {
                if (button) {
                    button.disabled = false;
                    button.textContent = `Sync ${entityType.charAt(0).toUpperCase() + entityType.slice(1)}`;
                }
            }
        }
        
        // Add log entry
        function addLogEntry(message, type = 'info') {
            const entry = document.createElement('div');
            entry.className = `log-entry log-${type}`;
            
            const timestamp = new Date().toLocaleTimeString();
            entry.textContent = `[${timestamp}] ${message}`;
            
            logContainer.appendChild(entry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
        
        // Format date
        function formatDate(dateString) {
            if (!dateString) return 'Never';
            
            const date = new Date(dateString);
            
            if (isNaN(date.getTime())) {
                return dateString;
            }
            
            return date.toLocaleString();
        }
        
        // Clear logs
        function clearLogs() {
            logContainer.innerHTML = '';
            addLogEntry('Logs cleared', 'info');
        }
        
        // Switch entity tab
        function switchEntityTab(event) {
            const entityType = event.target.getAttribute('data-entity');
            
            // Update active tab
            entityTabs.forEach(tab => {
                tab.classList.remove('active');
            });
            event.target.classList.add('active');
            
            // Update active content
            entityContents.forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${entityType}-content`)?.classList.add('active');
        }
        
        // Event Listeners
        syncAllBtn.addEventListener('click', syncAll);
        clearLogsBtn.addEventListener('click', clearLogs);
        
        entityTabs.forEach(tab => {
            tab.addEventListener('click', switchEntityTab);
        });
        
        syncEntityBtns.forEach(button => {
            button.addEventListener('click', () => {
                const entityType = button.getAttribute('data-entity');
                syncEntity(entityType);
            });
        });
        
        // Initialize
        checkApiStatus();
        
        // Check status periodically
        setInterval(checkApiStatus, 60000); // Every minute
    </script>
</body>
</html>
  `);
});

// Serve embedded JavaScript files
router.get('/dashboard.js', (req, res) => {
  console.log('Serving embedded dashboard.js');
  
  res.set('Content-Type', 'application/javascript');
  res.send(`
    // This file is intentionally empty as all JavaScript is embedded in the HTML
    console.log('Dashboard.js loaded');
  `);
});

module.exports = router;
