/**
 * Dashboard API JavaScript for Picqer Middleware
 * This file provides the API interaction functionality for the dashboard
 * 
 * UPDATED: Enhanced to support identity column handling and improved metrics display
 */

// Use the API URL Helper for consistent endpoint access
document.addEventListener('DOMContentLoaded', function() {
  if (!window.API_URLS) {
    console.warn('API_URLS not found. Loading fallback endpoints.');
    // Fallback API endpoints if api-url-helper.js is not included
    window.API_URLS = {
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
      SYNC_BATCHES: '/api/sync/batches',
      getFullSyncUrl: (endpoint) => `${endpoint}?full=true`
    };
  }
});

// Dashboard API class
class DashboardAPI {
  constructor() {
    this.baseUrl = '';
    this.statusElement = document.getElementById('status');
    this.statsElement = document.getElementById('stats');
    this.historyElement = document.getElementById('history');
    this.logsElement = document.getElementById('logs');
    
    // Initialize event listeners
    this.initEventListeners();
    
    // Load initial data
    this.loadAllData();
  }
  
  // Initialize event listeners for sync buttons
  initEventListeners() {
    // Main sync buttons
    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
      syncBtn.addEventListener('click', () => this.syncAll());
      syncBtn.setAttribute('data-has-click-listener', 'true');
    }
    
    const fullSyncBtn = document.getElementById('full-sync-btn');
    if (fullSyncBtn) {
      fullSyncBtn.addEventListener('click', () => this.syncAll(true));
      fullSyncBtn.setAttribute('data-has-click-listener', 'true');
    }
    
    // Entity-specific sync buttons
    this.setupEntitySyncButton('products');
    this.setupEntitySyncButton('picklists');
    this.setupEntitySyncButton('warehouses');
    this.setupEntitySyncButton('users');
    this.setupEntitySyncButton('suppliers');
    this.setupEntitySyncButton('batches');
    
