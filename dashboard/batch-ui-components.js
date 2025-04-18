/**
 * Enhanced Batch UI Components
 * 
 * This file provides UI components for displaying batch productivity data
 * with fallback handling for when the API is unavailable.
 */

class BatchUIComponents {
  constructor(options = {}) {
    // Configuration options with defaults
    this.config = {
      apiBasePath: options.apiBasePath || '',
      refreshInterval: options.refreshInterval || 60000, // 1 minute
      fallbackEnabled: options.fallbackEnabled !== undefined ? options.fallbackEnabled : true,
      dateRangeDefault: options.dateRangeDefault || 30, // 30 days
      pageSize: options.pageSize || 10
    };
    
    // State management
    this.state = {
      isLoading: true,
      isError: false,
      isFallback: false,
      errorMessage: '',
      dateRange: this.config.dateRangeDefault,
      currentPage: 1,
      totalPages: 1,
      selectedBatchId: null,
      filters: {
        warehouse: 'all',
        status: 'all',
        user: 'all'
      }
    };
    
    // Container elements
    this.elements = {
      filters: null,
      productivity: null,
      trends: null,
      batches: null,
      batchDetails: null
    };
    
    // Data storage
    this.data = {
      productivity: null,
      trends: null,
      batches: [],
      batchDetails: null,
      warehouses: [],
      users: []
    };
    
    // Refresh timer
    this.refreshTimer = null;
  }
  
  /**
   * Initialize the UI components
   * @param {Object} elements - Container elements
   */
  init(elements) {
    console.log('Initializing Batch UI Components...');
    
    // Store container elements
    this.elements = {
      filters: elements.filters || null,
      productivity: elements.productivity || null,
      trends: elements.trends || null,
      batches: elements.batches || null,
      batchDetails: elements.batchDetails || null
    };
    
    // Initial data load
    this.loadData();
    
    // Set up refresh timer
    this.refreshTimer = setInterval(() => {
      this.loadData();
    }, this.config.refreshInterval);
    
    // Return this for chaining
    return this;
  }
  
  /**
   * Load all data from API or fallback
   */
  async loadData() {
    try {
      this.setState({ isLoading: true, isError: false, errorMessage: '' });
      
      // Render loading state
      this.renderLoading();
      
      // Load productivity data
      await this.loadProductivityData();
      
      // Load trends data
      await this.loadTrendsData();
      
      // Load batches list
      await this.loadBatchesList();
      
      // If a batch is selected, load its details
      if (this.state.selectedBatchId) {
        await this.loadBatchDetails(this.state.selectedBatchId);
      }
      
      this.setState({ isLoading: false, isFallback: false });
      
      // Render all components
      this.renderAll();
    } catch (error) {
      console.error('Error loading batch data:', error);
      
      if (this.config.fallbackEnabled) {
        console.log('Using fallback data...');
        this.loadFallbackData();
        this.setState({ isLoading: false, isFallback: true });
        this.renderAll();
      } else {
        this.setState({ 
          isLoading: false, 
          isError: true, 
          errorMessage: `Failed to load batch data: ${error.message}` 
        });
        this.renderError();
      }
    }
  }
  
  /**
   * Load productivity data from API
   */
  async loadProductivityData() {
    try {
      const url = `${this.config.apiBasePath}/api/batches/productivity?days=${this.state.dateRange}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      this.data.productivity = data;
      
      // Extract warehouse and user lists for filters
      if (data.warehouses) {
        this.data.warehouses = data.warehouses;
      }
      
      if (data.users) {
        this.data.users = data.users;
      }
      
      return data;
    } catch (error) {
      console.error('Error loading productivity data:', error);
      if (!this.config.fallbackEnabled) {
        throw error;
      }
      return null;
    }
  }
  
  /**
   * Load trends data from API
   */
  async loadTrendsData() {
    try {
      const url = `${this.config.apiBasePath}/api/batches/trends?days=${this.state.dateRange}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      this.data.trends = data;
      return data;
    } catch (error) {
      console.error('Error loading trends data:', error);
      if (!this.config.fallbackEnabled) {
        throw error;
      }
      return null;
    }
  }
  
