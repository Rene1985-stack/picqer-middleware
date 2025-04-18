// Simple batch-ui-components.js - Compatible version for existing dashboard

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Only initialize if batches tab exists
    if (document.querySelector('.entity-tab[data-entity="batches"]')) {
        initializeBatchUI();
    } else {
        // Add batches tab if it doesn't exist
        addBatchesTab();
    }
});

// Add batches tab to entity tabs
function addBatchesTab() {
    const entityTabs = document.querySelector('.entity-tabs');
    if (!entityTabs) return;
    
    // Create batches tab
    const batchesTab = document.createElement('div');
    batchesTab.className = 'entity-tab';
    batchesTab.setAttribute('data-entity', 'batches');
    batchesTab.textContent = 'Batches';
    
    // Add click event listener
    batchesTab.addEventListener('click', function() {
        // Remove active class from all tabs
        document.querySelectorAll('.entity-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Add active class to batches tab
        batchesTab.classList.add('active');
        
        // Hide all entity content
        document.querySelectorAll('.entity-content').forEach(content => {
            content.classList.remove('active');
        });
        
        // Show batches content or create it if it doesn't exist
        let batchesContent = document.getElementById('batches-content');
        if (!batchesContent) {
            batchesContent = createBatchesContent();
        }
        batchesContent.classList.add('active');
        
        // Initialize batch UI
        initializeBatchUI();
    });
    
    // Add batches tab to entity tabs
    entityTabs.appendChild(batchesTab);
}

// Create batches content
function createBatchesContent() {
    const allContent = document.getElementById('all-content');
    if (!allContent) return null;
    
    // Create batches content
    const batchesContent = document.createElement('div');
    batchesContent.className = 'entity-content';
    batchesContent.id = 'batches-content';
    
    // Add batches content HTML
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
                <div class="stat-value" id="batches-last-sync-count">--</div>
                <div class="stat-label">Last Sync Count</div>
            </div>
        </div>
        
        <div class="card" style="margin-top: 20px;">
            <div class="card-header">
                <h2 class="card-title">Batch Productivity</h2>
            </div>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value" id="picker-productivity">--</div>
                    <div class="stat-label">Picker Items/Hour</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="packer-productivity">--</div>
                    <div class="stat-label">Packer Items/Hour</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="avg-picking-time">--</div>
                    <div class="stat-label">Avg. Picking Time (min)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="avg-packing-time">--</div>
                    <div class="stat-label">Avg. Packing Time (min)</div>
                </div>
            </div>
        </div>
        
        <div class="card" style="margin-top: 20px;">
            <div class="card-header">
                <h2 class="card-title">Batch List</h2>
                <div class="card-actions">
                    <div class="filter-dropdown">
                        <button class="btn btn-outline" id="batch-status-filter-btn">Status</button>
                        <div class="filter-dropdown-content" id="batch-status-filter-options">
                            <div class="filter-option active" data-filter="all">All</div>
                            <div class="filter-option" data-filter="open">Open</div>
                            <div class="filter-option" data-filter="picking">Picking</div>
                            <div class="filter-option" data-filter="packing">Packing</div>
                            <div class="filter-option" data-filter="closed">Closed</div>
                        </div>
                    </div>
                </div>
            </div>
            <div id="batch-list-container" style="max-height: 400px; overflow-y: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: var(--light-gray);">
                            <th style="padding: 10px; text-align: left;">ID</th>
                            <th style="padding: 10px; text-align: left;">Status</th>
                            <th style="padding: 10px; text-align: left;">Picker</th>
                            <th style="padding: 10px; text-align: left;">Packer</th>
                            <th style="padding: 10px; text-align: left;">Created</th>
                            <th style="padding: 10px; text-align: left;">Items</th>
                        </tr>
                    </thead>
                    <tbody id="batch-list">
                        <tr>
                            <td colspan="6" style="padding: 20px; text-align: center;">Loading batches...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    // Add batches content after all content
    allContent.parentNode.insertBefore(batchesContent, allContent.nextSibling);
    
    return batchesContent;
}

// Initialize batch UI
function initializeBatchUI() {
    // Update batch stats
    updateBatchStats();
    
    // Update batch productivity
    updateBatchProductivity();
    
    // Fetch batches
    fetchBatches();
    
    // Set up batch status filter
    setupBatchStatusFilter();
}

// Update batch stats
function updateBatchStats() {
    // Use existing dashboard API endpoint pattern
    fetch(`${window.location.origin}/api/batches/stats`)
        .then(response => {
            if (!response.ok) {
                // If endpoint doesn't exist, use fallback data
                return Promise.resolve({
                    stats: {
                        totalCount: 0,
                        lastSyncDate: 'Never',
                        status: 'Not Available',
                        lastSyncCount: 0
                    }
                });
            }
            return response.json();
        })
        .then(data => {
            // Update batch stats
            document.getElementById('batches-count').textContent = data.stats?.totalCount || 0;
            document.getElementById('batches-last-sync').textContent = formatDate(data.stats?.lastSyncDate) || 'Never';
            document.getElementById('batches-sync-status').textContent = data.stats?.status || 'Not Available';
            document.getElementById('batches-last-sync-count').textContent = data.stats?.lastSyncCount || 0;
        })
        .catch(error => {
            console.error('Error fetching batch stats:', error);
            // Use fallback data
            document.getElementById('batches-count').textContent = '0';
            document.getElementById('batches-last-sync').textContent = 'Never';
            document.getElementById('batches-sync-status').textContent = 'Not Available';
            document.getElementById('batches-last-sync-count').textContent = '0';
        });
}

// Update batch productivity
function updateBatchProductivity() {
    // Use existing dashboard API endpoint pattern
    fetch(`${window.location.origin}/api/batches/productivity`)
        .then(response => {
            if (!response.ok) {
                // If endpoint doesn't exist, use fallback data
                return Promise.resolve({
                    productivity: {
                        pickerProductivity: 0,
                        packerProductivity: 0,
                        avgPickingTime: 0,
                        avgPackingTime: 0
                    }
                });
            }
            return response.json();
        })
        .then(data => {
            // Update batch productivity
            document.getElementById('picker-productivity').textContent = 
                (data.productivity?.pickerProductivity || 0).toFixed(1);
            document.getElementById('packer-productivity').textContent = 
                (data.productivity?.packerProductivity || 0).toFixed(1);
            document.getElementById('avg-picking-time').textContent = 
                formatMinutes(data.productivity?.avgPickingTime || 0);
            document.getElementById('avg-packing-time').textContent = 
                formatMinutes(data.productivity?.avgPackingTime || 0);
        })
        .catch(error => {
            console.error('Error fetching batch productivity:', error);
            // Use fallback data
            document.getElementById('picker-productivity').textContent = '0.0';
            document.getElementById('packer-productivity').textContent = '0.0';
            document.getElementById('avg-picking-time').textContent = '0';
            document.getElementById('avg-packing-time').textContent = '0';
        });
}

// Fetch batches
function fetchBatches() {
    console.log('Fetching batches...');
    // Use existing dashboard API endpoint pattern
    fetch(`${window.location.origin}/api/batches`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Batches fetch failed: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Update batch list
            updateBatchList(data);
        })
        .catch(error => {
            console.error('Error fetching batches:', error);
            // Show error message
            document.getElementById('batch-list').innerHTML = `
                <tr>
                    <td colspan="6" style="padding: 20px; text-align: center;">
                        Failed to load batches. API endpoint not available.<br>
                        <small>This feature requires implementing the batch API endpoints.</small>
                    </td>
                </tr>
            `;
        });
}

