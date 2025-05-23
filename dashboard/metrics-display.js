// metrics-display.js - Enhanced metrics display for the middleware dashboard

// This script extends the dashboard functionality to display additional metrics
// for all entity types (products, picklists, warehouses, users, suppliers)

document.addEventListener('DOMContentLoaded', function() {
    // API endpoints
    const API_BASE = window.location.origin;
    const ENDPOINTS = {
        metrics: `${API_BASE}/api/metrics`,
        entityMetrics: (entity) => `${API_BASE}/api/metrics/${entity}`,
        syncStats: `${API_BASE}/api/sync/stats`
    };
    
    // Initialize metrics display
    initializeMetricsDisplay();
    
    // Set up polling for metrics updates
    setInterval(updateAllMetrics, 30000);
    
    // Initialize metrics display
    function initializeMetricsDisplay() {
        // Create metrics containers for each entity tab
        createEntityMetricsContainers();
        
        // Fetch initial metrics
        updateAllMetrics();
        
        // Add event listeners for metrics refresh buttons
        document.querySelectorAll('.refresh-metrics-btn').forEach(button => {
            button.addEventListener('click', function() {
                const entityType = this.getAttribute('data-entity');
                if (entityType === 'all') {
                    updateAllMetrics();
                } else {
                    updateEntityMetrics(entityType);
                }
            });
        });
    }
    
    // Create metrics containers for each entity tab
    function createEntityMetricsContainers() {
        const entityTypes = ['products', 'picklists', 'warehouses', 'users', 'suppliers'];
        
        // Create metrics container for all entities tab
        createMetricsContainer('all-content', 'all');
        
        // Create metrics containers for each entity tab
        entityTypes.forEach(entityType => {
            createMetricsContainer(`${entityType}-content`, entityType);
        });
    }
    
    // Create metrics container for an entity tab
    function createMetricsContainer(contentId, entityType) {
        const contentElement = document.getElementById(contentId);
        if (!contentElement) return;
        
        // Check if metrics container already exists
        if (contentElement.querySelector('.metrics-container')) return;
        
        // Create metrics container
        const metricsContainer = document.createElement('div');
        metricsContainer.className = 'metrics-container';
        metricsContainer.innerHTML = `
            <div class="card-header">
                <h3 class="card-title">Performance Metrics</h3>
                <div class="card-actions">
                    <button class="btn btn-outline refresh-metrics-btn" data-entity="${entityType}">
                        Refresh Metrics
                    </button>
                </div>
            </div>
            <div class="metrics-grid" id="${entityType}-metrics-grid">
                <div class="loading-metrics">Loading metrics...</div>
            </div>
        `;
        
        // Add metrics container to content element
        contentElement.appendChild(metricsContainer);
    }
    
    // Update all metrics
    function updateAllMetrics() {
        // Update metrics for all entities
        updateEntityMetrics('all');
        
        // Update metrics for each entity type
        const entityTypes = ['products', 'picklists', 'warehouses', 'users', 'suppliers'];
        entityTypes.forEach(entityType => {
            updateEntityMetrics(entityType);
        });
        
        // Update sync statistics
        updateSyncStats();
    }
    
    // Update metrics for a specific entity type
    function updateEntityMetrics(entityType) {
        const endpoint = entityType === 'all' ? ENDPOINTS.metrics : ENDPOINTS.entityMetrics(entityType);
        
        fetch(endpoint)
            .then(response => response.json())
            .then(data => {
                displayEntityMetrics(entityType, data);
            })
            .catch(error => {
                console.error(`Error fetching ${entityType} metrics:`, error);
                displayMetricsError(entityType);
            });
    }
    
    // Update sync statistics
    function updateSyncStats() {
        fetch(ENDPOINTS.syncStats)
            .then(response => response.json())
            .then(data => {
                displaySyncStats(data);
            })
            .catch(error => {
                console.error('Error fetching sync stats:', error);
            });
    }
    
    // Display metrics for a specific entity type
    function displayEntityMetrics(entityType, data) {
        const metricsGrid = document.getElementById(`${entityType}-metrics-grid`);
        if (!metricsGrid) return;
        
        // Clear loading message
        metricsGrid.innerHTML = '';
        
        // Create metrics cards
        if (entityType === 'all') {
            // Display overall metrics for all entities
            createMetricCard(metricsGrid, 'Total Syncs', data.totalSyncs || 0);
            createMetricCard(metricsGrid, 'Success Rate', `${data.successRate || 0}%`);
            createMetricCard(metricsGrid, 'Avg Sync Time', formatDuration(data.avgSyncTime));
            createMetricCard(metricsGrid, 'Total Errors', data.totalErrors || 0);
        } else {
            // Display entity-specific metrics
            createMetricCard(metricsGrid, 'Success Rate', `${data.successRate || 0}%`);
            createMetricCard(metricsGrid, 'Avg Sync Time', formatDuration(data.avgSyncTime));
            createMetricCard(metricsGrid, 'Items Per Minute', data.itemsPerMinute || 0);
            createMetricCard(metricsGrid, 'Error Rate', `${data.errorRate || 0}%`);
            
            // Add entity-specific metrics
            if (entityType === 'products') {
                createMetricCard(metricsGrid, 'Stock Accuracy', `${data.stockAccuracy || 0}%`);
                createMetricCard(metricsGrid, 'Price Updates', data.priceUpdates || 0);
            } else if (entityType === 'picklists') {
                createMetricCard(metricsGrid, 'Completed Picklists', data.completedPicklists || 0);
                createMetricCard(metricsGrid, 'Processing Time', formatDuration(data.processingTime));
            } else if (entityType === 'warehouses') {
                createMetricCard(metricsGrid, 'Stock Movements', data.stockMovements || 0);
                createMetricCard(metricsGrid, 'Active Warehouses', data.activeWarehouses || 0);
            } else if (entityType === 'users') {
                createMetricCard(metricsGrid, 'Active Users', data.activeUsers || 0);
                createMetricCard(metricsGrid, 'User Logins', data.userLogins || 0);
            } else if (entityType === 'suppliers') {
                createMetricCard(metricsGrid, 'Active Suppliers', data.activeSuppliers || 0);
                createMetricCard(metricsGrid, 'Product Coverage', `${data.productCoverage || 0}%`);
            }
        }
        
        // Add sync history chart if data available
        if (data.syncHistory && data.syncHistory.length > 0) {
            createSyncHistoryChart(metricsGrid, entityType, data.syncHistory);
        }
    }
    
    // Display sync statistics
    function displaySyncStats(data) {
        // Update sync progress bars for each entity
        const entityTypes = ['products', 'picklists', 'warehouses', 'users', 'suppliers'];
        
        entityTypes.forEach(entityType => {
            const progressBar = document.getElementById(`${entityType}-progress-bar`);
            if (!progressBar) return;
            
            const entityProgress = data[entityType];
            if (entityProgress && entityProgress.inProgress) {
                const progress = Math.min(
                    Math.round((entityProgress.itemsProcessed / entityProgress.totalItems) * 100),
                    100
                );
                progressBar.style.width = `${progress}%`;
                progressBar.setAttribute('title', `${progress}% complete`);
            } else {
                progressBar.style.width = '0%';
                progressBar.setAttribute('title', 'No sync in progress');
            }
        });
        
        // Update overall sync status
        const overallStatus = document.getElementById('sync-status');
        if (overallStatus) {
            overallStatus.textContent = data.anySyncInProgress ? 'Running' : 'Ready';
        }
    }
    
    // Display metrics error
    function displayMetricsError(entityType) {
        const metricsGrid = document.getElementById(`${entityType}-metrics-grid`);
        if (!metricsGrid) return;
        
        metricsGrid.innerHTML = '<div class="metrics-error">Error loading metrics</div>';
    }
    
    // Create a metric card
    function createMetricCard(container, label, value) {
        const metricCard = document.createElement('div');
        metricCard.className = 'metric-card';
        
        metricCard.innerHTML = `
            <div class="metric-value">${value}</div>
            <div class="metric-label">${label}</div>
        `;
        
        container.appendChild(metricCard);
    }
    
    // Create sync history chart
    function createSyncHistoryChart(container, entityType, syncHistory) {
        const chartContainer = document.createElement('div');
        chartContainer.className = 'chart-container';
        chartContainer.style.gridColumn = '1 / -1';
        
        const canvas = document.createElement('canvas');
        canvas.id = `${entityType}-sync-chart`;
        canvas.height = 200;
        
        chartContainer.appendChild(canvas);
        container.appendChild(chartContainer);
        
        // Prepare data for chart
        const labels = syncHistory.map(item => {
            const date = new Date(item.timestamp);
            return `${date.getMonth() + 1}/${date.getDate()}`;
        });
        
        const successData = syncHistory.map(item => item.success ? item.count : 0);
        const errorData = syncHistory.map(item => !item.success ? item.count : 0);
        
        // Create chart
        new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Successful Syncs',
                        data: successData,
                        backgroundColor: '#28a745',
                        borderColor: '#28a745',
                        borderWidth: 1
                    },
                    {
                        label: 'Failed Syncs',
                        data: errorData,
                        backgroundColor: '#dc3545',
                        borderColor: '#dc3545',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Items Synced'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} Sync History`
                    },
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
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
});