  /**
   * Load batches list from API
   */
  async loadBatchesList() {
    try {
      const { currentPage, filters } = this.state;
      const pageSize = this.config.pageSize;
      
      // Build filter query string
      const filterParams = [];
      if (filters.warehouse !== 'all') filterParams.push(`warehouse=${filters.warehouse}`);
      if (filters.status !== 'all') filterParams.push(`status=${filters.status}`);
      if (filters.user !== 'all') filterParams.push(`user=${filters.user}`);
      
      const filterQuery = filterParams.length > 0 ? `&${filterParams.join('&')}` : '';
      
      const url = `${this.config.apiBasePath}/api/batches?page=${currentPage}&pageSize=${pageSize}${filterQuery}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      this.data.batches = data.batches || [];
      this.state.totalPages = data.totalPages || 1;
      return data;
    } catch (error) {
      console.error('Error loading batches list:', error);
      if (!this.config.fallbackEnabled) {
        throw error;
      }
      return null;
    }
  }
  
  /**
   * Load batch details from API
   * @param {string} batchId - Batch ID
   */
  async loadBatchDetails(batchId) {
    try {
      const url = `${this.config.apiBasePath}/api/batches/${batchId}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      this.data.batchDetails = data;
      return data;
    } catch (error) {
      console.error(`Error loading batch details for ${batchId}:`, error);
      if (!this.config.fallbackEnabled) {
        throw error;
      }
      return null;
    }
  }
  
