/**
 * Sync Button Verification Script
 * 
 * This script verifies that all necessary sync button IDs exist in your HTML.
 * It checks for main sync buttons and entity-specific sync buttons.
 * Run this script after your page loads to ensure all buttons are properly configured.
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('Running sync button verification...');
    
    // Define all required button IDs
    const requiredButtonIds = [
        // Main sync buttons
        'sync-btn',
        'full-sync-btn',
        
        // Entity-specific sync buttons
        'sync-products-btn',
        'full-sync-products-btn',
        'sync-picklists-btn',
        'full-sync-picklists-btn',
        'sync-warehouses-btn',
        'full-sync-warehouses-btn',
        'sync-users-btn',
        'full-sync-users-btn',
        'sync-suppliers-btn',
        'full-sync-suppliers-btn',
        'sync-batches-btn',
        'full-sync-batches-btn'
    ];
    
    // Check each button ID
    const missingButtons = [];
    
    requiredButtonIds.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (!button) {
            missingButtons.push(buttonId);
            console.warn(`Missing sync button: ${buttonId}`);
        } else {
            console.log(`✓ Found sync button: ${buttonId}`);
        }
    });
    
    // Display results
    if (missingButtons.length === 0) {
        console.log('✅ All sync buttons found! Your dashboard is properly configured.');
    } else {
        console.error(`❌ Missing ${missingButtons.length} sync buttons. Please add the following buttons to your HTML:`);
        missingButtons.forEach(buttonId => {
            console.error(`  - ${buttonId}`);
        });
        
        // Show alert if in development mode
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            alert(`Missing ${missingButtons.length} sync buttons. Check console for details.`);
        }
    }
    
    // Generate HTML for missing buttons if needed
    if (missingButtons.length > 0) {
        console.log('\nSample HTML for missing buttons:');
        
        missingButtons.forEach(buttonId => {
            let buttonText = '';
            let buttonClass = 'btn btn-primary';
            
            if (buttonId.includes('full-sync')) {
                buttonText = 'Full Sync';
                buttonClass = 'btn btn-outline';
            } else {
                buttonText = 'Sync';
                buttonClass = 'btn btn-primary';
            }
            
            // Extract entity type from button ID
            let entityType = 'All';
            if (buttonId.includes('-products-')) {
                entityType = 'Products';
            } else if (buttonId.includes('-picklists-')) {
                entityType = 'Picklists';
            } else if (buttonId.includes('-warehouses-')) {
                entityType = 'Warehouses';
            } else if (buttonId.includes('-users-')) {
                entityType = 'Users';
            } else if (buttonId.includes('-suppliers-')) {
                entityType = 'Suppliers';
            } else if (buttonId.includes('-batches-')) {
                entityType = 'Batches';
            }
            
            const buttonHtml = `<button id="${buttonId}" class="${buttonClass}">${buttonText} ${entityType}</button>`;
            console.log(buttonHtml);
        });
    }
    
    // Check if event listeners are attached
    console.log('\nChecking event listeners...');
    
    // Function to check if an element has click event listeners
    function hasClickEventListener(element) {
        // This is a best-effort check, as there's no standard way to detect event listeners
        // We'll use a heuristic based on jQuery data or a custom attribute
        
        // Check for jQuery events if jQuery is available
        if (window.jQuery && jQuery._data) {
            const events = jQuery._data(element, 'events');
            return events && events.click && events.click.length > 0;
        }
        
        // Check for onclick attribute
        if (element.hasAttribute('onclick') || element.onclick) {
            return true;
        }
        
        // Check for our custom attribute that we might set in dashboard-api.js
        if (element.getAttribute('data-has-click-listener') === 'true') {
            return true;
        }
        
        // We can't reliably detect event listeners added via addEventListener
        // So we'll return null (unknown) in this case
        return null;
    }
    
    // Check each button for event listeners
    requiredButtonIds.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            const hasListener = hasClickEventListener(button);
            
            if (hasListener === true) {
                console.log(`✓ Button ${buttonId} has click event listener`);
            } else if (hasListener === false) {
                console.warn(`⚠️ Button ${buttonId} does NOT have click event listener`);
            } else {
                console.log(`? Cannot determine if button ${buttonId} has click event listener`);
            }
        }
    });
    
    // Add a helper function to fix missing buttons
    window.fixMissingButtons = function() {
        console.log('Attempting to fix missing buttons...');
        
        // Create missing buttons
        missingButtons.forEach(buttonId => {
            // Skip if button already exists
            if (document.getElementById(buttonId)) {
                return;
            }
            
            let buttonText = '';
            let buttonClass = 'btn btn-primary';
            
            if (buttonId.includes('full-sync')) {
                buttonText = 'Full Sync';
                buttonClass = 'btn btn-outline';
            } else {
                buttonText = 'Sync';
                buttonClass = 'btn btn-primary';
            }
            
            // Extract entity type from button ID
            let entityType = 'All';
            let parentSelector = '.card-actions';
            
            if (buttonId.includes('-products-')) {
                entityType = 'Products';
                parentSelector = '#products-content .card-actions';
            } else if (buttonId.includes('-picklists-')) {
                entityType = 'Picklists';
                parentSelector = '#picklists-content .card-actions';
            } else if (buttonId.includes('-warehouses-')) {
                entityType = 'Warehouses';
                parentSelector = '#warehouses-content .card-actions';
            } else if (buttonId.includes('-users-')) {
                entityType = 'Users';
                parentSelector = '#users-content .card-actions';
            } else if (buttonId.includes('-suppliers-')) {
                entityType = 'Suppliers';
                parentSelector = '#suppliers-content .card-actions';
            } else if (buttonId.includes('-batches-')) {
                entityType = 'Batches';
                parentSelector = '#batches-content .card-actions';
            }
            
            // Create button element
            const button = document.createElement('button');
            button.id = buttonId;
            button.className = buttonClass;
            button.textContent = `${buttonText} ${entityType}`;
            
            // Find parent element
            const parent = document.querySelector(parentSelector);
            if (parent) {
                parent.appendChild(button);
                console.log(`✓ Created button ${buttonId}`);
            } else {
                console.error(`❌ Could not find parent element for button ${buttonId}`);
            }
        });
        
        // Reload the page to apply event listeners
        if (missingButtons.length > 0) {
            alert('Created missing buttons. Page will reload to apply event listeners.');
            window.location.reload();
        } else {
            alert('No missing buttons to fix.');
        }
    };
    
    // Add a helper message about the fix function
    if (missingButtons.length > 0) {
        console.log('\nTo automatically fix missing buttons, run this in the console:');
        console.log('fixMissingButtons()');
    }
});
