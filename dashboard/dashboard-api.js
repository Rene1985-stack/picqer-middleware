/**
 * Dashboard API JavaScript for Picqer Middleware
 * This file provides the API interaction functionality for the dashboard
 */

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
    document.getElementById('syncAll').addEventListener('click', () => this.syncAll());
    document.getElementById('syncProducts').addEventListener('click', () => this.syncEntity('products'));
    document.getElementById('syncPicklists').addEventListener('click', () => this.syncEntity('picklists'));
    document.getElementById('syncWarehouses').addEventListener('click', () => this.syncEntity('warehouses'));
    document.getElementById('syncUsers').addEventListener('click', () => this.syncEntity('users'));
    document.getElementById('syncSuppliers').addEventListener('click', () => this.syncEntity('suppliers'));
    document.getElementById('syncBatches').addEventListener('click', () => this.syncEntity('batches'));
    
    // Add refresh button event listener if it exists
    const refreshButton = document.getElementById('refreshData');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => this.loadAllData());
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
    
    fetch(API_ENDPOINTS.STATUS)
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
    
    fetch(API_ENDPOINTS.LOGS)
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
  syncAll() {
    fetch(API_ENDPOINTS.SYNC, { method: 'POST' })
      .then(response => response.json())
      .then(data => {
        alert(data.message);
        // Reload data after sync
        setTimeout(() => this.loadAllData(), 2000);
      })
      .catch(error => {
        alert('Error: ' + error.message);
      });
  }
  
  // Sync specific entity
  syncEntity(entity) {
    fetch(`${API_ENDPOINTS.SYNC}/${entity}`, { method: 'POST' })
      .then(response => response.json())
      .then(data => {
        alert(data.message);
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
