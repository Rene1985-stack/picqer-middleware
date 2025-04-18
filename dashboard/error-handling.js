// Fixed error-handling.js - Removed problematic CSS selector

document.addEventListener('DOMContentLoaded', function() {
    // API endpoints
    const API_BASE = window.location.origin;
    const ENDPOINTS = {
        errors: `${API_BASE}/api/errors`,
        errorsByEntity: (entity) => `${API_BASE}/api/errors/${entity}`,
        retrySync: (syncId) => `${API_BASE}/api/sync/retry/${syncId}`,
        errorDetails: (errorId) => `${API_BASE}/api/errors/details/${errorId}`
    };
    
    // Initialize error handling
    initializeErrorHandling();
    
    // Set up polling for error updates
    setInterval(updateAllErrors, 30000);
    
    // Initialize error handling
    function initializeErrorHandling() {
        // Create error filter UI
        createErrorFilterUI();
        
        // Add event listeners for error filter buttons
        setupErrorFilterListeners();
        
        // Add event listeners for retry buttons
        setupRetryListeners();
        
        // Fetch initial errors
        updateAllErrors();
    }
    
    // Create error filter UI
    function createErrorFilterUI() {
        // Add error filter dropdown to sync history section - FIXED SELECTOR
        const syncHistoryHeaders = document.querySelectorAll('.card-header');
        let syncHistoryHeader = null;
        
        // Find the sync history header by looking for the card title text
        for (const header of syncHistoryHeaders) {
            const cardTitle = header.querySelector('.card-title');
            if (cardTitle && cardTitle.textContent.includes('Sync History')) {
                syncHistoryHeader = header;
                break;
            }
        }
        
        if (syncHistoryHeader) {
            const filterDropdown = document.createElement('div');
            filterDropdown.className = 'filter-dropdown';
            filterDropdown.innerHTML = `
                <button class="btn btn-outline" id="error-filter-btn">Error Filter</button>
                <div class="filter-dropdown-content" id="error-filter-options">
                    <div class="filter-option active" data-filter="all">All Errors</div>
                    <div class="filter-option" data-filter="api">API Errors</div>
                    <div class="filter-option" data-filter="database">Database Errors</div>
                    <div class="filter-option" data-filter="timeout">Timeout Errors</div>
                    <div class="filter-option" data-filter="validation">Validation Errors</div>
                    <div class="filter-option" data-filter="other">Other Errors</div>
                </div>
            `;
            
            syncHistoryHeader.querySelector('.card-actions').appendChild(filterDropdown);
        }
        
        // Add error details modal to body
        const errorModal = document.createElement('div');
        errorModal.id = 'error-details-modal';
        errorModal.className = 'modal';
        errorModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Error Details</h3>
                    <span class="close-modal">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="error-info">
                        <p><strong>Error ID:</strong> <span id="error-id"></span></p>
                        <p><strong>Entity Type:</strong> <span id="error-entity"></span></p>
                        <p><strong>Timestamp:</strong> <span id="error-timestamp"></span></p>
                        <p><strong>Error Type:</strong> <span id="error-type"></span></p>
                    </div>
                    <div class="error-message">
                        <h4>Error Message</h4>
                        <pre id="error-message"></pre>
                    </div>
                    <div class="error-stack">
                        <h4>Stack Trace</h4>
                        <pre id="error-stack"></pre>
                    </div>
                    <div class="error-context">
                        <h4>Context</h4>
                        <pre id="error-context"></pre>
                    </div>
                    <div class="error-actions">
                        <button class="btn btn-primary" id="modal-retry-btn">Retry Sync</button>
                        <button class="btn btn-outline" id="modal-close-btn">Close</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(errorModal);
        
        // Add modal styles
        const modalStyles = document.createElement('style');
        modalStyles.textContent = `
            .modal {
                display: none;
                position: fixed;
                z-index: 1000;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
            }
            
            .modal-content {
                background-color: white;
                margin: 10% auto;
                padding: 0;
                border-radius: 8px;
                width: 80%;
                max-width: 800px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
            }
            
            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px 20px;
                border-bottom: 1px solid var(--light-gray);
            }
            
            .modal-header h3 {
                margin: 0;
                color: var(--secondary);
            }
            
            .close-modal {
                font-size: 24px;
                font-weight: bold;
                color: var(--gray);
                cursor: pointer;
            }
            
            .modal-body {
                padding: 20px;
            }
            
            .error-info {
                margin-bottom: 20px;
            }
            
            .error-message, .error-stack, .error-context {
                margin-bottom: 20px;
            }
            
            .error-message h4, .error-stack h4, .error-context h4 {
                margin-bottom: 10px;
                color: var(--secondary);
            }
            
            .error-message pre, .error-stack pre, .error-context pre {
                background-color: var(--light-gray);
                padding: 10px;
                border-radius: 4px;
                overflow-x: auto;
                white-space: pre-wrap;
                word-wrap: break-word;
            }
            
            .error-actions {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                margin-top: 20px;
            }
            
            .error-badge {
                display: inline-block;
                background-color: var(--danger);
                color: white;
                border-radius: 50%;
                width: 18px;
                height: 18px;
                font-size: 12px;
                text-align: center;
                line-height: 18px;
                margin-left: 5px;
            }
        `;
        
        document.head.appendChild(modalStyles);
    }
    
    // Setup error filter listeners
    function setupErrorFilterListeners() {
        const filterOptions = document.querySelectorAll('#error-filter-options .filter-option');
        
        filterOptions.forEach(option => {
            option.addEventListener('click', () => {
                // Remove active class from all options
                filterOptions.forEach(o => o.classList.remove('active'));
                // Add active class to clicked option
                option.classList.add('active');
                
                // Apply filter to errors
                const filterType = option.getAttribute('data-filter');
                filterErrors(filterType);
            });
        });
    }
    
    // Setup retry listeners
    function setupRetryListeners() {
        // Global event delegation for retry buttons
        document.addEventListener('click', function(event) {
            if (event.target.classList.contains('retry-btn')) {
                const syncId = event.target.getAttribute('data-sync-id');
                if (syncId) {
                    retrySync(syncId);
                }
            }
        });
        
        // Modal retry button
        const modalRetryBtn = document.getElementById('modal-retry-btn');
        if (modalRetryBtn) {
            modalRetryBtn.addEventListener('click', function() {
                const syncId = this.getAttribute('data-sync-id');
                if (syncId) {
                    retrySync(syncId);
                    closeErrorModal();
                }
            });
        }
        
        // Modal close button
        const modalCloseBtn = document.getElementById('modal-close-btn');
        if (modalCloseBtn) {
            modalCloseBtn.addEventListener('click', closeErrorModal);
        }
        
        // Modal close icon
        const closeModal = document.querySelector('.close-modal');
        if (closeModal) {
            closeModal.addEventListener('click', closeErrorModal);
        }
        
        // Close modal when clicking outside
        window.addEventListener('click', function(event) {
            const modal = document.getElementById('error-details-modal');
            if (event.target === modal) {
                closeErrorModal();
            }
        });
    }
    
    // Update all errors
    function updateAllErrors() {
        fetch(ENDPOINTS.errors)
            .then(response => response.json())
            .then(data => {
                // Get active filter
                const activeFilter = document.querySelector('#error-filter-options .filter-option.active');
                const filterType = activeFilter ? activeFilter.getAttribute('data-filter') : 'all';
                
                // Apply filter
                const filteredErrors = filterType === 'all' 
                    ? data.errors 
                    : data.errors.filter(error => error.type === filterType);
                
                // Update sync history with error information
                updateSyncHistoryWithErrors(filteredErrors);
                
                // Update error counts in entity tabs
                updateErrorCountsInTabs(data.errorCounts);
            })
            .catch(error => {
                console.error('Error fetching errors:', error);
            });
    }
    
    // Filter errors
    function filterErrors(filterType) {
        // Re-fetch errors with the new filter
        updateAllErrors();
    }
    
    // Update sync history with error information
    function updateSyncHistoryWithErrors(errors) {
        // Map errors to sync history items
        const syncItems = document.querySelectorAll('.sync-item');
        
        syncItems.forEach(item => {
            const syncTimeElement = item.querySelector('.sync-time');
            if (!syncTimeElement) return;
            
            // Extract timestamp from sync time text
            const timeText = syncTimeElement.textContent;
            const timestampMatch = timeText.match(/(\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2} [AP]M)/);
            if (!timestampMatch) return;
            
            const timestamp = new Date(timestampMatch[1]).toISOString();
            
            // Find matching error
            const matchingError = errors.find(error => error.timestamp === timestamp);
            
            if (matchingError) {
                // Add error details button if not already present
                if (!item.querySelector('.error-details-btn')) {
                    const errorDetailsBtn = document.createElement('button');
                    errorDetailsBtn.className = 'btn btn-outline error-details-btn';
                    errorDetailsBtn.textContent = 'Details';
                    errorDetailsBtn.setAttribute('data-error-id', matchingError.id);
                    errorDetailsBtn.addEventListener('click', () => showErrorDetails(matchingError.id));
                    
                    const syncStatus = item.querySelector('.sync-status');
                    if (syncStatus) {
                        syncStatus.appendChild(errorDetailsBtn);
                    }
                }
                
                // Update retry button with sync ID if not already present
                const retryBtn = item.querySelector('.retry-btn');
                if (retryBtn && !retryBtn.getAttribute('data-sync-id')) {
                    retryBtn.setAttribute('data-sync-id', matchingError.syncId);
                }
            }
        });
    }
    
    // Update error counts in entity tabs
    function updateErrorCountsInTabs(errorCounts) {
        const entityTypes = ['products', 'picklists', 'warehouses', 'users', 'suppliers'];
        
        entityTypes.forEach(entityType => {
            const tab = document.querySelector(`.entity-tab[data-entity="${entityType}"]`);
            if (!tab) return;
            
            // Remove existing error badge
            const existingBadge = tab.querySelector('.error-badge');
            if (existingBadge) {
                existingBadge.remove();
            }
            
            // Add error badge if there are errors
            const errorCount = errorCounts[entityType] || 0;
            if (errorCount > 0) {
                const errorBadge = document.createElement('span');
                errorBadge.className = 'error-badge';
                errorBadge.textContent = errorCount;
                tab.appendChild(errorBadge);
            }
        });
    }
    
    // Show error details
    function showErrorDetails(errorId) {
        fetch(ENDPOINTS.errorDetails(errorId))
            .then(response => response.json())
            .then(data => {
                // Populate modal with error details
                document.getElementById('error-id').textContent = data.id;
                document.getElementById('error-entity').textContent = data.entityType;
                document.getElementById('error-timestamp').textContent = new Date(data.timestamp).toLocaleString();
                document.getElementById('error-type').textContent = data.type;
                document.getElementById('error-message').textContent = data.message;
                document.getElementById('error-stack').textContent = data.stack || 'No stack trace available';
                document.getElementById('error-context').textContent = JSON.stringify(data.context, null, 2) || 'No context available';
                
                // Set sync ID for retry button
                document.getElementById('modal-retry-btn').setAttribute('data-sync-id', data.syncId);
                
                // Show modal
                document.getElementById('error-details-modal').style.display = 'block';
            })
            .catch(error => {
                console.error('Error fetching error details:', error);
                alert('Error loading details. Please try again.');
            });
    }
    
    // Close error modal
    function closeErrorModal() {
        document.getElementById('error-details-modal').style.display = 'none';
    }
    
    // Retry sync
    function retrySync(syncId) {
        fetch(ENDPOINTS.retrySync(syncId), { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Show success message
                    alert('Sync retry started successfully');
                    
                    // Refresh errors after a short delay
                    setTimeout(updateAllErrors, 2000);
                } else {
                    // Show error message
                    alert(`Failed to retry sync: ${data.message}`);
                }
            })
            .catch(error => {
                console.error('Error retrying sync:', error);
                alert('Error retrying sync. Please try again.');
            });
    }
});
