/**
 * Fixed Dashboard API Adapter
 * 
 * This file fixes the data handling issues in the dashboard by properly
 * handling the API response formats.
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
    
    // Set up event listeners
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
                            
                            if (!item.success) {
                                const retryBtn = document.createElement('button');
                                retryBtn.className = 'retry-btn';
                                retryBtn.textContent = 'Retry';
                                retryBtn.addEventListener('click', () => retrySync(item.sync_id));
                                syncStatus.appendChild(retryBtn);
                            }
                            
                            syncItem.appendChild(syncTime);
                            syncItem.appendChild(syncStatus);
                            syncHistory.appendChild(syncItem);
                        });
                    } else {
                        syncHistory.innerHTML = '<li class="sync-item"><span class="sync-time">No sync history available</span></li>';
                    }
                }
            })
            .catch(error => {
                console.error('Error fetching history:', error);
                if (syncHistory) {
                    syncHistory.innerHTML = `<li class="sync-item"><span class="sync-time">Error loading history: ${error.message}</span></li>`;
                }
            });
    }
    
    function filterSyncHistory(filterType) {
        // Re-fetch history with the new filter
        fetchHistory();
    }
    
    function filterSyncHistoryByEntity(entityType) {
        // Re-fetch history with the new entity filter
        fetchHistory();
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
                
                const emailInput = document.getElementById('email');
                const notifyErrorsCheckbox = document.getElementById('notify-errors');
                const notifySyncCheckbox = document.getElementById('notify-sync');
                
                if (emailInput) emailInput.value = data.email || '';
                if (notifyErrorsCheckbox) notifyErrorsCheckbox.checked = data.notifyErrors || false;
                if (notifySyncCheckbox) notifySyncCheckbox.checked = data.notifySync || false;
            })
            .catch(error => {
                console.error('Error loading email settings:', error);
                // Don't show error in UI, just log to console
            });
    }
    
    function triggerSync() {
        console.log('Triggering sync for all entities...');
        if (syncBtn) syncBtn.disabled = true;
        
        fetch(ENDPOINTS.sync, { method: 'POST' })
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
                    logEntry.textContent = `[${new Date().toLocaleString()}] Sync started for all entities`;
                    logContainer.appendChild(logEntry);
                    logContainer.scrollTop = logContainer.scrollHeight;
                }
                
                // Re-enable button after a delay
                setTimeout(() => {
                    if (syncBtn) syncBtn.disabled = false;
                }, 2000);
                
                // Refresh data after a delay
                setTimeout(() => {
                    fetchStats();
                    fetchHistory();
                }, 5000);
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
                
                // Re-enable button
                if (syncBtn) syncBtn.disabled = false;
            });
    }
    
    function triggerFullSync() {
        console.log('Triggering full sync for all entities...');
        if (fullSyncBtn) fullSyncBtn.disabled = true;
        
        fetch(ENDPOINTS.fullSync, { method: 'POST' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Full sync failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Full sync response:', data);
                
                // Show success message
                if (logContainer) {
                    const logEntry = document.createElement('div');
                    logEntry.className = 'log-entry log-success';
                    logEntry.textContent = `[${new Date().toLocaleString()}] Full sync started for all entities`;
                    logContainer.appendChild(logEntry);
                    logContainer.scrollTop = logContainer.scrollHeight;
                }
                
                // Re-enable button after a delay
                setTimeout(() => {
                    if (fullSyncBtn) fullSyncBtn.disabled = false;
                }, 2000);
                
                // Refresh data after a delay
                setTimeout(() => {
                    fetchStats();
                    fetchHistory();
                }, 5000);
            })
            .catch(error => {
                console.error('Error triggering full sync:', error);
                
                // Show error message
                if (logContainer) {
                    const logEntry = document.createElement('div');
                    logEntry.className = 'log-entry log-error';
                    logEntry.textContent = `[${new Date().toLocaleString()}] Error triggering full sync: ${error.message}`;
                    logContainer.appendChild(logEntry);
                    logContainer.scrollTop = logContainer.scrollHeight;
                }
                
                // Re-enable button
                if (fullSyncBtn) fullSyncBtn.disabled = false;
            });
    }
    
    function triggerEntitySync(entityType) {
        console.log(`Triggering sync for ${entityType}...`);
        const syncBtn = document.getElementById(`sync-${entityType}-btn`);
        if (syncBtn) syncBtn.disabled = true;
        
        fetch(ENDPOINTS.syncEntity(entityType), { method: 'POST' })
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
                    logEntry.textContent = `[${new Date().toLocaleString()}] Sync started for ${entityType}`;
                    logContainer.appendChild(logEntry);
                    logContainer.scrollTop = logContainer.scrollHeight;
                }
                
                // Re-enable button after a delay
                setTimeout(() => {
                    if (syncBtn) syncBtn.disabled = false;
                }, 2000);
                
                // Refresh data after a delay
                setTimeout(() => {
                    fetchStats();
                    fetchHistory();
                }, 5000);
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
                
                // Re-enable button
                if (syncBtn) syncBtn.disabled = false;
            });
    }
    
    function triggerEntityFullSync(entityType) {
        console.log(`Triggering full sync for ${entityType}...`);
        const fullSyncBtn = document.getElementById(`full-sync-${entityType}-btn`);
        if (fullSyncBtn) fullSyncBtn.disabled = true;
        
        fetch(ENDPOINTS.syncEntity(entityType, true), { method: 'POST' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`${entityType} full sync failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log(`${entityType} full sync response:`, data);
                
                // Show success message
                if (logContainer) {
                    const logEntry = document.createElement('div');
                    logEntry.className = 'log-entry log-success';
                    logEntry.textContent = `[${new Date().toLocaleString()}] Full sync started for ${entityType}`;
                    logContainer.appendChild(logEntry);
                    logContainer.scrollTop = logContainer.scrollHeight;
                }
                
                // Re-enable button after a delay
                setTimeout(() => {
                    if (fullSyncBtn) fullSyncBtn.disabled = false;
                }, 2000);
                
                // Refresh data after a delay
                setTimeout(() => {
                    fetchStats();
                    fetchHistory();
                }, 5000);
            })
            .catch(error => {
                console.error(`Error triggering ${entityType} full sync:`, error);
                
                // Show error message
                if (logContainer) {
                    const logEntry = document.createElement('div');
                    logEntry.className = 'log-entry log-error';
                    logEntry.textContent = `[${new Date().toLocaleString()}] Error triggering ${entityType} full sync: ${error.message}`;
                    logContainer.appendChild(logEntry);
                    logContainer.scrollTop = logContainer.scrollHeight;
                }
                
                // Re-enable button
                if (fullSyncBtn) fullSyncBtn.disabled = false;
            });
    }
    
    function retrySync(syncId) {
        console.log(`Retrying sync ${syncId}...`);
        
        fetch(ENDPOINTS.retrySync(syncId), { method: 'POST' })
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
                    logEntry.textContent = `[${new Date().toLocaleString()}] Retry started for sync ${syncId}`;
                    logContainer.appendChild(logEntry);
                    logContainer.scrollTop = logContainer.scrollHeight;
                }
                
                // Refresh data after a delay
                setTimeout(() => {
                    fetchStats();
                    fetchHistory();
                }, 5000);
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
    
    function clearLogs() {
        console.log('Clearing logs...');
        if (clearLogsBtn) clearLogsBtn.disabled = true;
        
        fetch(ENDPOINTS.clearLogs, { method: 'POST' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Clear logs failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Clear logs response:', data);
                
                // Clear logs container
                if (logContainer) {
                    logContainer.innerHTML = '<div class="log-entry log-success">Logs cleared successfully</div>';
                }
                
                // Re-enable button
                if (clearLogsBtn) clearLogsBtn.disabled = false;
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
                
                // Re-enable button
                if (clearLogsBtn) clearLogsBtn.disabled = false;
            });
    }
    
    function saveEmailSettings(event) {
        event.preventDefault();
        console.log('Saving email settings...');
        
        const emailInput = document.getElementById('email');
        const notifyErrorsCheckbox = document.getElementById('notify-errors');
        const notifySyncCheckbox = document.getElementById('notify-sync');
        
        const email = emailInput ? emailInput.value : '';
        const notifyErrors = notifyErrorsCheckbox ? notifyErrorsCheckbox.checked : false;
        const notifySync = notifySyncCheckbox ? notifySyncCheckbox.checked : false;
        
        fetch(ENDPOINTS.email, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email,
                notifyErrors,
                notifySync
            })
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
    
    // Add event listeners for sync buttons
    if (syncBtn) syncBtn.addEventListener('click', triggerSync);
    if (fullSyncBtn) fullSyncBtn.addEventListener('click', triggerFullSync);
    if (clearLogsBtn) clearLogsBtn.addEventListener('click', clearLogs);
    if (emailForm) emailForm.addEventListener('submit', saveEmailSettings);
    
    // Entity-specific sync buttons
    if (syncProductsBtn) syncProductsBtn.addEventListener('click', () => triggerEntitySync('products'));
    if (fullSyncProductsBtn) fullSyncProductsBtn.addEventListener('click', () => triggerEntityFullSync('products'));
    if (syncPicklistsBtn) syncPicklistsBtn.addEventListener('click', () => triggerEntitySync('picklists'));
    if (fullSyncPicklistsBtn) fullSyncPicklistsBtn.addEventListener('click', () => triggerEntityFullSync('picklists'));
    if (syncWarehousesBtn) syncWarehousesBtn.addEventListener('click', () => triggerEntitySync('warehouses'));
    if (fullSyncWarehousesBtn) fullSyncWarehousesBtn.addEventListener('click', () => triggerEntityFullSync('warehouses'));
    if (syncUsersBtn) syncUsersBtn.addEventListener('click', () => triggerEntitySync('users'));
    if (fullSyncUsersBtn) fullSyncUsersBtn.addEventListener('click', () => triggerEntityFullSync('users'));
    if (syncSuppliersBtn) syncSuppliersBtn.addEventListener('click', () => triggerEntitySync('suppliers'));
    if (fullSyncSuppliersBtn) fullSyncSuppliersBtn.addEventListener('click', () => triggerEntityFullSync('suppliers'));
    
    // Filter options
    filterOptions.forEach(option => {
        option.addEventListener('click', () => {
            filterOptions.forEach(o => o.classList.remove('active'));
            option.classList.add('active');
            
            const filterType = option.getAttribute('data-filter');
            filterSyncHistory(filterType);
        });
    });
    
    historyFilterOptions.forEach(option => {
        option.addEventListener('click', () => {
            historyFilterOptions.forEach(o => o.classList.remove('active'));
            option.classList.add('active');
            
            const entityType = option.getAttribute('data-filter');
            filterSyncHistoryByEntity(entityType);
        });
    });
    
    logsFilterOptions.forEach(option => {
        option.addEventListener('click', () => {
            logsFilterOptions.forEach(o => o.classList.remove('active'));
            option.classList.add('active');
            
            const filterType = option.getAttribute('data-filter');
            filterLogs(filterType);
        });
    });
});
