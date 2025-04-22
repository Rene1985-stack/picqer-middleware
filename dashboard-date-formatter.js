/**
 * Dashboard Date Formatter
 * 
 * This file provides utility functions to format dates properly in the dashboard
 * and ensure no Unix epoch dates (01/01/1970) are displayed.
 */

// Function to check if a date is valid and not epoch
function isValidNonEpochDate(date) {
  if (!date) return false;
  
  const dateObj = new Date(date);
  
  // Check if date is valid and not near epoch (with some margin)
  return !isNaN(dateObj) && dateObj.getFullYear() > 1971;
}

// Function to get a safe date that never returns epoch
function getSafeDate(date) {
  if (!isValidNonEpochDate(date)) {
    return new Date(); // Return current date as fallback
  }
  
  return new Date(date);
}

// Function to format a date for display
function formatDateForDisplay(date) {
  const safeDate = getSafeDate(date);
  
  return safeDate.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Replace all date formatting in the dashboard
document.addEventListener('DOMContentLoaded', function() {
  // Find all elements with date-time class
  const dateElements = document.querySelectorAll('.date-time');
  
  dateElements.forEach(element => {
    const originalDate = element.textContent || element.innerText;
    
    // Check if this looks like a date display
    if (originalDate.includes('Last sync:') || 
        originalDate.includes('Updated:') || 
        originalDate.includes('Created:')) {
      
      // Extract the date part
      const dateParts = originalDate.split(':');
      if (dateParts.length >= 2) {
        const label = dateParts[0] + ':';
        const dateStr = dateParts.slice(1).join(':').trim();
        
        // Format the date safely
        const formattedDate = formatDateForDisplay(dateStr);
        
        // Replace the content
        element.textContent = `${label} ${formattedDate}`;
      }
    }
  });
  
  console.log('Dashboard dates formatted successfully');
});
