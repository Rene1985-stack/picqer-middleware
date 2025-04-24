/**
 * Sync Button Verifier JavaScript for Picqer Middleware
 * This file provides verification for sync button actions
 */

// Sync Button Verifier class
class SyncButtonVerifier {
  constructor() {
    // Initialize sync button verification
    this.initSyncButtonVerification();
  }
  
  // Initialize sync button verification
  initSyncButtonVerification() {
    // Find all sync buttons
    const syncButtons = document.querySelectorAll('[id^="sync"]');
    
    // Add confirmation to each sync button
    syncButtons.forEach(button => {
      button.addEventListener('click', (event) => {
        // Prevent default action
        event.preventDefault();
        
        // Get button text
        const buttonText = button.textContent.trim();
        
        // Show confirmation dialog
        if (confirm(`Are you sure you want to ${buttonText}? This may take some time.`)) {
          // If confirmed, proceed with original click handler
          // We need to remove our event listener temporarily to avoid infinite loop
          button.removeEventListener('click', arguments.callee);
          
          // Disable button to prevent multiple clicks
          button.disabled = true;
          
          // Add loading indicator
          const originalText = button.textContent;
          button.textContent = 'Syncing...';
          
          // Simulate click to trigger the original handler
          setTimeout(() => {
            button.click();
            
            // Re-enable button after a delay
            setTimeout(() => {
              button.disabled = false;
              button.textContent = originalText;
              
              // Re-add our event listener
              button.addEventListener('click', arguments.callee);
            }, 2000);
          }, 0);
        }
      });
    });
  }
  
  // Verify sync action
  verifySyncAction(entity, callback) {
    // Show confirmation dialog
    if (confirm(`Are you sure you want to sync ${entity}? This may take some time.`)) {
      // If confirmed, execute callback
      callback();
    }
  }
}

// Initialize sync button verifier when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.syncButtonVerifier = new SyncButtonVerifier();
});
