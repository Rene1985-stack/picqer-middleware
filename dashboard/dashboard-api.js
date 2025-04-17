// dashboard.js - Fixed API paths for dashboard frontend

// API endpoints
const API_BASE_URL = ''; // Empty string for relative paths from current domain
const API_ENDPOINTS = {
    status: '/api/status',
    stats: '/api/stats',
    logs: '/api/logs',
    history: '/api/history',
    email: '/api/email',
    sync: '/api/sync',
    syncEntity: (entity) => `/api/sync/${entity}`,
    retrySyncById: (syncId) => `/api/sync/retry/${syncId}`,
    test: '/api/test'
};

// DOM elements
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const syncBtn = document.getElementById('sync-btn');
const fullSyncBtn = document.getElementById('full-sync-btn');
const syncProgressBar = document.getElementById('sync-progress-bar');
const entityTabs = document.querySelectorAll('.entity-tab');
const entityContents = document.querySelectorAll('.entity-content');
const filterOptions = document.querySelectorAll('.filter-option');

// Stats elements
const totalProductsEl = document.getElementById('total-products');
const totalPicklistsEl = document.getElementById('total-picklists');
const totalWarehousesEl = document.getElementById('total-warehouses');
const totalUsersEl = document.getElementById('total-users');
const totalSuppliersEl = document.getElementById('total-suppliers');
const lastSyncEl = document.getElementById('last-sync');

// Entity-specific elements
const productsCountEl = document.getElementById('products-count');
const productsLastSyncEl = document.getElementById('products-last-sync');
const productsSyncStatusEl = document.getElementById('products-sync-status');
const productsLastSyncCountEl = document.getElementById('products-last-sync-count');
const syncProductsBtn = document.getElementById('sync-products-btn');
const fullSyncProductsBtn = document.getElementById('full-sync-products-btn');

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard initializing...');
    
    // Check middleware status
    checkStatus();
    
    // Load initial data
    fetchStats();
    fetchLogs();
    fetchHistory();
    fetchEmailSettings();
    
    // Set up refresh intervals
    setInterval(checkStatus, 30000); // Check status every 30 seconds
    setInterval(fetchStats, 60000); // Refresh stats every minute
    setInterval(fetchLogs, 10000); // Refresh logs every 10 seconds
    
    // Set up event listeners
    setupEventListeners();
});

// Check middleware status
function checkStatus() {
    console.log('Checking middleware status...');
    fetch(`${API_BASE_URL}${API_ENDPOINTS.status}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Status check failed: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Status response:', data);
            if (data.online) {
                setStatusOnline();
            } else {
                setStatusOffline();
            }
        })
        .catch(error => {
            console.error('Error checking status:', error);
            setStatusOffline();
        });
}

// Set status to online
function setStatusOnline() {
    statusIndicator.classList.remove('status-offline');
    statusIndicator.classList.add('status-online');
    statusText.textContent = 'Online';
    statusText.style.color = 'var(--success)';
}

// Set status to offline
function setStatusOffline() {
    statusIndicator.classList.remove('status-online');
    statusIndicator.classList.add('status-offline');
    statusText.textContent = 'Offline';
    statusText.style.color = 'var(--danger)';
}

// Fetch middleware stats
function fetchStats() {
    console.log('Fetching middleware stats...');
    fetch(`${API_BASE_URL}${API_ENDPOINTS.stats}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Stats fetch failed: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Stats response:', data);
            updateStats(data);
        })
        .catch(error => {
            console.error('Error fetching stats:', error);
        });
}

// Update stats in the UI
function updateStats(data) {
    // Update all entities stats
    totalProductsEl.textContent = data.totalProducts || 0;
    totalPicklistsEl.textContent = data.totalPicklists || 0;
    totalWarehousesEl.textContent = data.totalWarehouses || 0;
    totalUsersEl.textContent = data.totalUsers || 0;
    totalSuppliersEl.textContent = data.totalSuppliers || 0;
    
    // Format last sync date
    const lastSyncDate = data.lastSync ? new Date(data.lastSync) : null;
    lastSyncEl.textContent = lastSyncDate ? formatDate(lastSyncDate) : 'Never';
    
    // Update entity-specific stats if available
    if (data.entities) {
        // Products
        if (data.entities.products) {
            productsCountEl.textContent = data.entities.products.count || 0;
            productsLastSyncEl.textContent = data.entities.products.lastSync ? formatDate(new Date(data.entities.products.lastSync)) : 'Never';
            productsSyncStatusEl.textContent = data.entities.products.status || 'Ready';
            productsLastSyncCountEl.textContent = data.entities.products.lastSyncCount || 0;
        }
        
        // Add similar updates for other entities
    }
    
    // Update sync progress if a sync is running
    if (data.syncStatus === 'Running' && data.syncProgress) {
        const progress = data.syncProgress;
        const percent = progress.totalItems > 0 ? Math.round((progress.itemsProcessed / progress.totalItems) * 100) : 0;
        
        syncProgressBar.style.width = `${percent}%`;
        
        // Highlight the tab of the entity being synced
        if (progress.entityType) {
            entityTabs.forEach(tab => {
                if (tab.dataset.entity === progress.entityType) {
                    tab.classList.add('syncing');
                } else {
                    tab.classList.remove('syncing');
                }
            });
        }
    } else {
        syncProgressBar.style.width = '0%';
        entityTabs.forEach(tab => tab.classList.remove('syncing'));
    }
}

