// batch-metrics-display.js - Enhanced metrics display for batch tracking

document.addEventListener('DOMContentLoaded', function() {
    // API endpoints
    const API_BASE = window.location.origin;
    const ENDPOINTS = {
        batchMetrics: `${API_BASE}/api/batches/metrics`,
        batchProductivity: `${API_BASE}/api/batches/productivity`,
        batchStats: `${API_BASE}/api/batches/stats`
    };
    
    // Initialize batch metrics display
    initializeBatchMetricsDisplay();
    
    // Set up polling for metrics updates
    setInterval(updateBatchMetrics, 30000);
    
    // Initialize batch metrics display
    function initializeBatchMetricsDisplay() {
        // Create metrics containers for batch tab
        createBatchMetricsContainers();
        
        // Fetch initial metrics
        updateBatchMetrics();
        
        // Add event listeners for metrics refresh buttons
        document.querySelectorAll('.refresh-metrics-btn[data-entity="batches"]').forEach(button => {
            button.addEventListener('click', function() {
                updateBatchMetrics();
            });
        });
    }
    
    // Create metrics containers for batch tab
    function createBatchMetricsContainers() {
        // Create metrics container for batches tab if it doesn't exist
        if (!document.querySelector('#batches-metrics-grid')) {
            const batchesContent = document.getElementById('batches-content');
            if (!batchesContent) return;
            
            const metricsContainer = document.createElement('div');
            metricsContainer.className = 'metrics-container';
            metricsContainer.innerHTML = `
                <div class="card-header">
                    <h3 class="card-title">Batch Performance Metrics</h3>
                    <div class="card-actions">
                        <button class="btn btn-outline refresh-metrics-btn" data-entity="batches">
                            Refresh Metrics
                        </button>
                    </div>
                </div>
                <div class="metrics-grid" id="batches-metrics-grid">
                    <div class="loading-metrics">Loading metrics...</div>
                </div>
            `;
            
            batchesContent.appendChild(metricsContainer);
        }
    }
    
    // Update batch metrics
    function updateBatchMetrics() {
        // Update batch metrics
        fetchBatchMetrics();
        
        // Update batch productivity
        fetchBatchProductivity();
        
        // Update batch statistics
        fetchBatchStats();
    }
    
    // Fetch batch metrics
    function fetchBatchMetrics() {
        fetch(ENDPOINTS.batchMetrics)
            .then(response => response.json())
            .then(data => {
                displayBatchMetrics(data);
            })
            .catch(error => {
                console.error('Error fetching batch metrics:', error);
                displayBatchMetricsError();
            });
    }
    
    // Fetch batch productivity
    function fetchBatchProductivity() {
        fetch(ENDPOINTS.batchProductivity)
            .then(response => response.json())
            .then(data => {
                displayBatchProductivity(data);
            })
            .catch(error => {
                console.error('Error fetching batch productivity:', error);
                displayBatchProductivityError();
            });
    }
    
    // Fetch batch statistics
    function fetchBatchStats() {
        fetch(ENDPOINTS.batchStats)
            .then(response => response.json())
            .then(data => {
                displayBatchStats(data);
            })
            .catch(error => {
                console.error('Error fetching batch stats:', error);
                displayBatchStatsError();
            });
    }
    
    // Display batch metrics
    function displayBatchMetrics(data) {
        const metricsGrid = document.getElementById('batches-metrics-grid');
        if (!metricsGrid) return;
        
        // Clear loading message
        metricsGrid.innerHTML = '';
        
        // Create metrics cards
        createMetricCard(metricsGrid, 'Success Rate', `${data.successRate || 0}%`);
        createMetricCard(metricsGrid, 'Avg Sync Time', formatDuration(data.avgSyncTime));
        createMetricCard(metricsGrid, 'Batches Per Day', data.batchesPerDay || 0);
        createMetricCard(metricsGrid, 'Error Rate', `${data.errorRate || 0}%`);
        
        // Add batch-specific metrics
        createMetricCard(metricsGrid, 'Avg Batch Size', data.avgBatchSize || 0);
        createMetricCard(metricsGrid, 'Completed Batches', data.completedBatches || 0);
        
        // Add sync history chart if data available
        if (data.syncHistory && data.syncHistory.length > 0) {
            createSyncHistoryChart(metricsGrid, 'batches', data.syncHistory);
        }
    }
    
    // Display batch productivity
    function displayBatchProductivity(data) {
        if (!data || !data.productivity) return;
        
        const productivity = data.productivity;
        
        // Update picker productivity
        const pickerProductivity = document.getElementById('picker-productivity');
        if (pickerProductivity) {
            pickerProductivity.textContent = productivity.pickerProductivity?.toFixed(2) || '0.00';
        }
        
        // Update packer productivity
        const packerProductivity = document.getElementById('packer-productivity');
        if (packerProductivity) {
            packerProductivity.textContent = productivity.packerProductivity?.toFixed(2) || '0.00';
        }
        
        // Update average picking time
        const avgPickingTime = document.getElementById('avg-picking-time');
        if (avgPickingTime) {
            avgPickingTime.textContent = formatDuration(productivity.avgPickingTime);
        }
        
        // Update average packing time
        const avgPackingTime = document.getElementById('avg-packing-time');
        if (avgPackingTime) {
            avgPackingTime.textContent = formatDuration(productivity.avgPackingTime);
        }
        
        // Create productivity charts if data available
        if (productivity.timeData && productivity.timeData.length > 0) {
            createProductivityCharts(productivity);
        }
    }
    
    // Display batch statistics
    function displayBatchStats(data) {
        if (!data || !data.stats) return;
        
        const stats = data.stats;
        
        // Update batch count
        const batchesCount = document.getElementById('batches-count');
        if (batchesCount) {
            batchesCount.textContent = stats.totalCount || 0;
        }
        
        // Update total batches in all tab
        const totalBatches = document.getElementById('total-batches');
        if (totalBatches) {
            totalBatches.textContent = stats.totalCount || 0;
        }
        
        // Update last sync date
        const batchesLastSync = document.getElementById('batches-last-sync');
        if (batchesLastSync && stats.lastSyncDate) {
            batchesLastSync.textContent = new Date(stats.lastSyncDate).toLocaleString();
        }
        
        // Update sync status
        const batchesSyncStatus = document.getElementById('batches-sync-status');
        if (batchesSyncStatus) {
            batchesSyncStatus.textContent = stats.status || 'Ready';
        }
        
        // Update last sync count
        const batchesSyncCount = document.getElementById('batches-sync-count');
        if (batchesSyncCount) {
            batchesSyncCount.textContent = stats.lastSyncCount || 0;
        }
        
        // Update progress bar
        const batchesProgressBar = document.getElementById('batches-progress-bar');
        if (batchesProgressBar && stats.syncProgress) {
            const progress = Math.min(
                Math.round((stats.syncProgress.itemsProcessed / stats.syncProgress.totalItems) * 100),
                100
            );
            batchesProgressBar.style.width = `${progress}%`;
            batchesProgressBar.setAttribute('title', `${progress}% complete`);
        } else if (batchesProgressBar) {
            batchesProgressBar.style.width = '0%';
            batchesProgressBar.setAttribute('title', 'No sync in progress');
        }
    }
    
    // Display batch metrics error
    function displayBatchMetricsError() {
        const metricsGrid = document.getElementById('batches-metrics-grid');
        if (!metricsGrid) return;
        
        metricsGrid.innerHTML = '<div class="metrics-error">Error loading batch metrics</div>';
    }
    
    // Display batch productivity error
    function displayBatchProductivityError() {
        const pickerProductivity = document.getElementById('picker-productivity');
        const packerProductivity = document.getElementById('packer-productivity');
        const avgPickingTime = document.getElementById('avg-picking-time');
        const avgPackingTime = document.getElementById('avg-packing-time');
        
        if (pickerProductivity) pickerProductivity.textContent = 'Error';
        if (packerProductivity) packerProductivity.textContent = 'Error';
        if (avgPickingTime) avgPickingTime.textContent = 'Error';
        if (avgPackingTime) avgPackingTime.textContent = 'Error';
    }
    
    // Display batch stats error
    function displayBatchStatsError() {
        const batchesCount = document.getElementById('batches-count');
        const totalBatches = document.getElementById('total-batches');
        const batchesLastSync = document.getElementById('batches-last-sync');
        const batchesSyncStatus = document.getElementById('batches-sync-status');
        const batchesSyncCount = document.getElementById('batches-sync-count');
        
        if (batchesCount) batchesCount.textContent = 'Error';
        if (totalBatches) totalBatches.textContent = 'Error';
        if (batchesLastSync) batchesLastSync.textContent = 'Error';
        if (batchesSyncStatus) batchesSyncStatus.textContent = 'Error';
        if (batchesSyncCount) batchesSyncCount.textContent = 'Error';
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
                            text: 'Batches Synced'
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
                        text: 'Batch Sync History'
                    },
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
    
    // Create productivity charts
    function createProductivityCharts(productivity) {
        // Check if productivity-charts container exists, if not create it
        let productivityCharts = document.querySelector('.productivity-charts');
        if (!productivityCharts) {
            const batchesContent = document.getElementById('batches-content');
            if (!batchesContent) return;
            
            productivityCharts = document.createElement('div');
            productivityCharts.className = 'productivity-charts';
            
            // Create picker productivity chart container
            const pickerChartContainer = document.createElement('div');
            pickerChartContainer.className = 'chart-container';
            
            const pickerCanvas = document.createElement('canvas');
            pickerCanvas.id = 'picker-productivity-chart';
            pickerCanvas.height = 200;
            
            pickerChartContainer.appendChild(pickerCanvas);
            
            // Create packer productivity chart container
            const packerChartContainer = document.createElement('div');
            packerChartContainer.className = 'chart-container';
            
            const packerCanvas = document.createElement('canvas');
            packerCanvas.id = 'packer-productivity-chart';
            packerCanvas.height = 200;
            
            packerChartContainer.appendChild(packerCanvas);
            
            // Add chart containers to productivity charts
            productivityCharts.appendChild(pickerChartContainer);
            productivityCharts.appendChild(packerChartContainer);
            
            // Add productivity charts to batches content
            batchesContent.appendChild(productivityCharts);
        }
        
        // Create picker productivity chart
        createProductivityChart('picker-productivity-chart', 'Picker Productivity', productivity.timeData, 'pickerData');
        
        // Create packer productivity chart
        createProductivityChart('packer-productivity-chart', 'Packer Productivity', productivity.timeData, 'packerData');
    }
    
    // Create productivity chart
    function createProductivityChart(canvasId, title, timeData, dataKey) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        // Prepare data for chart
        const labels = timeData.map(item => {
            const date = new Date(item.date);
            return `${date.getMonth() + 1}/${date.getDate()}`;
        });
        
        const data = timeData.map(item => item[dataKey] || 0);
        
        // Create chart
        new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: title,
                        data: data,
                        backgroundColor: dataKey === 'pickerData' ? 'rgba(54, 162, 235, 0.2)' : 'rgba(255, 99, 132, 0.2)',
                        borderColor: dataKey === 'pickerData' ? 'rgba(54, 162, 235, 1)' : 'rgba(255, 99, 132, 1)',
                        borderWidth: 2,
                        tension: 0.4
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
                            text: 'Items per Hour'
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
                        text: title
                    },
                    legend: {
                        display: false
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
