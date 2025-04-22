/**
 * Batch Charts Implementation
 * 
 * This file provides Chart.js implementations for the batch metrics dashboard.
 * It creates visualizations for sync history, picker productivity, and packer productivity.
 */

document.addEventListener('DOMContentLoaded', function() {
    // API endpoints
    const API_BASE = window.location.origin;
    const ENDPOINTS = {
        batchMetrics: `${API_BASE}/api/batches/metrics`,
        batchProductivity: `${API_BASE}/api/batches/productivity`
    };
    
    // Initialize charts
    initializeCharts();
    
    // Set up polling for chart data updates
    setInterval(updateCharts, 60000); // Update every minute
    
    /**
     * Initialize all charts
     */
    function initializeCharts() {
        // Fetch initial data for charts
        fetchChartData();
        
        // Add event listeners for chart refresh buttons
        document.querySelectorAll('.refresh-charts-btn').forEach(button => {
            button.addEventListener('click', function() {
                fetchChartData();
            });
        });
    }
    
    /**
     * Fetch data for all charts
     */
    function fetchChartData() {
        // Show loading indicators
        showChartLoading();
        
        // Fetch batch metrics for sync history chart
        fetch(ENDPOINTS.batchMetrics)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Metrics fetch failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // Create sync history chart
                if (data.syncHistory && data.syncHistory.length > 0) {
                    createSyncHistoryChart(data.syncHistory);
                }
            })
            .catch(error => {
                console.error('Error fetching batch metrics:', error);
                showChartError('sync-history-chart-container', 'Error loading sync history data');
            });
        
        // Fetch batch productivity for productivity charts
        fetch(ENDPOINTS.batchProductivity)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Productivity fetch failed: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.productivity && data.productivity.timeData && data.productivity.timeData.length > 0) {
                    // Create picker productivity chart
                    createPickerProductivityChart(data.productivity.timeData);
                    
                    // Create packer productivity chart
                    createPackerProductivityChart(data.productivity.timeData);
                }
            })
            .catch(error => {
                console.error('Error fetching batch productivity:', error);
                showChartError('picker-productivity-chart-container', 'Error loading picker productivity data');
                showChartError('packer-productivity-chart-container', 'Error loading packer productivity data');
            });
    }
    
    /**
     * Update all charts with fresh data
     */
    function updateCharts() {
        fetchChartData();
    }
    
    /**
     * Show loading indicators for charts
     */
    function showChartLoading() {
        const chartContainers = [
            'sync-history-chart-container',
            'picker-productivity-chart-container',
            'packer-productivity-chart-container'
        ];
        
        chartContainers.forEach(containerId => {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '<div class="chart-loading">Loading chart data...</div>';
            }
        });
    }
    
    /**
     * Show error message for a specific chart
     */
    function showChartError(containerId, errorMessage) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `<div class="chart-error">${errorMessage}</div>`;
        }
    }
    
    /**
     * Create sync history chart
     */
    function createSyncHistoryChart(syncHistory) {
        // Get or create chart container
        let chartContainer = document.getElementById('sync-history-chart-container');
        if (!chartContainer) {
            chartContainer = document.createElement('div');
            chartContainer.id = 'sync-history-chart-container';
            chartContainer.className = 'chart-container';
            
            // Find a suitable parent element to append the chart container
            const metricsGrid = document.getElementById('batches-metrics-grid');
            if (metricsGrid) {
                metricsGrid.appendChild(chartContainer);
            } else {
                const batchesContent = document.getElementById('batches-content');
                if (batchesContent) {
                    batchesContent.appendChild(chartContainer);
                } else {
                    // If no suitable parent is found, append to body
                    document.body.appendChild(chartContainer);
                }
            }
        }
        
        // Clear container
        chartContainer.innerHTML = '';
        
        // Create canvas for chart
        const canvas = document.createElement('canvas');
        canvas.id = 'sync-history-chart';
        chartContainer.appendChild(canvas);
        
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
    
    /**
     * Create picker productivity chart
     */
    function createPickerProductivityChart(timeData) {
        // Get or create chart container
        let chartContainer = document.getElementById('picker-productivity-chart-container');
        if (!chartContainer) {
            chartContainer = document.createElement('div');
            chartContainer.id = 'picker-productivity-chart-container';
            chartContainer.className = 'chart-container';
            
            // Find a suitable parent element to append the chart container
            const productivityCharts = document.querySelector('.productivity-charts');
            if (productivityCharts) {
                productivityCharts.appendChild(chartContainer);
            } else {
                // Create productivity charts container if it doesn't exist
                const newProductivityCharts = document.createElement('div');
                newProductivityCharts.className = 'productivity-charts';
                
                newProductivityCharts.appendChild(chartContainer);
                
                const batchesContent = document.getElementById('batches-content');
                if (batchesContent) {
                    batchesContent.appendChild(newProductivityCharts);
                } else {
                    // If no suitable parent is found, append to body
                    document.body.appendChild(newProductivityCharts);
                }
            }
        }
        
        // Clear container
        chartContainer.innerHTML = '';
        
        // Create canvas for chart
        const canvas = document.createElement('canvas');
        canvas.id = 'picker-productivity-chart';
        chartContainer.appendChild(canvas);
        
        // Prepare data for chart
        const labels = timeData.map(item => {
            const date = new Date(item.date);
            return `${date.getMonth() + 1}/${date.getDate()}`;
        });
        
        const data = timeData.map(item => item.pickerData || 0);
        
        // Create chart
        new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Items Per Hour',
                        data: data,
                        backgroundColor: 'rgba(0, 123, 255, 0.2)',
                        borderColor: 'rgba(0, 123, 255, 1)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: true
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
                            text: 'Items Per Hour'
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
                        text: 'Picker Productivity'
                    },
                    legend: {
                        display: false
                    }
                }
            }
        });
    }
    
    /**
     * Create packer productivity chart
     */
    function createPackerProductivityChart(timeData) {
        // Get or create chart container
        let chartContainer = document.getElementById('packer-productivity-chart-container');
        if (!chartContainer) {
            chartContainer = document.createElement('div');
            chartContainer.id = 'packer-productivity-chart-container';
            chartContainer.className = 'chart-container';
            
            // Find a suitable parent element to append the chart container
            const productivityCharts = document.querySelector('.productivity-charts');
            if (productivityCharts) {
                productivityCharts.appendChild(chartContainer);
            } else {
                // Create productivity charts container if it doesn't exist
                const newProductivityCharts = document.createElement('div');
                newProductivityCharts.className = 'productivity-charts';
                
                newProductivityCharts.appendChild(chartContainer);
                
                const batchesContent = document.getElementById('batches-content');
                if (batchesContent) {
                    batchesContent.appendChild(newProductivityCharts);
                } else {
                    // If no suitable parent is found, append to body
                    document.body.appendChild(newProductivityCharts);
                }
            }
        }
        
        // Clear container
        chartContainer.innerHTML = '';
        
        // Create canvas for chart
        const canvas = document.createElement('canvas');
        canvas.id = 'packer-productivity-chart';
        chartContainer.appendChild(canvas);
        
        // Prepare data for chart
        const labels = timeData.map(item => {
            const date = new Date(item.date);
            return `${date.getMonth() + 1}/${date.getDate()}`;
        });
        
        const data = timeData.map(item => item.packerData || 0);
        
        // Create chart
        new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Items Per Hour',
                        data: data,
                        backgroundColor: 'rgba(40, 167, 69, 0.2)',
                        borderColor: 'rgba(40, 167, 69, 1)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: true
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
                            text: 'Items Per Hour'
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
                        text: 'Packer Productivity'
                    },
                    legend: {
                        display: false
                    }
                }
            }
        });
    }
});
