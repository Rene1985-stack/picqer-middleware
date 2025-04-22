/**
 * API Endpoint Monitoring Script
 * 
 * This script monitors API endpoints and logs any issues.
 * It helps detect missing or failing endpoints early.
 */

// Add this file to your project and include it in your dashboard.html

document.addEventListener('DOMContentLoaded', function() {
    console.log('API Endpoint Monitor: Starting endpoint verification...');
    
    // Define all required API endpoints
    // Note: These paths are adjusted for a base URL that already includes /api/v1
    const requiredEndpoints = [
        // Core endpoints
        '/status',
        '/stats',
        '/logs',
        '/history',
        '/sync',
        
        // Entity-specific endpoints
        '/sync/products',
        '/sync/picklists',
        '/sync/warehouses',
        '/sync/users',
        '/sync/suppliers',
        '/sync/batches',
        
        // Batch-specific endpoints
        '/batches/metrics',
        '/batches/productivity',
        '/batches/stats'
    ];
    
    // Check each endpoint
    const missingEndpoints = [];
    const checkPromises = [];
    
    requiredEndpoints.forEach(endpoint => {
        const checkPromise = fetch(endpoint, { method: 'HEAD' })
            .then(response => {
                if (response.ok || response.status === 405) {
                    // 405 Method Not Allowed is OK - it means the endpoint exists but doesn't support HEAD
                    console.log(`✓ Endpoint exists: ${endpoint}`);
                    return true;
                } else {
                    console.warn(`❌ Endpoint missing or error: ${endpoint} (${response.status})`);
                    missingEndpoints.push({ endpoint, status: response.status });
                    return false;
                }
            })
            .catch(error => {
                console.error(`❌ Error checking endpoint: ${endpoint}`, error);
                missingEndpoints.push({ endpoint, error: error.message });
                return false;
            });
        
        checkPromises.push(checkPromise);
    });
    
    // Wait for all checks to complete
    Promise.all(checkPromises)
        .then(() => {
            if (missingEndpoints.length === 0) {
                console.log('✅ All API endpoints are available!');
            } else {
                console.error(`❌ Missing ${missingEndpoints.length} API endpoints. See details above.`);
                
                // Create a notification in the dashboard
                createEndpointAlert(missingEndpoints);
            }
        });
    
    // Function to create an alert in the dashboard
    function createEndpointAlert(missingEndpoints) {
        // Create alert element
        const alertElement = document.createElement('div');
        alertElement.className = 'api-alert';
        alertElement.style.backgroundColor = '#dc3545';
        alertElement.style.color = 'white';
        alertElement.style.padding = '10px';
        alertElement.style.borderRadius = '4px';
        alertElement.style.margin = '10px 0';
        alertElement.style.position = 'fixed';
        alertElement.style.bottom = '20px';
        alertElement.style.right = '20px';
        alertElement.style.zIndex = '1000';
        alertElement.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
        alertElement.style.maxWidth = '400px';
        
        // Create alert content
        alertElement.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <strong>API Endpoint Issues Detected</strong>
                <button id="close-api-alert" style="background: none; border: none; color: white; font-size: 16px; cursor: pointer;">×</button>
            </div>
            <p>The following API endpoints are missing or returning errors:</p>
            <ul style="margin-top: 5px; padding-left: 20px;">
                ${missingEndpoints.map(item => `<li>${item.endpoint} - ${item.status || item.error}</li>`).join('')}
            </ul>
            <p style="margin-top: 10px; font-size: 12px;">Check the console for more details.</p>
        `;
        
        // Add to document
        document.body.appendChild(alertElement);
        
        // Add close button functionality
        document.getElementById('close-api-alert').addEventListener('click', function() {
            alertElement.remove();
        });
        
        // Auto-hide after 30 seconds
        setTimeout(() => {
            if (document.body.contains(alertElement)) {
                alertElement.remove();
            }
        }, 30000);
    }
    
    // Add periodic monitoring (every 5 minutes)
    setInterval(() => {
        console.log('API Endpoint Monitor: Running periodic check...');
        // Re-run the checks
        const periodicCheckPromises = [];
        const newMissingEndpoints = [];
        
        requiredEndpoints.forEach(endpoint => {
            const checkPromise = fetch(endpoint, { method: 'HEAD' })
                .then(response => {
                    if (!response.ok && response.status !== 405) {
                        newMissingEndpoints.push({ endpoint, status: response.status });
                        return false;
                    }
                    return true;
                })
                .catch(error => {
                    newMissingEndpoints.push({ endpoint, error: error.message });
                    return false;
                });
            
            periodicCheckPromises.push(checkPromise);
        });
        
        Promise.all(periodicCheckPromises)
            .then(() => {
                if (newMissingEndpoints.length > 0) {
                    console.error(`❌ Periodic check: Found ${newMissingEndpoints.length} API endpoint issues.`);
                    createEndpointAlert(newMissingEndpoints);
                } else {
                    console.log('✅ Periodic check: All API endpoints are available!');
                }
            });
    }, 300000); // 5 minutes
});