  /**
   * Load fallback data when API is unavailable
   */
  loadFallbackData() {
    // Fallback productivity data
    this.data.productivity = {
      overall: {
        pickRate: 42.5,
        packRate: 35.2,
        totalBatches: 128,
        completionRate: 94.7,
        averageTime: 45.3
      },
      warehouses: [
        { id: 1, name: 'Main Warehouse' },
        { id: 2, name: 'Secondary Warehouse' }
      ],
      users: [
        { id: 1, name: 'John Doe' },
        { id: 2, name: 'Jane Smith' },
        { id: 3, name: 'Bob Johnson' }
      ],
      byWarehouse: [
        { id: 1, name: 'Main Warehouse', pickRate: 45.2, packRate: 38.1, totalBatches: 85 },
        { id: 2, name: 'Secondary Warehouse', pickRate: 37.1, packRate: 29.5, totalBatches: 43 }
      ],
      byUser: [
        { id: 1, name: 'John Doe', pickRate: 52.3, packRate: 0, totalBatches: 45 },
        { id: 2, name: 'Jane Smith', pickRate: 48.7, packRate: 41.2, totalBatches: 38 },
        { id: 3, name: 'Bob Johnson', pickRate: 0, packRate: 39.8, totalBatches: 45 }
      ]
    };
    
    // Fallback trends data
    this.data.trends = {
      daily: [
        { date: '2025-04-01', pickRate: 41.2, packRate: 34.5, batches: 12 },
        { date: '2025-04-02', pickRate: 42.8, packRate: 35.1, batches: 15 },
        { date: '2025-04-03', pickRate: 40.5, packRate: 33.9, batches: 11 },
        { date: '2025-04-04', pickRate: 43.1, packRate: 36.2, batches: 14 },
        { date: '2025-04-05', pickRate: 44.7, packRate: 37.8, batches: 18 },
        { date: '2025-04-06', pickRate: 42.3, packRate: 35.5, batches: 13 },
        { date: '2025-04-07', pickRate: 41.9, packRate: 34.8, batches: 12 }
      ],
      weekly: [
        { week: '2025-W13', pickRate: 41.5, packRate: 34.2, batches: 82 },
        { week: '2025-W14', pickRate: 42.8, packRate: 35.7, batches: 95 },
        { week: '2025-W15', pickRate: 43.2, packRate: 36.1, batches: 89 },
        { week: '2025-W16', pickRate: 42.5, packRate: 35.2, batches: 91 }
      ]
    };
    
    // Fallback batches list
    this.data.batches = [
      { id: 'B1001', createdAt: '2025-04-15T09:30:00Z', status: 'completed', warehouse: 'Main Warehouse', picker: 'John Doe', packer: 'Jane Smith', items: 24, pickTime: 32.5, packTime: 28.2 },
      { id: 'B1002', createdAt: '2025-04-15T10:15:00Z', status: 'completed', warehouse: 'Main Warehouse', picker: 'John Doe', packer: 'Jane Smith', items: 18, pickTime: 25.3, packTime: 22.1 },
      { id: 'B1003', createdAt: '2025-04-15T11:00:00Z', status: 'in-progress', warehouse: 'Secondary Warehouse', picker: 'John Doe', packer: null, items: 32, pickTime: 41.7, packTime: null },
      { id: 'B1004', createdAt: '2025-04-15T11:45:00Z', status: 'pending', warehouse: 'Main Warehouse', picker: null, packer: null, items: 15, pickTime: null, packTime: null },
      { id: 'B1005', createdAt: '2025-04-15T13:30:00Z', status: 'completed', warehouse: 'Secondary Warehouse', picker: 'John Doe', packer: 'Bob Johnson', items: 27, pickTime: 35.8, packTime: 31.2 }
    ];
    
    // Fallback batch details (for first batch)
    this.data.batchDetails = {
      id: 'B1001',
      createdAt: '2025-04-15T09:30:00Z',
      completedAt: '2025-04-15T10:45:00Z',
      status: 'completed',
      warehouse: 'Main Warehouse',
      picker: {
        id: 1,
        name: 'John Doe',
        pickRate: 52.3
      },
      packer: {
        id: 2,
        name: 'Jane Smith',
        packRate: 41.2
      },
      items: [
        { id: 'P1001', name: 'Product A', quantity: 5, pickTime: 6.5 },
        { id: 'P1002', name: 'Product B', quantity: 3, pickTime: 4.2 },
        { id: 'P1003', name: 'Product C', quantity: 8, pickTime: 10.3 },
        { id: 'P1004', name: 'Product D', quantity: 2, pickTime: 3.1 },
        { id: 'P1005', name: 'Product E', quantity: 6, pickTime: 8.4 }
      ],
      timeline: [
        { time: '2025-04-15T09:30:00Z', event: 'Batch created' },
        { time: '2025-04-15T09:35:00Z', event: 'Picking started by John Doe' },
        { time: '2025-04-15T10:08:00Z', event: 'Picking completed' },
        { time: '2025-04-15T10:12:00Z', event: 'Packing started by Jane Smith' },
        { time: '2025-04-15T10:45:00Z', event: 'Packing completed' }
      ],
      metrics: {
        totalItems: 24,
        totalQuantity: 24,
        pickTime: 32.5,
        packTime: 28.2,
        totalTime: 60.7,
        pickRate: 44.3,
        packRate: 51.1
      }
    };
  }
  
  /**
   * Update component state
   * @param {Object} newState - New state properties
   */
  setState(newState) {
    this.state = { ...this.state, ...newState };
  }
  
  /**
   * Render all components
   */
  renderAll() {
    // Render filters
    if (this.elements.filters) {
      this.renderFilters();
    }
    
    // Render productivity
    if (this.elements.productivity) {
      this.renderProductivity();
    }
    
    // Render trends
    if (this.elements.trends) {
      this.renderTrends();
    }
    
    // Render batches list
    if (this.elements.batches) {
      this.renderBatchesList();
    }
    
    // Render batch details if selected
    if (this.elements.batchDetails && this.state.selectedBatchId) {
      this.renderBatchDetails();
    }
  }
  
  /**
   * Render loading state
   */
  renderLoading() {
    const loadingHTML = `
      <div class="loading-container">
        <div class="spinner"></div>
        <p>Loading batch productivity data...</p>
      </div>
    `;
    
    // Apply loading state to all containers
    if (this.elements.filters) {
      this.elements.filters.innerHTML = loadingHTML;
    }
    
    if (this.elements.productivity) {
      this.elements.productivity.innerHTML = loadingHTML;
    }
    
    if (this.elements.trends) {
      this.elements.trends.innerHTML = loadingHTML;
    }
    
    if (this.elements.batches) {
      this.elements.batches.innerHTML = loadingHTML;
    }
    
    if (this.elements.batchDetails) {
      this.elements.batchDetails.style.display = 'none';
    }
  }
  
