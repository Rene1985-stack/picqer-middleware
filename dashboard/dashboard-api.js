// updated_dashboard-api.js - Added batch tracking functionality

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
    // New batch-related endpoints
    batches: '/api/batches',
    batchStats: '/api/batches/stats',
    batchMetrics: '/api/batches/metrics',
    batchProductivity: '/api/batches/productivity',
    syncBatches: '/api/sync/batches',
    fullSyncBatches: '/api/sync/batches?full=true'
};

// Initialize dashboard with improved error handling
document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard initializing with batch tracking functionality...');
    
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
    const totalBatches = document.getElementById('total-batches'); // New element
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
    const syncBatchesBtn = document.getElementById('sync-batches-btn'); // New element
    const fullSyncBatchesBtn = document.getElementById('full-sync-batches-btn'); // New element
    
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
    
    // Event listeners for filter options
    filterOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove active class from all options
            filterOptions.forEach(o => o.classList.remove('active'));
            // Add active class to clicked option
            option.classList.add('active');
            
            // Apply filter to sync history
            const filterType = option.getAttribute('data-filter');
            filterSyncHistory(filterType);
        });
    });
    
    historyFilterOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove active class from all options
            historyFilterOptions.forEach(o => o.classList.remove('active'));
            // Add active class to clicked option
            option.classList.add('active');
            
            // Apply entity filter to sync history
            const entityType = option.getAttribute('data-filter');
            filterSyncHistoryByEntity(entityType);
        });
    });
    
    logsFilterOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove active class from all options
            logsFilterOptions.forEach(o => o.classList.remove('active'));
            // Add active class to clicked option
            option.classList.add('active');
            
            // Apply filter to logs
            const filterType = option.getAttribute('data-filter');
            filterLogs(filterType);
        });
    });
    
    // Event listeners for sync buttons
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
    
    // New batch-specific sync buttons
    if (syncBatchesBtn) syncBatchesBtn.addEventListener('click', () => triggerEntitySync('batches'));
    if (fullSyncBatchesBtn) fullSyncBatchesBtn.addEventListener('click', () => triggerEntityFullSync('batches'));
    
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
                addLogEntry('error', `Status check failed: ${error.message}`);
            });
    }
    
    function setStatusOnline() {
        if (statusIndicator && statusText) {
            statusIndicator.classList.remove('status-offline');
            statusIndicator.classList.add('status-online');
            statusText.textContent = 'Online';
            statusText.style.color = 'var(--success)';
        }
    }
    
    function setStatusOffline() {
        if (statusIndicator && statusText) {
            statusIndicator.classList.remove('status-online');
            statusIndicator.classList.add('status-offline');
            statusText.textContent = 'Offline';
            statusText.style.color = 'var(--danger)';
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
                    if (data && data.logs && data.logs.length > 0) {
                        logContainer.innerHTML = '';
                        
                        // Get active filter
                        const activeFilter = document.querySelector('#logs-filter-options .filter-option.active');
                        const filterType = activeFilter ? activeFilter.getAttribute('data-filter') : 'all';
                        
                        // Apply filter
                        const filteredLogs = filterType === 'all' 
                            ? data.logs 
                            : data.logs.filter(log => log.level === filterType);
                        
                        filteredLogs.forEach(log => {
                            const logEntry = document.createElement('div');
                            logEntry.className = `log-entry log-${log.level}`;
                            logEntry.textContent = `[${new Date(log.timestamp).toLocaleString()}] ${log.message}`;
                            logContainer.appendChild(logEntry);
                        });
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
                
                // Update all entities stats if elements exist
                if (totalProducts) totalProducts.textContent = data.stats?.products?.totalCount || 0;
                if (totalPicklists) totalPicklists.textContent = data.stats?.picklists?.totalCount || 0;
                if (totalWarehouses) totalWarehouses.textContent = data.stats?.warehouses?.totalCount || 0;
                if (totalUsers) totalUsers.textContent = data.stats?.users?.totalCount || 0;
                if (totalSuppliers) totalSuppliers.textContent = data.stats?.suppliers?.totalCount || 0;
                if (totalBatches) totalBatches.textContent = data.stats?.batches?.totalCount || 0; // New batch stats
                
                // Format last sync date
                if (lastSync) {
                    const lastSyncDate = data.stats?.products?.lastSyncDate ? new Date(data.stats.products.lastSyncDate) : null;
                    lastSync.textContent = lastSyncDate ? lastSyncDate.toLocaleString() : 'Never';
                }
                
                // Update entity-specific stats
                updateEntityStats('products', data.stats?.products);
                updateEntityStats('picklists', data.stats?.picklists);
                updateEntityStats('warehouses', data.stats?.warehouses);
                updateEntityStats('users', data.stats?.users);
                updateEntityStats('suppliers', data.stats?.suppliers);
                updateEntityStats('batches', data.stats?.batches); // New batch stats
                
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
                
                // Update batch productivity metrics if available
                if (data.stats?.batches?.productivity) {
                    updateBatchProductivity(data.stats.batches.productivity);
                }
            })
            .catch(error => {
                console.error('Error fetching stats:', error);
                addLogEntry('error', `Error fetching stats: ${error.message}`);
            });
    }
    
    function updateEntityStats(entityType, entityData) {
        if (!entityData) return;
        
        const countElement = document.getElementById(`${entityType}-count`);
        const lastSyncElement = document.getElementById(`${entityType}-last-sync`);
        const statusElement = document.getElementById(`${entityType}-sync-status`);
        const syncCountElement = document.getElementById(`${entityType}-sync-count`);
        
        if (countElement) countElement.textContent = entityData.totalCount || 0;
        
        if (lastSyncElement) {
            if (entityData.lastSyncDate) {
                const lastSyncDate = new Date(entityData.lastSyncDate);
                lastSyncElement.textContent = lastSyncDate.toLocaleString();
            } else {
                lastSyncElement.textContent = 'Never';
            }
        }
        
        if (statusElement) statusElement.textContent = entityData.status || 'Ready';
        if (syncCountElement) syncCountElement.textContent = entityData.lastSyncCount || 0;
    }
    
    // New function to update batch productivity metrics
    function updateBatchProductivity(productivityData) {
        if (!productivityData) return;
        
        const pickerProductivityElement = document.getElementById('picker-productivity');
        const packerProductivityElement = document.getElementById('packer-productivity');
        const avgPickingTimeElement = document.getElementById('avg-picking-time');
        const avgPackingTimeElement = document.getElementById('avg-packing-time');
        
        if (pickerProductivityElement) {
            pickerProductivityElement.textContent = productivityData.pickerProductivity?.toFixed(2) || '0.00';
        }
        
        if (packerProductivityElement) {
            packerProductivityElement.textContent = productivityData.packerProductivity?.toFixed(2) || '0.00';
        }
        
        if (avgPickingTimeElement) {
            avgPickingTimeElement.textContent = formatDuration(productivityData.avgPickingTime);
        }
        
        if (avgPackingTimeElement) {
            avgPackingTimeElement.textContent = formatDuration(productivityData.avgPackingTime);
        }
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
                    if (data && data.history && data.history.length > 0) {
                        syncHistory.innerHTML = '';
                        
                        // Get active filter
                        const activeStatusFilter = document.querySelector('#filter-options .filter-option.active');
                        const statusFilterType = activeStatusFilter ? activeStatusFilter.getAttribute('data-filter') : 'all';
                        
                        const activeEntityFilter = document.querySelector('#history-filter-options .filter-option.active');
                        const entityFilterType = activeEntityFilter ? activeEntityFilter.getAttribute('data-filter') : 'all';
                        
                        // Apply filters
                        let filteredHistory = data.history;
                        
                        // Apply status filter
                        if (statusFilterType !== 'all') {
                            filteredHistory = filteredHistory.filter(item => {
                                if (statusFilterType === 'success') {
                                    return item.success;
                                } else if (statusFilterType === 'error') {
                                    return !item.success;
                                }
                                return true;
                            });
                        }
                        
                        // Apply entity filter
                        if (entityFilterType !== 'all') {
                            filteredHistory = filteredHistory.filter(item => item.entityType === entityFilterType);
                        }
                        
                        filteredHistory.forEach(item => {
                            const syncItem = document.createElement('li');
                            syncItem.className = 'sync-item';
                            
                            const syncInfo = document.createElement('div');
                            syncInfo.className = 'sync-info';
                            
                            const syncEntity = document.createElement('span');
                            syncEntity.className = 'sync-entity';
                            syncEntity.textContent = item.entityType.charAt(0).toUpperCase() + item.entityType.slice(1);
                            
                            const syncTime = document.createElement('span');
                            syncTime.className = 'sync-time';
                            syncTime.textContent = new Date(item.timestamp).toLocaleString();
                            
                            syncInfo.appendChild(syncEntity);
                            syncInfo.appendChild(document.createTextNode(' - '));
                            syncInfo.appendChild(syncTime);
                            
                            const syncStatus = document.createElement('div');
                            syncStatus.className = `sync-status ${item.success ? 'sync-success' : 'sync-error'}`;
                            
                            const statusText = document.createElement('span');
                            statusText.textContent = item.success ? 'Success' : 'Error';
                            
                            const syncCount = document.createElement('span');
                            syncCount.className = 'sync-count';
                            syncCount.textContent = item.count || 0;
                            
                            syncStatus.appendChild(statusText);
                            syncStatus.appendChild(syncCount);
                            
                            // Add retry button for failed syncs
                            if (!item.success && item.id) {
                                const retryBtn = document.createElement('button');
                                retryBtn.className = 'retry-btn';
                                retryBtn.textContent = 'Retry';
                                retryBtn.addEventListener('click', () => retrySync(item.id));
                                syncStatus.appendChild(retryBtn);
                            }
                            
                            syncItem.appendChild(syncInfo);
                            syncItem.appendChild(syncStatus);
                            
                            syncHistory.appendChild(syncItem);
                        });
                    } else {
                        syncHistory.innerHTML = '<li class="sync-item">No sync history available</li>';
                    }
                }
            })
            .catch(error => {
                console.error('Error fetching history:', error);
                if (syncHistory) {
                    syncHistory.innerHTML = `<li class="sync-item">Error loading history: ${error.message}</li>`;
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
    
    function triggerSync() {
        console.log('Triggering sync...');
        fetch(ENDPOINTS.sync, { method: 'POST' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Sync failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Sync response:', data);
                addLogEntry('success', 'Sync started successfully');
                fetchStats();
                fetchHistory();
            })
            .catch(error => {
                console.error('Error triggering sync:', error);
                addLogEntry('error', `Error triggering sync: ${error.message}`);
            });
    }
    
    function triggerFullSync() {
        console.log('Triggering full sync...');
        fetch(ENDPOINTS.fullSync, { method: 'POST' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Full sync failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Full sync response:', data);
                addLogEntry('success', 'Full sync started successfully');
                fetchStats();
                fetchHistory();
            })
            .catch(error => {
                console.error('Error triggering full sync:', error);
                addLogEntry('error', `Error triggering full sync: ${error.message}`);
            });
    }
    
    function triggerEntitySync(entityType) {
        console.log(`Triggering ${entityType} sync...`);
        fetch(ENDPOINTS.syncEntity(entityType), { method: 'POST' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`${entityType} sync failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log(`${entityType} sync response:`, data);
                addLogEntry('success', `${entityType} sync started successfully`);
                fetchStats();
                fetchHistory();
            })
            .catch(error => {
                console.error(`Error triggering ${entityType} sync:`, error);
                addLogEntry('error', `Error triggering ${entityType} sync: ${error.message}`);
            });
    }
    
    function triggerEntityFullSync(entityType) {
        console.log(`Triggering full ${entityType} sync...`);
        fetch(ENDPOINTS.syncEntity(entityType, true), { method: 'POST' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Full ${entityType} sync failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log(`Full ${entityType} sync response:`, data);
                addLogEntry('success', `Full ${entityType} sync started successfully`);
                fetchStats();
                fetchHistory();
            })
            .catch(error => {
                console.error(`Error triggering full ${entityType} sync:`, error);
                addLogEntry('error', `Error triggering full ${entityType} sync: ${error.message}`);
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
                addLogEntry('success', `Retry of sync ${syncId} started successfully`);
                fetchStats();
                fetchHistory();
            })
            .catch(error => {
                console.error('Error retrying sync:', error);
                addLogEntry('error', `Error retrying sync: ${error.message}`);
            });
    }
    
    function clearLogs() {
        console.log('Clearing logs...');
        fetch(ENDPOINTS.clearLogs, { method: 'POST' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Clear logs failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Clear logs response:', data);
                addLogEntry('success', 'Logs cleared successfully');
                fetchLogs();
            })
            .catch(error => {
                console.error('Error clearing logs:', error);
                addLogEntry('error', `Error clearing logs: ${error.message}`);
            });
    }
    
    function saveEmailSettings(event) {
        event.preventDefault();
        
        const emailEnabled = document.getElementById('email-enabled').checked;
        const emailAddress = document.getElementById('email-address').value;
        const emailFrequency = document.getElementById('email-frequency').value;
        const emailErrorsOnly = document.getElementById('email-errors-only').checked;
        
        const emailSettings = {
            enabled: emailEnabled,
            address: emailAddress,
            frequency: emailFrequency,
            errorsOnly: emailErrorsOnly
        };
        
        console.log('Saving email settings:', emailSettings);
        
        fetch(ENDPOINTS.email, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(emailSettings)
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Save email settings failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Save email settings response:', data);
                addLogEntry('success', 'Email settings saved successfully');
            })
            .catch(error => {
                console.error('Error saving email settings:', error);
                addLogEntry('error', `Error saving email settings: ${error.message}`);
            });
    }
    
    function loadEmailSettings() {
        console.log('Loading email settings...');
        fetch(ENDPOINTS.email)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Load email settings failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Load email settings response:', data);
                
                if (data && data.settings) {
                    const emailEnabled = document.getElementById('email-enabled');
                    const emailAddress = document.getElementById('email-address');
                    const emailFrequency = document.getElementById('email-frequency');
                    const emailErrorsOnly = document.getElementById('email-errors-only');
                    
                    if (emailEnabled) emailEnabled.checked = data.settings.enabled;
                    if (emailAddress) emailAddress.value = data.settings.address || '';
                    if (emailFrequency) emailFrequency.value = data.settings.frequency || 'daily';
                    if (emailErrorsOnly) emailErrorsOnly.checked = data.settings.errorsOnly;
                }
            })
            .catch(error => {
                console.error('Error loading email settings:', error);
                addLogEntry('error', `Error loading email settings: ${error.message}`);
            });
    }
    
    function addLogEntry(level, message) {
        if (logContainer) {
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry log-${level}`;
            logEntry.textContent = `[${new Date().toLocaleString()}] ${message}`;
            logContainer.insertBefore(logEntry, logContainer.firstChild);
        }
    }
    
    // Format duration in milliseconds to human-readable string
    function formatDuration(ms) {
        if (!ms) return '0s';
        
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
    
    // New function to fetch batch productivity metrics
    function fetchBatchProductivity() {
        console.log('Fetching batch productivity metrics...');
        fetch(ENDPOINTS.batchProductivity)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Batch productivity fetch failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Batch productivity response:', data);
                if (data && data.productivity) {
                    updateBatchProductivity(data.productivity);
                }
            })
            .catch(error => {
                console.error('Error fetching batch productivity:', error);
                addLogEntry('error', `Error fetching batch productivity: ${error.message}`);
            });
    }
    
    // Call fetchBatchProductivity on load and set interval
    fetchBatchProductivity();
    setInterval(fetchBatchProductivity, 60000); // Refresh batch productivity every minute
});