// Fetch logs
function fetchLogs() {
    console.log('Fetching logs...');
    fetch(`${API_BASE_URL}${API_ENDPOINTS.logs}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Logs fetch failed: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Logs response:', data);
            updateLogs(data.logs);
        })
        .catch(error => {
            console.error('Error fetching logs:', error);
        });
}

// Update logs in the UI
function updateLogs(logs) {
    const logContainer = document.querySelector('.log-container');
    if (!logContainer) return;
    
    logContainer.innerHTML = '';
    
    if (!logs || logs.length === 0) {
        logContainer.innerHTML = '<div class="log-entry">No logs available</div>';
        return;
    }
    
    logs.forEach(log => {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${log.level}`;
        
        const timestamp = new Date(log.timestamp);
        const formattedTime = formatTime(timestamp);
        
        logEntry.innerHTML = `[${formattedTime}] ${log.message}`;
        logContainer.appendChild(logEntry);
    });
}

// Fetch sync history
function fetchHistory() {
    console.log('Fetching sync history...');
    fetch(`${API_BASE_URL}${API_ENDPOINTS.history}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`History fetch failed: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('History response:', data);
            updateHistory(data.history);
        })
        .catch(error => {
            console.error('Error fetching history:', error);
        });
}

// Update sync history in the UI
function updateHistory(history) {
    const historyContainer = document.querySelector('.sync-history');
    if (!historyContainer) return;
    
    historyContainer.innerHTML = '';
    
    if (!history || history.length === 0) {
        historyContainer.innerHTML = '<div class="sync-item">No sync history available</div>';
        return;
    }
    
    // Get current filter
    const activeFilter = document.querySelector('.filter-option.active').dataset.filter;
    
    history.forEach(item => {
        // Apply filter
        if (activeFilter === 'success' && !item.success) return;
        if (activeFilter === 'error' && item.success) return;
        
        const syncItem = document.createElement('div');
        syncItem.className = 'sync-item';
        
        const timestamp = new Date(item.timestamp);
        const formattedTime = formatDate(timestamp);
        
        let entityType = item.entity_type.charAt(0).toUpperCase() + item.entity_type.slice(1);
        
        let statusHtml = item.success 
            ? `<span class="sync-status sync-success">Success</span>` 
            : `<span class="sync-status sync-error">Error ${item.sync_id ? `<button class="retry-btn" data-sync-id="${item.sync_id}">Retry</button>` : ''}</span>`;
        
        let countHtml = item.count ? `<span class="sync-count">${item.count}</span>` : '';
        
        syncItem.innerHTML = `
            <div>
                <div>${entityType}</div>
                <div class="sync-time">${formattedTime}</div>
            </div>
            <div>
                ${statusHtml}
                ${countHtml}
            </div>
        `;
        
        historyContainer.appendChild(syncItem);
    });
    
    // Add event listeners to retry buttons
    document.querySelectorAll('.retry-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const syncId = btn.dataset.syncId;
            retrySync(syncId);
        });
    });
}