  /**
   * Render error state
   */
  renderError() {
    const errorHTML = `
      <div class="error-container">
        <h3>Error Loading Data</h3>
        <p>${this.state.errorMessage}</p>
        <button class="btn btn-primary" id="batch-retry-btn">Retry</button>
      </div>
    `;
    
    // Apply error state to all containers
    if (this.elements.filters) {
      this.elements.filters.innerHTML = errorHTML;
    }
    
    if (this.elements.productivity) {
      this.elements.productivity.innerHTML = errorHTML;
    }
    
    if (this.elements.trends) {
      this.elements.trends.innerHTML = '';
    }
    
    if (this.elements.batches) {
      this.elements.batches.innerHTML = '';
    }
    
    if (this.elements.batchDetails) {
      this.elements.batchDetails.style.display = 'none';
    }
    
    // Add retry button event listener
    const retryButtons = document.querySelectorAll('#batch-retry-btn');
    retryButtons.forEach(button => {
      button.addEventListener('click', () => {
        this.loadData();
      });
    });
  }
  
  /**
   * Render filters
   */
  renderFilters() {
    // Create date range selector and filters
    const { warehouses, users } = this.data.productivity || { warehouses: [], users: [] };
    const { dateRange, filters } = this.state;
    
    let filtersHTML = '';
    
    // Add fallback notice if using fallback data
    if (this.state.isFallback) {
      filtersHTML += `
        <div class="fallback-notice">
          <strong>Notice:</strong> Using sample data. API connection unavailable.
        </div>
      `;
    }
    
    // Add date range selector
    filtersHTML += `
      <div class="date-filters">
        <div class="filter-group">
          <label for="date-range">Date Range:</label>
          <select id="date-range" class="form-control">
            <option value="7" ${dateRange === 7 ? 'selected' : ''}>Last 7 days</option>
            <option value="14" ${dateRange === 14 ? 'selected' : ''}>Last 14 days</option>
            <option value="30" ${dateRange === 30 ? 'selected' : ''}>Last 30 days</option>
            <option value="90" ${dateRange === 90 ? 'selected' : ''}>Last 90 days</option>
          </select>
        </div>
        
        <div class="filter-group">
          <label for="warehouse-filter">Warehouse:</label>
          <select id="warehouse-filter" class="form-control">
            <option value="all" ${filters.warehouse === 'all' ? 'selected' : ''}>All Warehouses</option>
            ${warehouses.map(w => `
              <option value="${w.id}" ${filters.warehouse === w.id ? 'selected' : ''}>${w.name}</option>
            `).join('')}
          </select>
        </div>
        
        <div class="filter-group">
          <label for="user-filter">User:</label>
          <select id="user-filter" class="form-control">
            <option value="all" ${filters.user === 'all' ? 'selected' : ''}>All Users</option>
            ${users.map(u => `
              <option value="${u.id}" ${filters.user === u.id ? 'selected' : ''}>${u.name}</option>
            `).join('')}
          </select>
        </div>
        
        <div class="filter-group">
          <label for="status-filter">Status:</label>
          <select id="status-filter" class="form-control">
            <option value="all" ${filters.status === 'all' ? 'selected' : ''}>All Statuses</option>
            <option value="pending" ${filters.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="in-progress" ${filters.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
            <option value="completed" ${filters.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="cancelled" ${filters.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </div>
      </div>
    `;
    
    // Add date range info
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - dateRange);
    
    filtersHTML += `
      <div class="date-range-info">
        Showing data from ${startDate.toLocaleDateString()} to ${today.toLocaleDateString()}
      </div>
    `;
    
    // Set HTML
    this.elements.filters.innerHTML = filtersHTML;
    