    // Add refresh button event listener if it exists
    const refreshButton = document.getElementById('refreshData');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => this.loadAllData());
    }
    
    // BACKWARD COMPATIBILITY: Also handle old button IDs
    const oldSyncAll = document.getElementById('syncAll');
    if (oldSyncAll) {
      oldSyncAll.addEventListener('click', () => this.syncAll());
    }
    
    const oldSyncProducts = document.getElementById('syncProducts');
    if (oldSyncProducts) {
      oldSyncProducts.addEventListener('click', () => this.syncEntity('products'));
    }
    
    const oldSyncPicklists = document.getElementById('syncPicklists');
    if (oldSyncPicklists) {
      oldSyncPicklists.addEventListener('click', () => this.syncEntity('picklists'));
    }
    
    const oldSyncWarehouses = document.getElementById('syncWarehouses');
    if (oldSyncWarehouses) {
      oldSyncWarehouses.addEventListener('click', () => this.syncEntity('warehouses'));
    }
    
    const oldSyncUsers = document.getElementById('syncUsers');
    if (oldSyncUsers) {
      oldSyncUsers.addEventListener('click', () => this.syncEntity('users'));
    }
    
    const oldSyncSuppliers = document.getElementById('syncSuppliers');
    if (oldSyncSuppliers) {
      oldSyncSuppliers.addEventListener('click', () => this.syncEntity('suppliers'));
    }
    
    const oldSyncBatches = document.getElementById('syncBatches');
    if (oldSyncBatches) {
      oldSyncBatches.addEventListener('click', () => this.syncEntity('batches'));
    }
  }
  
  // Setup entity sync button
  setupEntitySyncButton(entity) {
    // Regular sync button
    const syncEntityBtn = document.getElementById(`sync-${entity}-btn`);
    if (syncEntityBtn) {
      syncEntityBtn.addEventListener('click', () => this.syncEntity(entity));
      syncEntityBtn.setAttribute('data-has-click-listener', 'true');
    }
    
    // Full sync button
    const fullSyncEntityBtn = document.getElementById(`full-sync-${entity}-btn`);
    if (fullSyncEntityBtn) {
      fullSyncEntityBtn.addEventListener('click', () => this.syncEntity(entity, true));
      fullSyncEntityBtn.setAttribute('data-has-click-listener', 'true');
    }
  }
  
  // Load all dashboard data
  loadAllData() {
    this.loadStatus();
    this.loadStats();
    this.loadHistory();
    this.loadLogs();
  }
  
  // Load system status
  loadStatus() {
    if (!this.statusElement) return;
    
    this.statusElement.innerHTML = 'Checking status...';
    
    fetch(window.API_URLS.STATUS)
      .then(response => response.json())
      .then(data => {
        if (data.online) {
          this.statusElement.innerHTML = '<span class="status online">Online</span> - Version: ' + data.version;
        } else {
          this.statusElement.innerHTML = '<span class="status offline">Offline</span>';
        }
      })
      .catch(error => {
        this.statusElement.innerHTML = '<span class="status offline">Offline</span> - Error: ' + error.message;
      });
  }
  
  // Load statistics
  loadStats() {
    if (!this.statsElement) return;
    
    this.statsElement.innerHTML = 'Loading statistics...';
    
    fetch(window.API_URLS.STATS)
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          let statsHtml = '<table>';
          statsHtml += '<tr><th>Entity</th><th>Count</th><th>Last Sync</th><th>Status</th></tr>';
          
          for (const [entity, stats] of Object.entries(data.stats)) {
            statsHtml += '<tr>';
            statsHtml += '<td>' + entity.charAt(0).toUpperCase() + entity.slice(1) + '</td>';
            statsHtml += '<td>' + stats.totalCount + '</td>';
            statsHtml += '<td>' + (stats.lastSyncDate ? new Date(stats.lastSyncDate).toLocaleString() : 'Never') + '</td>';
            statsHtml += '<td>' + stats.status + '</td>';
            statsHtml += '</tr>';
          }
          
          statsHtml += '</table>';
          this.statsElement.innerHTML = statsHtml;
        } else {
          this.statsElement.innerHTML = 'Error loading statistics: ' + data.error;
        }
      })
      .catch(error => {
        this.statsElement.innerHTML = 'Error loading statistics: ' + error.message;
      });
  }
  
  // Load sync history
  loadHistory() {
    if (!this.historyElement) return;
    
    this.historyElement.innerHTML = 'Loading history...';
    
    fetch(window.API_URLS.HISTORY)
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
          this.historyElement.innerHTML = historyHtml;
        } else {
          this.historyElement.innerHTML = 'Error loading history: ' + data.error;
        }
      })
      .catch(error => {
        this.historyElement.innerHTML = 'Error loading history: ' + error.message;
      });
  }
  
  // Load logs
  loadLogs() {
    if (!this.logsElement) return;
    
    this.logsElement.innerHTML = 'Loading logs...';
    
    fetch(window.API_URLS.LOGS)
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          let logsHtml = '<table>';
          logsHtml += '<tr><th>Level</th><th>Message</th><th>Timestamp</th></tr>';
          
          for (const log of data.logs) {
            logsHtml += '<tr>';
            logsHtml += '<td>' + log.level + '</td>';
            logsHtml += '<td>' + log.message + '</td>';
            logsHtml += '<td>' + new Date(log.timestamp).toLocaleString() + '</td>';
            logsHtml += '</tr>';
          }
          
          logsHtml += '</table>';
          this.logsElement.innerHTML = logsHtml;
        } else {
          this.logsElement.innerHTML = 'Error loading logs: ' + data.error;
        }
      })
      .catch(error => {
        this.logsElement.innerHTML = 'Error loading logs: ' + error.message;
      });
  }
  
  // Sync all entities
  syncAll(fullSync = false) {
    const url = fullSync ? window.API_URLS.getFullSyncUrl(window.API_URLS.SYNC) : window.API_URLS.SYNC;
    
    fetch(url, { method: 'POST' })
      .then(response => response.json())
      .then(data => {
        // Show more detailed message if available
        const message = data.message || 'Sync started';
        const details = data.details ? `\n\nDetails: ${data.details}` : '';
        alert(message + details);
        
        // Reload data after sync
        setTimeout(() => this.loadAllData(), 2000);
      })
      .catch(error => {
        alert('Error: ' + error.message);
      });
  }
  
  // Sync specific entity
  syncEntity(entity, fullSync = false) {
    const endpoint = `SYNC_${entity.toUpperCase()}`;
    const url = fullSync 
      ? window.API_URLS.getFullSyncUrl(window.API_URLS[endpoint]) 
      : window.API_URLS[endpoint];
    
    fetch(url, { method: 'POST' })
      .then(response => response.json())
      .then(data => {
        // Show more detailed message if available
        const message = data.message || `${entity} sync started`;
        const details = data.details ? `\n\nDetails: ${data.details}` : '';
        alert(message + details);
        
        // Reload data after sync
        setTimeout(() => this.loadAllData(), 2000);
      })
      .catch(error => {
        alert('Error: ' + error.message);
      });
  }
}

// Initialize dashboard API when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.dashboardAPI = new DashboardAPI();
});
