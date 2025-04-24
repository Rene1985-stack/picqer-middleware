/**
 * Batch UI Components JavaScript for Picqer Middleware
 * This file provides UI components for batch management
 */

// Batch UI Components class
class BatchUIComponents {
  constructor() {
    // Initialize batch UI components
    this.initComponents();
  }
  
  // Initialize batch UI components
  initComponents() {
    // Add batch status indicators
    this.addBatchStatusIndicators();
    
    // Add batch filter functionality if filter elements exist
    this.initBatchFilters();
  }
  
  // Add batch status indicators
  addBatchStatusIndicators() {
    // Find all batch status elements
    const batchStatusElements = document.querySelectorAll('.batch-status');
    
    // Add status indicators to each element
    batchStatusElements.forEach(element => {
      const status = element.getAttribute('data-status');
      if (status) {
        let statusClass = '';
        let statusText = '';
        
        switch (status.toLowerCase()) {
          case 'new':
            statusClass = 'status-new';
            statusText = 'New';
            break;
          case 'in_progress':
            statusClass = 'status-in-progress';
            statusText = 'In Progress';
            break;
          case 'completed':
            statusClass = 'status-completed';
            statusText = 'Completed';
            break;
          case 'cancelled':
            statusClass = 'status-cancelled';
            statusText = 'Cancelled';
            break;
          default:
            statusClass = 'status-unknown';
            statusText = status;
        }
        
        element.innerHTML = `<span class="status ${statusClass}">${statusText}</span>`;
      }
    });
  }
  
  // Initialize batch filters
  initBatchFilters() {
    // Find batch filter elements
    const batchFilterSelect = document.getElementById('batch-filter');
    const batchItems = document.querySelectorAll('.batch-item');
    
    // Add filter functionality if elements exist
    if (batchFilterSelect && batchItems.length > 0) {
      batchFilterSelect.addEventListener('change', () => {
        const filterValue = batchFilterSelect.value;
        
        batchItems.forEach(item => {
          const status = item.getAttribute('data-status');
          
          if (filterValue === 'all' || status === filterValue) {
            item.style.display = '';
          } else {
            item.style.display = 'none';
          }
        });
      });
    }
  }
  
  // Create batch item element
  createBatchItem(batch) {
    const batchItem = document.createElement('div');
    batchItem.className = 'batch-item';
    batchItem.setAttribute('data-status', batch.status);
    
    let statusClass = '';
    let statusText = '';
    
    switch (batch.status.toLowerCase()) {
      case 'new':
        statusClass = 'status-new';
        statusText = 'New';
        break;
      case 'in_progress':
        statusClass = 'status-in-progress';
        statusText = 'In Progress';
        break;
      case 'completed':
        statusClass = 'status-completed';
        statusText = 'Completed';
        break;
      case 'cancelled':
        statusClass = 'status-cancelled';
        statusText = 'Cancelled';
        break;
      default:
        statusClass = 'status-unknown';
        statusText = batch.status;
    }
    
    batchItem.innerHTML = `
      <div class="batch-header">
        <h3>${batch.name}</h3>
        <span class="status ${statusClass}">${statusText}</span>
      </div>
      <div class="batch-details">
        <p><strong>ID:</strong> ${batch.id}</p>
        <p><strong>Created:</strong> ${new Date(batch.created_at).toLocaleString()}</p>
        <p><strong>Updated:</strong> ${new Date(batch.updated_at).toLocaleString()}</p>
      </div>
    `;
    
    return batchItem;
  }
  
  // Render batch list
  renderBatchList(batches, container) {
    if (!container) return;
    
    // Clear container
    container.innerHTML = '';
    
    // Add batch filter if there are batches
    if (batches.length > 0) {
      const filterDiv = document.createElement('div');
      filterDiv.className = 'batch-filter';
      filterDiv.innerHTML = `
        <label for="batch-filter">Filter by status:</label>
        <select id="batch-filter">
          <option value="all">All</option>
          <option value="new">New</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      `;
      container.appendChild(filterDiv);
      
      // Create batch list
      const batchList = document.createElement('div');
      batchList.className = 'batch-list';
      
      // Add batch items
      batches.forEach(batch => {
        const batchItem = this.createBatchItem(batch);
        batchList.appendChild(batchItem);
      });
      
      container.appendChild(batchList);
      
      // Initialize batch filters
      this.initBatchFilters();
    } else {
      container.innerHTML = '<p>No batches found.</p>';
    }
  }
}

// Initialize batch UI components when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.batchUIComponents = new BatchUIComponents();
});