    // Add event listeners
    const dateRangeSelect = document.getElementById('date-range');
    if (dateRangeSelect) {
      dateRangeSelect.addEventListener('change', (e) => {
        this.setState({ dateRange: parseInt(e.target.value, 10) });
        this.loadData();
      });
    }
    
    const warehouseFilter = document.getElementById('warehouse-filter');
    if (warehouseFilter) {
      warehouseFilter.addEventListener('change', (e) => {
        this.setState({ 
          filters: { ...this.state.filters, warehouse: e.target.value },
          currentPage: 1
        });
        this.loadData();
      });
    }
    
    const userFilter = document.getElementById('user-filter');
    if (userFilter) {
      userFilter.addEventListener('change', (e) => {
        this.setState({ 
          filters: { ...this.state.filters, user: e.target.value },
          currentPage: 1
        });
        this.loadData();
      });
    }
    
    const statusFilter = document.getElementById('status-filter');
    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        this.setState({ 
          filters: { ...this.state.filters, status: e.target.value },
          currentPage: 1
        });
        this.loadData();
      });
    }
  }
  
  /**
   * Render productivity metrics
   */
  renderProductivity() {
    const { productivity } = this.data;
    
    if (!productivity || !productivity.overall) {
      this.elements.productivity.innerHTML = '<p>No productivity data available.</p>';
      return;
    }
    
    const { overall, byWarehouse, byUser } = productivity;
    
    let productivityHTML = `
      <div class="productivity-dashboard">
        <div class="productivity-section">
          <h3>Overall Productivity</h3>
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-value">${overall.pickRate.toFixed(1)}</div>
              <div class="metric-label">Pick Rate (items/hour)</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">${overall.packRate.toFixed(1)}</div>
              <div class="metric-label">Pack Rate (items/hour)</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">${overall.totalBatches}</div>
              <div class="metric-label">Total Batches</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">${overall.completionRate.toFixed(1)}%</div>
              <div class="metric-label">Completion Rate</div>
            </div>
          </div>
        </div>
        
        <div class="productivity-section">
          <h3>Productivity by Warehouse</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>Warehouse</th>
                <th>Pick Rate</th>
                <th>Pack Rate</th>
                <th>Batches</th>
              </tr>
            </thead>
            <tbody>
              ${byWarehouse.map(warehouse => `
                <tr>
                  <td>${warehouse.name}</td>
                  <td>${warehouse.pickRate.toFixed(1)}</td>
                  <td>${warehouse.packRate.toFixed(1)}</td>
                  <td>${warehouse.totalBatches}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        
        <div class="productivity-section">
          <h3>Productivity by User</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Pick Rate</th>
                <th>Pack Rate</th>
                <th>Batches</th>
              </tr>
            </thead>
            <tbody>
              ${byUser.map(user => `
                <tr>
                  <td>${user.name}</td>
                  <td>${user.pickRate > 0 ? user.pickRate.toFixed(1) : '-'}</td>
                  <td>${user.packRate > 0 ? user.packRate.toFixed(1) : '-'}</td>
                  <td>${user.totalBatches}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    
    this.elements.productivity.innerHTML = productivityHTML;
  }
  
  /**
   * Render trends
   */
  renderTrends() {
    const { trends } = this.data;
    
    if (!trends || !trends.daily) {
      this.elements.trends.innerHTML = '<p>No trends data available.</p>';
      return;
    }
    
    const { daily, weekly } = trends;
    
    let trendsHTML = `
      <div class="productivity-section">
        <h3>Daily Trends</h3>
        <div class="chart-container" id="daily-trends-chart">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Pick Rate</th>
                <th>Pack Rate</th>
                <th>Batches</th>
              </tr>
            </thead>
            <tbody>
              ${daily.map(day => `
                <tr>
                  <td>${new Date(day.date).toLocaleDateString()}</td>
                  <td>${day.pickRate.toFixed(1)}</td>
                  <td>${day.packRate.toFixed(1)}</td>
                  <td>${day.batches}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      
      <div class="productivity-section">
        <h3>Weekly Trends</h3>
        <div class="chart-container" id="weekly-trends-chart">
          <table class="data-table">
            <thead>
              <tr>
                <th>Week</th>
                <th>Pick Rate</th>
                <th>Pack Rate</th>
                <th>Batches</th>
              </tr>
            </thead>
            <tbody>
              ${weekly.map(week => `
                <tr>
                  <td>${week.week}</td>
                  <td>${week.pickRate.toFixed(1)}</td>
                  <td>${week.packRate.toFixed(1)}</td>
                  <td>${week.batches}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    
    this.elements.trends.innerHTML = trendsHTML;
  }
  
  /**
   * Render batches list
   */
  renderBatchesList() {
    const { batches } = this.data;
    const { currentPage, totalPages } = this.state;
    
    if (!batches || batches.length === 0) {
      this.elements.batches.innerHTML = '<p>No batches found.</p>';
      return;
    }
    
    let batchesHTML = `
      <div class="batches-list">
        <h3>Batches</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Batch ID</th>
              <th>Created</th>
              <th>Status</th>
              <th>Warehouse</th>
              <th>Picker</th>
              <th>Packer</th>
              <th>Items</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${batches.map(batch => `
              <tr>
                <td>${batch.id}</td>
                <td>${new Date(batch.createdAt).toLocaleString()}</td>
                <td>
                  <span class="status-badge status-${batch.status}">
                    ${batch.status.charAt(0).toUpperCase() + batch.status.slice(1)}
                  </span>
                </td>
                <td>${batch.warehouse}</td>
                <td>${batch.picker || '-'}</td>
                <td>${batch.packer || '-'}</td>
                <td>${batch.items}</td>
                <td>
                  <button class="btn btn-sm btn-outline view-batch-btn" data-batch-id="${batch.id}">
                    View Details
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="pagination-controls">
          <div>
            Showing page ${currentPage} of ${totalPages}
          </div>
          <div class="pagination-buttons">
            <button class="btn btn-sm btn-outline ${currentPage === 1 ? 'btn-disabled' : ''}" 
                    id="prev-page-btn" ${currentPage === 1 ? 'disabled' : ''}>
              Previous
            </button>
            <button class="btn btn-sm btn-outline ${currentPage === totalPages ? 'btn-disabled' : ''}" 
                    id="next-page-btn" ${currentPage === totalPages ? 'disabled' : ''}>
              Next
            </button>
          </div>
        </div>
      </div>
    `;
    
    this.elements.batches.innerHTML = batchesHTML;
    
    // Add event listeners
    const viewButtons = document.querySelectorAll('.view-batch-btn');
    viewButtons.forEach(button => {
      button.addEventListener('click', () => {
        const batchId = button.getAttribute('data-batch-id');
        this.setState({ selectedBatchId: batchId });
        this.loadBatchDetails(batchId).then(() => {
          this.renderBatchDetails();
          this.elements.batchDetails.style.display = 'block';
          this.elements.batchDetails.scrollIntoView({ behavior: 'smooth' });
        });
      });
    });
    
    const prevPageBtn = document.getElementById('prev-page-btn');
    if (prevPageBtn) {
      prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          this.setState({ currentPage: currentPage - 1 });
          this.loadBatchesList().then(() => {
            this.renderBatchesList();
          });
        }
      });
    }
    
    const nextPageBtn = document.getElementById('next-page-btn');
    if (nextPageBtn) {
      nextPageBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
          this.setState({ currentPage: currentPage + 1 });
          this.loadBatchesList().then(() => {
            this.renderBatchesList();
          });
        }
      });
    }
  }
  
  /**
   * Render batch details
   */
  renderBatchDetails() {
    const { batchDetails } = this.data;
    
    if (!batchDetails) {
      this.elements.batchDetails.innerHTML = '<p>No batch details available.</p>';
      this.elements.batchDetails.style.display = 'block';
      return;
    }
    
    const { id, createdAt, completedAt, status, warehouse, picker, packer, items, timeline, metrics } = batchDetails;
    
    let detailsHTML = `
      <div class="batch-details">
        <div class="batch-details-header">
          <h3>Batch Details: ${id}</h3>
          <button class="btn btn-sm btn-outline" id="close-details-btn">Close</button>
        </div>
        
        <div class="batch-info-section">
          <h4>Batch Information</h4>
          <table class="details-table">
            <tr>
              <th>Batch ID</th>
              <td>${id}</td>
            </tr>
            <tr>
              <th>Created</th>
              <td>${new Date(createdAt).toLocaleString()}</td>
            </tr>
            <tr>
              <th>Completed</th>
              <td>${completedAt ? new Date(completedAt).toLocaleString() : 'Not completed'}</td>
            </tr>
            <tr>
              <th>Status</th>
              <td>
                <span class="status-badge status-${status}">
                  ${status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
              </td>
            </tr>
            <tr>
              <th>Warehouse</th>
              <td>${warehouse}</td>
            </tr>
            <tr>
              <th>Picker</th>
              <td>${picker ? picker.name : 'Not assigned'}</td>
            </tr>
            <tr>
              <th>Packer</th>
              <td>${packer ? packer.name : 'Not assigned'}</td>
            </tr>
          </table>
        </div>
        
        <div class="batch-metrics-section">
          <h4>Batch Metrics</h4>
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-value">${metrics.totalItems}</div>
              <div class="metric-label">Total Items</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">${metrics.pickTime ? metrics.pickTime.toFixed(1) : '-'}</div>
              <div class="metric-label">Pick Time (min)</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">${metrics.packTime ? metrics.packTime.toFixed(1) : '-'}</div>
              <div class="metric-label">Pack Time (min)</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">${metrics.totalTime ? metrics.totalTime.toFixed(1) : '-'}</div>
              <div class="metric-label">Total Time (min)</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">${metrics.pickRate ? metrics.pickRate.toFixed(1) : '-'}</div>
              <div class="metric-label">Pick Rate (items/hour)</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">${metrics.packRate ? metrics.packRate.toFixed(1) : '-'}</div>
              <div class="metric-label">Pack Rate (items/hour)</div>
            </div>
          </div>
        </div>
        
        <div class="batch-timeline-section">
          <h4>Batch Timeline</h4>
          <div class="timeline">
            ${timeline.map((event, index) => `
              <div class="timeline-item">
                <div class="timeline-point"></div>
                <div class="timeline-content">
                  <h5>${event.event}</h5>
                  <p>${new Date(event.time).toLocaleString()}</p>
                </div>
                ${index < timeline.length - 1 ? '<div class="timeline-connector"></div>' : ''}
              </div>
            `).join('')}
          </div>
        </div>
        
        <div class="batch-items-section">
          <h4>Batch Items</h4>
          <table class="data-table">
            <thead>
              <tr>
                <th>Product ID</th>
                <th>Product Name</th>
                <th>Quantity</th>
                <th>Pick Time (min)</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${item.id}</td>
                  <td>${item.name}</td>
                  <td>${item.quantity}</td>
                  <td>${item.pickTime ? item.pickTime.toFixed(1) : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    
    this.elements.batchDetails.innerHTML = detailsHTML;
    this.elements.batchDetails.style.display = 'block';
    
    // Add event listener for close button
    const closeBtn = document.getElementById('close-details-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.setState({ selectedBatchId: null });
        this.elements.batchDetails.style.display = 'none';
      });
    }
  }
  
  /**
   * Clean up resources when component is destroyed
   */
  destroy() {
    // Clear refresh timer
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    
    // Clear container elements
    if (this.elements.filters) {
      this.elements.filters.innerHTML = '';
    }
    
    if (this.elements.productivity) {
      this.elements.productivity.innerHTML = '';
    }
    
    if (this.elements.trends) {
      this.elements.trends.innerHTML = '';
    }
    
    if (this.elements.batches) {
      this.elements.batches.innerHTML = '';
    }
    
    if (this.elements.batchDetails) {
      this.elements.batchDetails.innerHTML = '';
      this.elements.batchDetails.style.display = 'none';
    }
  }
}

// Make BatchUIComponents available globally
window.BatchUIComponents = BatchUIComponents;