// Update batch list
function updateBatchList(batches) {
    const batchList = document.getElementById('batch-list');
    if (!batchList) return;
    
    // If no batches, show message
    if (!batches || batches.length === 0) {
        batchList.innerHTML = `
            <tr>
                <td colspan="6" style="padding: 20px; text-align: center;">
                    No batches found. Sync batches to see them here.
                </td>
            </tr>
        `;
        return;
    }
    
    // Get active filter
    const activeFilter = document.querySelector('#batch-status-filter-options .filter-option.active');
    const filterType = activeFilter ? activeFilter.getAttribute('data-filter') : 'all';
    
    // Filter batches
    const filteredBatches = filterType === 'all' 
        ? batches 
        : batches.filter(batch => batch.status === filterType);
    
    // If no filtered batches, show message
    if (filteredBatches.length === 0) {
        batchList.innerHTML = `
            <tr>
                <td colspan="6" style="padding: 20px; text-align: center;">
                    No batches found with status "${filterType}".
                </td>
            </tr>
        `;
        return;
    }
    
    // Build batch list HTML
    let html = '';
    filteredBatches.forEach(batch => {
        html += `
            <tr style="border-bottom: 1px solid var(--light-gray);">
                <td style="padding: 10px;">${batch.id}</td>
                <td style="padding: 10px;">${formatStatus(batch.status)}</td>
                <td style="padding: 10px;">${batch.assigned_picker_name || 'N/A'}</td>
                <td style="padding: 10px;">${batch.assigned_packer_name || 'N/A'}</td>
                <td style="padding: 10px;">${formatDate(batch.created_at)}</td>
                <td style="padding: 10px;">${batch.item_count || 0}</td>
            </tr>
        `;
    });
    
    // Update batch list
    batchList.innerHTML = html;
}

// Setup batch status filter
function setupBatchStatusFilter() {
    const filterOptions = document.querySelectorAll('#batch-status-filter-options .filter-option');
    
    filterOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove active class from all options
            filterOptions.forEach(o => o.classList.remove('active'));
            // Add active class to clicked option
            option.classList.add('active');
            
            // Fetch batches again to apply filter
            fetchBatches();
        });
    });
}

// Format date
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleString();
    } catch (error) {
        return dateString;
    }
}

// Format minutes
function formatMinutes(milliseconds) {
    if (!milliseconds) return '0';
    
    try {
        return Math.round(milliseconds / 60000);
    } catch (error) {
        return '0';
    }
}

// Format status
function formatStatus(status) {
    if (!status) return 'Unknown';
    
    const statusMap = {
        'open': 'Open',
        'picking': 'Picking',
        'packing': 'Packing',
        'closed': 'Closed'
    };
    
    return statusMap[status] || status;
}