// Fetch email settings
function fetchEmailSettings() {
    console.log('Fetching email settings...');
    fetch(`${API_BASE_URL}${API_ENDPOINTS.email}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Email settings fetch failed: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Email settings response:', data);
            updateEmailSettings(data);
        })
        .catch(error => {
            console.error('Error loading email settings:', error);
        });
}

// Update email settings in the UI
function updateEmailSettings(settings) {
    const emailInput = document.querySelector('input[type="email"]');
    const notifyErrorsCheckbox = document.getElementById('notify-errors');
    const notifySyncCheckbox = document.getElementById('notify-sync');
    
    if (emailInput) emailInput.value = settings.email || '';
    if (notifyErrorsCheckbox) notifyErrorsCheckbox.checked = settings.notifyErrors || false;
    if (notifySyncCheckbox) notifySyncCheckbox.checked = settings.notifySync || false;
}

// Start sync
function startSync(fullSync = false, entityType = null) {
    let url = `${API_BASE_URL}${API_ENDPOINTS.sync}`;
    
    if (entityType && entityType !== 'all') {
        url = `${API_BASE_URL}${API_ENDPOINTS.syncEntity(entityType)}`;
    }
    
    if (fullSync) {
        url += '?full=true';
    }
    
    console.log(`Starting ${fullSync ? 'full' : 'incremental'} sync for ${entityType || 'all entities'}...`);
    
    fetch(url, { method: 'POST' })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Sync request failed: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Sync response:', data);
            alert(data.message);
            
            // Refresh stats and history after a short delay
            setTimeout(() => {
                fetchStats();
                fetchHistory();
            }, 2000);
        })
        .catch(error => {
            console.error('Error starting sync:', error);
            alert(`Error starting sync: ${error.message}`);
        });
}

// Retry sync
function retrySync(syncId) {
    console.log(`Retrying sync with ID: ${syncId}...`);
    
    fetch(`${API_BASE_URL}${API_ENDPOINTS.retrySyncById(syncId)}`, { method: 'POST' })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Retry request failed: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Retry response:', data);
            alert(data.message);
            
            // Refresh stats and history after a short delay
            setTimeout(() => {
                fetchStats();
                fetchHistory();
            }, 2000);
        })
        .catch(error => {
            console.error('Error retrying sync:', error);
            alert(`Error retrying sync: ${error.message}`);
        });
}

// Save email settings
function saveEmailSettings() {
    const emailInput = document.querySelector('input[type="email"]');
    const notifyErrorsCheckbox = document.getElementById('notify-errors');
    const notifySyncCheckbox = document.getElementById('notify-sync');
    
    const settings = {
        email: emailInput.value,
        notifyErrors: notifyErrorsCheckbox.checked,
        notifySync: notifySyncCheckbox.checked
    };
    
    console.log('Saving email settings:', settings);
    
    fetch(`${API_BASE_URL}${API_ENDPOINTS.email}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Save settings request failed: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Save settings response:', data);
            alert('Email notification settings saved');
        })
        .catch(error => {
            console.error('Error saving email settings:', error);
            alert(`Error saving email settings: ${error.message}`);
        });
}

// Set up event listeners
function setupEventListeners() {
    // Sync buttons
    if (syncBtn) {
        syncBtn.addEventListener('click', () => {
            const activeTab = document.querySelector('.entity-tab.active');
            const entityType = activeTab.dataset.entity;
            startSync(false, entityType);
        });
    }
    
    if (fullSyncBtn) {
        fullSyncBtn.addEventListener('click', () => {
            const activeTab = document.querySelector('.entity-tab.active');
            const entityType = activeTab.dataset.entity;
            startSync(true, entityType);
        });
    }
    
    // Entity tabs
    entityTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab
            entityTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show corresponding content
            const entityType = tab.dataset.entity;
            entityContents.forEach(content => {
                if (content.id === `${entityType}-content`) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });
        });
    });
    
    // Filter options
    filterOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Update active filter
            filterOptions.forEach(o => o.classList.remove('active'));
            option.classList.add('active');
            
            // Refresh history with new filter
            fetchHistory();
        });
    });
    
    // Entity-specific sync buttons
    if (syncProductsBtn) {
        syncProductsBtn.addEventListener('click', () => {
            startSync(false, 'products');
        });
    }
    
    if (fullSyncProductsBtn) {
        fullSyncProductsBtn.addEventListener('click', () => {
            startSync(true, 'products');
        });
    }
    
    // Add similar event listeners for other entity-specific buttons
    
    // Email settings form
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            saveEmailSettings();
        });
    }
    
    // Clear logs button
    const clearLogsBtn = document.getElementById('clear-logs-btn');
    if (clearLogsBtn) {
        clearLogsBtn.addEventListener('click', () => {
            fetch(`${API_BASE_URL}${API_ENDPOINTS.logs}/clear`, { method: 'POST' })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Clear logs request failed: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    console.log('Clear logs response:', data);
                    fetchLogs();
                })
                .catch(error => {
                    console.error('Error clearing logs:', error);
                    alert(`Error clearing logs: ${error.message}`);
                });
        });
    }
}

// Helper function to format date
function formatDate(date) {
    return date.toLocaleString();
}

// Helper function to format time
function formatTime(date) {
    return date.toLocaleTimeString();
}

// Test API connection
function testApiConnection() {
    console.log('Testing API connection...');
    fetch(`${API_BASE_URL}${API_ENDPOINTS.test}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`API test failed: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('API test response:', data);
            if (data.success) {
                alert('API connection successful!');
                setStatusOnline();
            } else {
                alert(`API connection failed: ${data.message}`);
                setStatusOffline();
            }
        })
        .catch(error => {
            console.error('Error testing API connection:', error);
            alert(`Error testing API connection: ${error.message}`);
            setStatusOffline();
        });
}

// Add a global test function that can be called from the console for debugging
window.testApiConnection = testApiConnection;

// Log initialization complete
console.log('Dashboard initialization complete');
