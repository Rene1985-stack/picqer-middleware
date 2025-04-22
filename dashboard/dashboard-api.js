/**
 * Fixed Dashboard API Adapter
 * 
 * This file fixes the data handling issues in the dashboard by properly
 * handling the API response formats and adds event listeners for sync buttons.
 */

// API endpoints definition
const ENDPOINTS = {
    status: '/api/status',
    stats: '/api/stats',
    logs: '/api/logs',
    history: '/api/history',
    sync: '/api/sync',
    fullSync: '/api/sync?full=true',
    syncEntity: (entityType, fullSync = false) => `/api/sync/${entityType}${fullSync ? '?full=true' : ''}`,
    retrySync: (syncId) => `/api/sync/retry/${syncId}`,
    email: '/api/email',
    clearLogs: '/api/logs/clear',
    test: '/api/test',
    // Batch-related endpoints
    batches: '/api/batches',
    batchStats: '/api/batches/stats',
    batchMetrics: '/api/batches/metrics',
    batchProductivity: '/api/batches/productivity',
    syncBatches: '/api/sync/batches',
    fullSyncBatches: '/api/sync/batches?full=true'
};

// Initialize dashboard with improved error handling
document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard initializing with improved error handling...');
    
    // Elements
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const syncBtn = document.getElementById('sync-btn');
    const fullSyncBtn = document.getElementById('full-sync-btn');
    const clearLogsBtn = document.getElementById('clear-logs-btn');
    const logContainer = document.getElementById('log-container');
    const totalProducts = document.getElementById('total-products');
    const totalPicklists = document.getElementById('total-picklists');
    const totalWarehouses = document.getElementById('total-warehouses');
    const totalUsers = document.getElementById('total-users');
    const totalSuppliers = document.getElementById('total-suppliers');
    const lastSync = document.getElementById('last-sync');
    const syncHistory = document.getElementById('sync-history');
    const emailForm = document.getElementById('email-form');
    const syncProgressBar = document.getElementById('sync-progress-bar');
    
    // Entity-specific elements
    const entityTabs = document.querySelectorAll('.entity-tab');
    const entityContents = document.querySelectorAll('.entity-content');
    
    // Entity-specific sync buttons
    const syncProductsBtn = document.getElementById('sync-products-btn');
    const fullSyncProductsBtn = document.getElementById('full-sync-products-btn');
    const syncPicklistsBtn = document.getElementById('sync-picklists-btn');
    const fullSyncPicklistsBtn = document.getElementById('full-sync-picklists-btn');
    const syncWarehousesBtn = document.getElementById('sync-warehouses-btn');
    const fullSyncWarehousesBtn = document.getElementById('full-sync-warehouses-btn');
    const syncUsersBtn = document.getElementById('sync-users-btn');
    const fullSyncUsersBtn = document.getElementById('full-sync-users-btn');
    const syncSuppliersBtn = document.getElementById('sync-suppliers-btn');
    const fullSyncSuppliersBtn = document.getElementById('full-sync-suppliers-btn');
    const syncBatchesBtn = document.getElementById('sync-batches-btn');
    const fullSyncBatchesBtn = document.getElementById('full-sync-batches-btn');
    
    // Filter elements
    const filterOptions = document.querySelectorAll('#filter-options .filter-option');
    const historyFilterOptions = document.querySelectorAll('#history-filter-options .filter-option');
    const logsFilterOptions = document.querySelectorAll('#logs-filter-options .filter-option');
    
    // Initial data load with improved error handling
    fetchStatus();
    fetchStats();
    fetchLogs();
    fetchHistory();
    loadEmailSettings();
    
    // Set up refresh intervals
    setInterval(fetchStatus, 30000); // Check status every 30 seconds
    setInterval(fetchStats, 60000); // Refresh stats every minute
    setInterval(fetchLogs, 10000); // Refresh logs every 10 seconds
    
    // Set up event listeners for entity tabs
    entityTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            entityTabs.forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            tab.classList.add('active');
            
            // Hide all content sections
            entityContents.forEach(content => content.classList.remove('active'));
            
            // Show content for selected entity
            const entityType = tab.getAttribute('data-entity');
            const contentElement = document.getElementById(`${entityType}-content`);
            if (contentElement) {
                contentElement.classList.add('active');
            }
        });
    });
    
    // Set up event listeners for sync buttons
    // Main sync buttons
    if (syncBtn) {
        syncBtn.addEventListener('click', function() {
            triggerSync(false);
        });
    }

    if (fullSyncBtn) {
        fullSyncBtn.addEventListener('click', function() {
            triggerSync(true);
        });
    }

    // Entity-specific sync buttons
    if (syncProductsBtn) {
        syncProductsBtn.addEventListener('click', function() {
            triggerEntitySync('products', false);
        });
    }

    if (fullSyncProductsBtn) {
        fullSyncProductsBtn.addEventListener('click', function() {
            triggerEntitySync('products', true);
        });
    }

    if (syncPicklistsBtn) {
        syncPicklistsBtn.addEventListener('click', function() {
            triggerEntitySync('picklists', false);
        });
    }

    if (fullSyncPicklistsBtn) {
        fullSyncPicklistsBtn.addEventListener('click', function() {
            triggerEntitySync('picklists', true);
        });
    }

    if (syncWarehousesBtn) {
        syncWarehousesBtn.addEventListener('click', function() {
            triggerEntitySync('warehouses', false);
        });
    }

    if (fullSyncWarehousesBtn) {
        fullSyncWarehousesBtn.addEventListener('click', function() {
            triggerEntitySync('warehouses', true);
        });
    }

    if (syncUsersBtn) {
        syncUsersBtn.addEventListener('click', function() {
            triggerEntitySync('users', false);
        });
    }

    if (fullSyncUsersBtn) {
        fullSyncUsersBtn.addEventListener('click', function() {
            triggerEntitySync('users', true);
        });
    }

    if (syncSuppliersBtn) {
        syncSuppliersBtn.addEventListener('click', function() {
            triggerEntitySync('suppliers', false);
        });
    }

    if (fullSyncSuppliersBtn) {
        fullSyncSuppliersBtn.addEventListener('click', function() {
            triggerEntitySync('suppliers', true);
        });
    }

    if (syncBatchesBtn) {
        syncBatchesBtn.addEventListener('click', function() {
            triggerEntitySync('batches', false);
        });
    }

    if (fullSyncBatchesBtn) {
        fullSyncBatchesBtn.addEventListener('click', function() {
            triggerEntitySync('batches', true);
        });
    }

    // Set up event listener for clear logs button
    if (clearLogsBtn) {
        clearLogsBtn.addEventListener('click', clearLogs);
    }

    // Set up event listeners for filter options
    filterOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove active class from all options
            filterOptions.forEach(o => o.classList.remove('active'));
            // Add active class to clicked option
            option.classList.add('active');
            
            // Apply filter
            const filterType = option.getAttribute('data-filter');
            // Implement filter logic here
        });
    });

    historyFilterOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove active class from all options
            historyFilterOptions.forEach(o => o.classList.remove('active'));
            // Add active class to clicked option
            option.classList.add('active');
            
            // Apply filter
            const filterType = option.getAttribute('data-filter');
            fetchHistory();
        });
    });

    logsFilterOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove active class from all options
            logsFilterOptions.forEach(o => o.classList.remove('active'));
            // Add active class to clicked option
            option.classList.add('active');
            
            // Apply filter
            const filterType = option.getAttribute('data-filter');
            filterLogs(filterType);
        });
    });

    // Set up event listener for email form
    if (emailForm) {
        emailForm.addEventListener('submit', function(event) {
            event.preventDefault();
            saveEmailSettings();
        });
    }
    
    // Helper function to format dates
    function formatDate(date) {
        if (!date || isNaN(new Date(date).getTime())) return 'Never';
        
        return new Date(date).toLocaleString();
    }
    
    // Helper function to safely access nested properties
    function safeGet(obj, path, defaultValue = '') {
        try {
            const parts = path.split('.');
            let current = obj;
            
            for (const part of parts) {
                if (current === null || current === undefined) {
                    return defaultValue;
                }
                current = current[part];
            }
            
            return current !== null && current !== undefined ? current : defaultValue;
        } catch (error) {
            console.error(`Error accessing path ${path}:`, error);
            return defaultValue;
        }
    }
    
    // Functions with improved error handling
    function fetchStatus() {
        console.log('Checking middleware status...');
        fetch(ENDPOINTS.status)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Status check failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Status response:', data);
                if (data && data.online) {
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
    
    function setStatusOnline() {
        if (statusIndicator && statusText) {
            statusIndicator.className = 'status-indicator status-online';
            statusText.textContent = 'Online';
        }
    }
    
    function setStatusOffline() {
        if (statusIndicator && statusText) {
            statusIndicator.className = 'status-indicator status-offline';
            statusText.textContent = 'Offline';
        }
    }
    
    function fetchLogs() {
        console.log('Fetching logs...');
        fetch(ENDPOINTS.logs)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Logs fetch failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Logs response:', data);
                if (logContainer) {
                    // FIXED: Handle both data.logs and direct data array formats
                    const logs = Array.isArray(data) ? data : 
                                (data.logs && Array.isArray(data.logs) ? data.logs : []);
                    
                    if (logs.length > 0) {
                        logContainer.innerHTML = '';
                        
                        // Get active filter
                        const activeFilter = document.querySelector('#logs-filter-options .filter-option.active');
                        const filterType = activeFilter ? activeFilter.getAttribute('data-filter') : 'all';
                        
                        // Apply filter
                        const filteredLogs = filterType === 'all' 
                            ? logs 
                            : logs.filter(log => log.level === filterType);
                        
                        filteredLogs.forEach(log => {
                            const logEntry = document.createElement('div');
                            logEntry.className = `log-entry log-${log.level}`;
                            logEntry.textContent = `[${formatDate(log.timestamp)}] ${log.message}`;
                            logContainer.appendChild(logEntry);
                        });
                        
                        // Auto-scroll to bottom
                        logContainer.scrollTop = logContainer.scrollHeight;
                    } else {
                        logContainer.innerHTML = '<div class="log-entry log-info">No logs available</div>';
                    }
                }
            })
            .catch(error => {
                console.error('Error fetching logs:', error);
                if (logContainer) {
                    logContainer.innerHTML = `<div class="log-entry log-error">Error loading logs: ${error.message}</div>`;
                }
            });
    }
    
    function filterLogs(filterType) {
        // Re-fetch logs with the new filter
        fetchLogs();
    }
    
    function fetchStats() {
        console.log('Fetching middleware stats...');
        fetch(ENDPOINTS.stats)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Stats fetch failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Stats response:', data);
                
                // FIXED: Handle both data.stats and direct data formats
                const stats = data.stats || data;
                
                // Update all entities stats if elements exist
                if (totalProducts) totalProducts.textContent = safeGet(stats, 'products.totalCount', 0);
                if (totalPicklists) totalPicklists.textContent = safeGet(stats, 'picklists.totalCount', 0);
                if (totalWarehouses) totalWarehouses.textContent = safeGet(stats, 'warehouses.totalCount', 0);
                if (totalUsers) totalUsers.textContent = safeGet(stats, 'users.totalCount', 0);
                if (totalSuppliers) totalSuppliers.textContent = safeGet(stats, 'suppliers.totalCount', 0);
                
                // Format last sync date
                if (lastSync) {
                    const lastSyncDate = safeGet(stats, 'products.lastSyncDate');
                    lastSync.textContent = formatDate(lastSyncDate);
                }
                
                // Update entity-specific stats
                updateEntityStats('products', safeGet(stats, 'products', {}));
                updateEntityStats('picklists', safeGet(stats, 'picklists', {}));
                updateEntityStats('warehouses', safeGet(stats, 'warehouses', {}));
                updateEntityStats('users', safeGet(stats, 'users', {}));
                updateEntityStats('suppliers', safeGet(stats, 'suppliers', {}));
                updateEntityStats('batches', safeGet(stats, 'batches', {}));
                
                // Update sync progress if available
                if (syncProgressBar && data.syncProgress) {
                    const progress = Math.min(
                        Math.round((data.syncProgress.itemsProcessed / data.syncProgress.totalItems) * 100),
                        100
                    );
                    syncProgressBar.style.width = `${progress}%`;
                } else if (syncProgressBar) {
                    syncProgressBar.style.width = '0%';
                }
            })
            .catch(error => {
                console.error('Error fetching stats:', error);
                
                // Set default values for stats on error
                if (totalProducts) totalProducts.textContent = '0';
                if (totalPicklists) totalPicklists.textContent = '0';
                if (totalWarehouses) totalWarehouses.textContent = '0';
                if (totalUsers) totalUsers.textContent = '0';
                if (totalSuppliers) totalSuppliers.textContent = '0';
                if (lastSync) lastSync.textContent = 'Never';
                
                // Update entity-specific stats with defaults
                updateEntityStats('products', {});
                updateEntityStats('picklists', {});
                updateEntityStats('warehouses', {});
                updateEntityStats('users', {});
                updateEntityStats('suppliers', {});
                updateEntityStats('batches', {});
            });
    }
    
    function updateEntityStats(entityType, entityData) {
        const countElement = document.getElementById(`${entityType}-count`);
        const lastSyncElement = document.getElementById(`${entityType}-last-sync`);
        const statusElement = document.getElementById(`${entityType}-sync-status`);
        const syncCountElement = document.getElementById(`${entityType}-sync-count`);
        
        if (countElement) countElement.textContent = entityData.totalCount || 0;
        
        if (lastSyncElement) {
            lastSyncElement.textContent = formatDate(entityData.lastSyncDate);
        }
        
        if (statusElement) statusElement.textContent = entityData.status || 'Ready';
        if (syncCountElement) syncCountElement.textContent = entityData.lastSyncCount || 0;
    }
    
    function fetchHistory() {
        console.log('Fetching sync history...');
        fetch(ENDPOINTS.history)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`History fetch failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('History response:', data);
                
                if (syncHistory) {
                    // FIXED: Handle both data.history and direct data array formats
                    const history = Array.isArray(data) ? data : 
                                   (data.history && Array.isArray(data.history) ? data.history : []);
                    
                    if (history.length > 0) {
                        syncHistory.innerHTML = '';
                        
                        // Get active filter
                        const activeFilter = document.querySelector('#history-filter-options .filter-option.active');
                        const filterType = activeFilter ? activeFilter.getAttribute('data-filter') : 'all';
                        
                        // Apply filter
                        const filteredHistory = filterType === 'all' 
                            ? history 
                            : history.filter(item => item.entity_type === filterType);
                        
                        filteredHistory.forEach(item => {
                            const syncItem = document.createElement('li');
                            syncItem.className = 'sync-item';
                            syncItem.setAttribute('data-entity', item.entity_type);
                            
                            const syncTime = document.createElement('span');
                            syncTime.className = 'sync-time';
                            syncTime.textContent = `${formatDate(item.timestamp)} - ${item.entity_type}`;
                            
                            const syncStatus = document.createElement('span');
                            syncStatus.className = `sync-status sync-${item.success ? 'success' : 'error'}`;
                            syncStatus.textContent = item.success ? 'Success' : 'Error';
                            
                            if (item.count) {
                                const syncCount = document.createElement('span');
                                syncCount.className = 'sync-count';
                                syncCount.textContent = item.count;
                                syncStatus.appendChild(syncCount);
                            }
                            
                            if (!item.success && item.error) {
                                const errorText = document.createElement('span');
                                errorText.className = 'sync-error-text';
                                errorText.textContent = `: ${item.error}`;
                                syncStatus.appendChild(errorText);
                                
                                // Add retry button
                                const retryBtn = document.createElement('button');
                                retryBtn.className = 'retry-btn';
                                retryBtn.textContent = 'Retry';
                                retryBtn.addEventListener('click', () => {
                                    retrySync(item.sync_id);
                                });
                                syncStatus.appendChild(retryBtn);
                            }
                            
                            syncItem.appendChild(syncTime);
                            syncItem.appendChild(syncStatus);
                            syncHistory.appendChild(syncItem);
                        });
                    } else {
                        syncHistory.innerHTML = '<li class="sync-item"><span>No sync history available</span></li>';
                    }
                }
            })
            .catch(error => {
                console.error('Error fetching history:', error);
                if (syncHistory) {
                    syncHistory.innerHTML = `<li class="sync-item"><span class="sync-status sync-error">Error loading history: ${error.message}</span></li>`;
                }
            });
    }
    
    function loadEmailSettings() {
        console.log('Loading email settings...');
        fetch(ENDPOINTS.email)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Email settings fetch failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Email settings response:', data);
                
                // Update form fields
                const emailInput = document.getElementById('email');
                const notifyErrorsCheckbox = document.getElementById('notify-errors');
                const notifySyncCheckbox = document.getElementById('notify-sync');
                
                if (emailInput) emailInput.value = data.email || '';
                if (notifyErrorsCheckbox) notifyErrorsCheckbox.checked = data.notifyErrors || false;
                if (notifySyncCheckbox) notifySyncCheckbox.checked = data.notifySync || false;
            })
            .catch(error => {
                console.error('Error loading email settings:', error);
            });
    }
    
    function saveEmailSettings() {
        console.log('Saving email settings...');
        
        const emailInput = document.getElementById('email');
        const notifyErrorsCheckbox = document.getElementById('notify-errors');
        const notifySyncCheckbox = document.getElementById('notify-sync');
        
        const settings = {
            email: emailInput ? emailInput.value : '',
            notifyErrors: notifyErrorsCheckbox ? notifyErrorsCheckbox.checked : false,
            notifySync: notifySyncCheckbox ? notifySyncCheckbox.checked : false
        };
        
        fetch(ENDPOINTS.email, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Save email settings failed: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Save email settings response:', data);
            
            // Show success message
            if (logContainer) {
                const logEntry = document.createElement('div');
                logEntry.className = 'log-entry log-success';
                logEntry.textContent = `[${new Date().toLocaleString()}] Email settings saved successfully`;
                logContainer.appendChild(logEntry);
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        })
        .catch(error => {
            console.error('Error saving email settings:', error);
            
            // Show error message
            if (logContainer) {
                const logEntry = document.createElement('div');
                logEntry.className = 'log-entry log-error';
                logEntry.textContent = `[${new Date().toLocaleString()}] Error saving email settings: ${error.message}`;
                logContainer.appendChild(logEntry);
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        });
    }
    
    function clearLogs() {
        console.log('Clearing logs...');
        fetch(ENDPOINTS.clearLogs, {
            method: 'POST'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Clear logs failed: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Clear logs response:', data);
            
            // Clear log container
            if (logContainer) {
                logContainer.innerHTML = '<div class="log-entry log-success">Logs cleared successfully</div>';
            }
            
            // Refresh logs after a delay
            setTimeout(fetchLogs, 1000);
        })
        .catch(error => {
            console.error('Error clearing logs:', error);
            
            // Show error message
            if (logContainer) {
                const logEntry = document.createElement('div');
                logEntry.className = 'log-entry log-error';
                logEntry.textContent = `[${new Date().toLocaleString()}] Error clearing logs: ${error.message}`;
                logContainer.appendChild(logEntry);
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        });
    }
    
    function retrySync(syncId) {
        console.log(`Retrying sync ${syncId}...`);
        fetch(ENDPOINTS.retrySync(syncId), {
            method: 'POST'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Retry sync failed: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Retry sync response:', data);
            
            // Show success message
            if (logContainer) {
                const logEntry = document.createElement('div');
                logEntry.className = 'log-entry log-success';
                logEntry.textContent = `[${new Date().toLocaleString()}] Retry of sync ${syncId} started successfully`;
                logContainer.appendChild(logEntry);
                logContainer.scrollTop = logContainer.scrollHeight;
            }
            
            // Refresh history after a delay
            setTimeout(fetchHistory, 2000);
        })
        .catch(error => {
            console.error('Error retrying sync:', error);
            
            // Show error message
            if (logContainer) {
                const logEntry = document.createElement('div');
                logEntry.className = 'log-entry log-error';
                logEntry.textContent = `[${new Date().toLocaleString()}] Error retrying sync: ${error.message}`;
                logContainer.appendChild(logEntry);
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        });
    }
    
    // Function to trigger sync for all entities
    function triggerSync(fullSync) {
        console.log(`Triggering ${fullSync ? 'full' : 'incremental'} sync for all entities...`);
        
        // Disable sync buttons during sync
        if (syncBtn) syncBtn.disabled = true;
        if (fullSyncBtn) fullSyncBtn.disabled = true;
        
        // Show sync in progress
        if (syncProgressBar) syncProgressBar.style.width = '5%'; // Start progress
        
        fetch(fullSync ? ENDPOINTS.fullSync : ENDPOINTS.sync, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Sync failed: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Sync response:', data);
            
            // Show success message
            if (logContainer) {
                const logEntry = document.createElement('div');
                logEntry.className = 'log-entry log-success';
                logEntry.textContent = `[${new Date().toLocaleString()}] ${fullSync ? 'Full' : 'Incremental'} sync started for all entities`;
                logContainer.appendChild(logEntry);
                logContainer.scrollTop = logContainer.scrollHeight;
            }
            
            // Refresh stats and history after a delay to allow sync to progress
            setTimeout(() => {
                fetchStats();
                fetchHistory();
                fetchLogs();
            }, 2000);
        })
        .catch(error => {
            console.error('Error triggering sync:', error);
            
            // Show error message
            if (logContainer) {
                const logEntry = document.createElement('div');
                logEntry.className = 'log-entry log-error';
                logEntry.textContent = `[${new Date().toLocaleString()}] Error triggering sync: ${error.message}`;
                logContainer.appendChild(logEntry);
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        })
        .finally(() => {
            // Re-enable sync buttons
            if (syncBtn) syncBtn.disabled = false;
            if (fullSyncBtn) fullSyncBtn.disabled = false;
        });
    }

    // Function to trigger sync for a specific entity
    function triggerEntitySync(entityType, fullSync) {
        console.log(`Triggering ${fullSync ? 'full' : 'incremental'} sync for ${entityType}...`);
        
        // Disable entity-specific sync buttons during sync
        const syncEntityBtn = document.getElementById(`sync-${entityType}-btn`);
        const fullSyncEntityBtn = document.getElementById(`full-sync-${entityType}-btn`);
        
        if (syncEntityBtn) syncEntityBtn.disabled = true;
        if (fullSyncEntityBtn) fullSyncEntityBtn.disabled = true;
        
        fetch(ENDPOINTS.syncEntity(entityType, fullSync), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`${entityType} sync failed: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log(`${entityType} sync response:`, data);
            
            // Show success message
            if (logContainer) {
                const logEntry = document.createElement('div');
                logEntry.className = 'log-entry log-success';
                logEntry.textContent = `[${new Date().toLocaleString()}] ${fullSync ? 'Full' : 'Incremental'} sync started for ${entityType}`;
                logContainer.appendChild(logEntry);
                logContainer.scrollTop = logContainer.scrollHeight;
            }
            
            // Refresh stats and history after a delay to allow sync to progress
            setTimeout(() => {
                fetchStats();
                fetchHistory();
                fetchLogs();
            }, 2000);
        })
        .catch(error => {
            console.error(`Error triggering ${entityType} sync:`, error);
            
            // Show error message
            if (logContainer) {
                const logEntry = document.createElement('div');
                logEntry.className = 'log-entry log-error';
                logEntry.textContent = `[${new Date().toLocaleString()}] Error triggering ${entityType} sync: ${error.message}`;
                logContainer.appendChild(logEntry);
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        })
        .finally(() => {
            // Re-enable entity-specific sync buttons
            if (syncEntityBtn) syncEntityBtn.disabled = false;
            if (fullSyncEntityBtn) fullSyncEntityBtn.disabled = false;
        });
    }
});
