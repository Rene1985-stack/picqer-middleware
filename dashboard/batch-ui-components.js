// batch-ui-components.js - UI components for batch tracking functionality

document.addEventListener('DOMContentLoaded', function() {
    // Create batch tab and content if they don't exist
    createBatchTabAndContent();
    
    // Initialize batch UI components
    initializeBatchUI();
    
    // Function to create batch tab and content
    function createBatchTabAndContent() {
        // Add batch tab to entity tabs if it doesn't exist
        const entityTabs = document.querySelector('.entity-tabs');
        if (entityTabs && !document.querySelector('.entity-tab[data-entity="batches"]')) {
            const batchTab = document.createElement('div');
            batchTab.className = 'entity-tab';
            batchTab.setAttribute('data-entity', 'batches');
            batchTab.textContent = 'Batches';
            entityTabs.appendChild(batchTab);
            
            // Add event listener to the new tab
            batchTab.addEventListener('click', () => {
                // Remove active class from all tabs
                document.querySelectorAll('.entity-tab').forEach(tab => {
                    tab.classList.remove('active');
                });
                
                // Add active class to batches tab
                batchTab.classList.add('active');
                
                // Hide all content sections
                document.querySelectorAll('.entity-content').forEach(content => {
                    content.classList.remove('active');
                });
                
                // Show batches content
                const batchesContent = document.getElementById('batches-content');
                if (batchesContent) {
                    batchesContent.classList.add('active');
                }
            });
        }
        
        // Add batches to the All Entities stats grid if it doesn't exist
        const allStatsGrid = document.querySelector('#all-content .stats-grid');
        if (allStatsGrid && !document.getElementById('total-batches')) {
            const batchStatCard = document.createElement('div');
            batchStatCard.className = 'stat-card';
            batchStatCard.innerHTML = `
                <div class="stat-value" id="total-batches">--</div>
                <div class="stat-label">Total Batches</div>
            `;
            allStatsGrid.appendChild(batchStatCard);
        }
        
        // Create batches content section if it doesn't exist
        if (!document.getElementById('batches-content')) {
            const dashboardGrid = document.querySelector('.dashboard-grid');
            if (!dashboardGrid) return;
            
            const firstColumn = dashboardGrid.children[0];
            if (!firstColumn) return;
            
            const batchesContent = document.createElement('div');
            batchesContent.className = 'entity-content';
            batchesContent.id = 'batches-content';
            
            batchesContent.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value" id="batches-count">--</div>
                        <div class="stat-label">Total Batches</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="batches-last-sync">--</div>
                        <div class="stat-label">Last Sync</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="batches-sync-status">--</div>
                        <div class="stat-label">Status</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="batches-sync-count">--</div>
                        <div class="stat-label">Last Sync Count</div>
                    </div>
                </div>
                
                <div class="card-header">
                    <h3 class="card-title">Batch Actions</h3>
                    <div class="card-actions">
                        <button class="btn btn-primary" id="sync-batches-btn">Sync Batches</button>
                        <button class="btn btn-outline" id="full-sync-batches-btn">Full Sync</button>
                    </div>
                </div>
                
                <div class="progress-container">
                    <div class="progress">
                        <div class="progress-bar" id="batches-progress-bar" style="width: 0%"></div>
                    </div>
                </div>
                
                <div class="card-header">
                    <h3 class="card-title">Productivity Metrics</h3>
                    <div class="card-actions">
                        <button class="btn btn-outline refresh-metrics-btn" data-entity="batches">
                            Refresh Metrics
                        </button>
                    </div>
                </div>
                
                <div class="productivity-grid">
                    <div class="productivity-card">
                        <div class="productivity-value" id="picker-productivity">--</div>
                        <div class="productivity-label">Picker Productivity (items/hour)</div>
                    </div>
                    <div class="productivity-card">
                        <div class="productivity-value" id="packer-productivity">--</div>
                        <div class="productivity-label">Packer Productivity (items/hour)</div>
                    </div>
                    <div class="productivity-card">
                        <div class="productivity-value" id="avg-picking-time">--</div>
                        <div class="productivity-label">Avg. Picking Time</div>
                    </div>
                    <div class="productivity-card">
                        <div class="productivity-value" id="avg-packing-time">--</div>
                        <div class="productivity-label">Avg. Packing Time</div>
                    </div>
                </div>
                
                <div class="card-header">
                    <h3 class="card-title">Recent Batches</h3>
                    <div class="card-actions">
                        <div class="filter-dropdown">
                            <button class="btn btn-outline" id="batch-filter-btn">Filter</button>
                            <div class="filter-dropdown-content" id="batch-filter-options">
                                <div class="filter-option active" data-filter="all">All</div>
                                <div class="filter-option" data-filter="open">Open</div>
                                <div class="filter-option" data-filter="picking">Picking</div>
                                <div class="filter-option" data-filter="packing">Packing</div>
                                <div class="filter-option" data-filter="closed">Closed</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="batch-list-container">
                    <table class="batch-list">
                        <thead>
                            <tr>
                                <th>Batch #</th>
                                <th>Status</th>
                                <th>Picker</th>
                                <th>Packer</th>
                                <th>Created</th>
                                <th>Completed</th>
                                <th>Duration</th>
                            </tr>
                        </thead>
                        <tbody id="batch-list-body">
                            <tr>
                                <td colspan="7" class="loading-message">Loading batches...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                
                <div id="batches-metrics-grid" class="metrics-grid">
                    <!-- Metrics will be added here by metrics-display.js -->
                </div>
            `;
            
            firstColumn.appendChild(batchesContent);
            
            // Add batch filter event listeners
            const batchFilterOptions = document.querySelectorAll('#batch-filter-options .filter-option');
            batchFilterOptions.forEach(option => {
                option.addEventListener('click', () => {
                    // Remove active class from all options
                    batchFilterOptions.forEach(o => o.classList.remove('active'));
                    // Add active class to clicked option
                    option.classList.add('active');
                    
                    // Apply filter to batch list
                    const filterType = option.getAttribute('data-filter');
                    filterBatchList(filterType);
                });
            });
        }
    }
    
    // Function to initialize batch UI components
    function initializeBatchUI() {
        // Add event listeners for batch sync buttons
        const syncBatchesBtn = document.getElementById('sync-batches-btn');
        const fullSyncBatchesBtn = document.getElementById('full-sync-batches-btn');
        
        if (syncBatchesBtn) {
            syncBatchesBtn.addEventListener('click', () => {
                triggerEntitySync('batches');
            });
        }
        
        if (fullSyncBatchesBtn) {
            fullSyncBatchesBtn.addEventListener('click', () => {
                triggerEntityFullSync('batches');
            });
        }
        
        // Load initial batch data
        fetchBatches();
        
        // Set up refresh interval for batch data
        setInterval(fetchBatches, 60000); // Refresh every minute
    }
    
    // Function to fetch batches from the API
    function fetchBatches() {
        console.log('Fetching batches...');
        fetch('/api/batches')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Batches fetch failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Batches response:', data);
                displayBatches(data.batches);
            })
            .catch(error => {
                console.error('Error fetching batches:', error);
                displayBatchError(error.message);
            });
    }
    
    // Function to display batches in the UI
    function displayBatches(batches) {
        const batchListBody = document.getElementById('batch-list-body');
        if (!batchListBody) return;
        
        if (!batches || batches.length === 0) {
            batchListBody.innerHTML = '<tr><td colspan="7" class="empty-message">No batches available</td></tr>';
            return;
        }
        
        // Get active filter
        const activeFilter = document.querySelector('#batch-filter-options .filter-option.active');
        const filterType = activeFilter ? activeFilter.getAttribute('data-filter') : 'all';
        
        // Apply filter
        let filteredBatches = batches;
        if (filterType !== 'all') {
            filteredBatches = batches.filter(batch => {
                if (filterType === 'open') {
                    return batch.status === 'open';
                } else if (filterType === 'picking') {
                    return batch.status === 'picking' || 
                           (batch.picking_started_at && !batch.picking_completed_at);
                } else if (filterType === 'packing') {
                    return batch.status === 'packing' || 
                           (batch.picking_completed_at && !batch.closed_at);
                } else if (filterType === 'closed') {
                    return batch.status === 'closed' || batch.closed_at;
                }
                return true;
            });
        }
        
        // Clear existing content
        batchListBody.innerHTML = '';
        
        // Add batches to the list
        filteredBatches.forEach(batch => {
            const row = document.createElement('tr');
            
            // Calculate duration
            let duration = '';
            if (batch.closed_at) {
                const startTime = new Date(batch.created_at);
                const endTime = new Date(batch.closed_at);
                duration = formatDuration(endTime - startTime);
            } else if (batch.picking_started_at) {
                const startTime = new Date(batch.picking_started_at);
                const endTime = batch.picking_completed_at ? new Date(batch.picking_completed_at) : new Date();
                duration = formatDuration(endTime - startTime) + ' (ongoing)';
            } else {
                duration = 'Not started';
            }
            
            // Determine status class
            let statusClass = '';
            if (batch.status === 'closed' || batch.closed_at) {
                statusClass = 'status-closed';
            } else if (batch.status === 'picking' || (batch.picking_started_at && !batch.picking_completed_at)) {
                statusClass = 'status-picking';
            } else if (batch.status === 'packing' || (batch.picking_completed_at && !batch.closed_at)) {
                statusClass = 'status-packing';
            } else {
                statusClass = 'status-open';
            }
            
            row.innerHTML = `
                <td>${batch.batch_number}</td>
                <td class="${statusClass}">${batch.status || 'open'}</td>
                <td>${batch.picker_name || 'Unassigned'}</td>
                <td>${batch.packer_name || 'Unassigned'}</td>
                <td>${new Date(batch.created_at).toLocaleString()}</td>
                <td>${batch.closed_at ? new Date(batch.closed_at).toLocaleString() : 'In progress'}</td>
                <td>${duration}</td>
            `;
            
            batchListBody.appendChild(row);
        });
    }
    
    // Function to display batch error
    function displayBatchError(message) {
        const batchListBody = document.getElementById('batch-list-body');
        if (!batchListBody) return;
        
        batchListBody.innerHTML = `<tr><td colspan="7" class="error-message">Error: ${message}</td></tr>`;
    }
    
    // Function to filter batch list
    function filterBatchList(filterType) {
        // Re-fetch batches with the new filter
        fetchBatches();
    }
    
    // Function to trigger entity sync
    function triggerEntitySync(entityType) {
        console.log(`Triggering ${entityType} sync...`);
        fetch(`/api/sync/${entityType}`, { method: 'POST' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`${entityType} sync failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log(`${entityType} sync response:`, data);
                addLogEntry('success', `${entityType} sync started successfully`);
                // Refresh data after sync
                setTimeout(fetchBatches, 2000);
            })
            .catch(error => {
                console.error(`Error triggering ${entityType} sync:`, error);
                addLogEntry('error', `Error triggering ${entityType} sync: ${error.message}`);
            });
    }
    
    // Function to trigger entity full sync
    function triggerEntityFullSync(entityType) {
        console.log(`Triggering full ${entityType} sync...`);
        fetch(`/api/sync/${entityType}?full=true`, { method: 'POST' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Full ${entityType} sync failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log(`Full ${entityType} sync response:`, data);
                addLogEntry('success', `Full ${entityType} sync started successfully`);
                // Refresh data after sync
                setTimeout(fetchBatches, 2000);
            })
            .catch(error => {
                console.error(`Error triggering full ${entityType} sync:`, error);
                addLogEntry('error', `Error triggering full ${entityType} sync: ${error.message}`);
            });
    }
    
    // Function to add log entry
    function addLogEntry(level, message) {
        const logContainer = document.getElementById('log-container');
        if (!logContainer) return;
        
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${level}`;
        logEntry.textContent = `[${new Date().toLocaleString()}] ${message}`;
        logContainer.insertBefore(logEntry, logContainer.firstChild);
    }
    
    // Function to format duration
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
});
