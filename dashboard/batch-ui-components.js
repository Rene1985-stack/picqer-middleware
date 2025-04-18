/**
 * Enhanced Batch UI Components
 * 
 * This file provides enhanced UI components for displaying batch productivity data
 * with robust error handling and fallback mechanisms.
 */

// Batch UI Components
class BatchUIComponents {
  constructor(options = {}) {
    // Configuration options with defaults
    this.config = {
      apiBasePath: options.apiBasePath || window.location.origin,
      refreshInterval: options.refreshInterval || 60000, // 1 minute default
      fallbackEnabled: options.fallbackEnabled !== false, // Enabled by default
      dateFormat: options.dateFormat || { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
      chartColors: options.chartColors || {
        picker: 'rgba(54, 162, 235, 0.8)',
        packer: 'rgba(255, 99, 132, 0.8)',
        background: 'rgba(255, 255, 255, 0.8)'
      }
    };
    
    // Initialize state
    this.state = {
      loading: false,
      error: null,
      data: null,
      trends: null,
      batches: null,
      selectedBatchId: null,
      selectedBatchDetails: null,
      filters: {
        startDate: this.getDefaultStartDate(),
        endDate: new Date(),
        userId: null,
        status: null
      },
      usingFallbackData: false
    };
    
    // Bind methods
    this.init = this.init.bind(this);
    this.fetchProductivityData = this.fetchProductivityData.bind(this);
    this.fetchTrendsData = this.fetchTrendsData.bind(this);
    this.fetchBatchesList = this.fetchBatchesList.bind(this);
    this.fetchBatchDetails = this.fetchBatchDetails.bind(this);
    this.renderProductivityDashboard = this.renderProductivityDashboard.bind(this);
    this.renderTrendsChart = this.renderTrendsChart.bind(this);
    this.renderBatchesList = this.renderBatchesList.bind(this);
    this.renderBatchDetails = this.renderBatchDetails.bind(this);
    this.handleApiError = this.handleApiError.bind(this);
    this.getFallbackData = this.getFallbackData.bind(this);
    this.formatDate = this.formatDate.bind(this);
    this.formatDuration = this.formatDuration.bind(this);
    this.updateFilters = this.updateFilters.bind(this);
  }
  
  /**
   * Initialize the batch UI components
   * @param {Object} containerElements - DOM elements for rendering
   */
  init(containerElements) {
    this.containers = containerElements;
    
    // Initialize event listeners for filter controls
    this.initFilterControls();
    
    // Initial data fetch
    this.fetchProductivityData();
    this.fetchTrendsData();
    this.fetchBatchesList();
    
    // Set up refresh intervals
    this.refreshIntervals = {
      productivity: setInterval(this.fetchProductivityData, this.config.refreshInterval),
      trends: setInterval(this.fetchTrendsData, this.config.refreshInterval * 2),
      batches: setInterval(this.fetchBatchesList, this.config.refreshInterval)
    };
    
    console.log('Batch UI components initialized');
  }
  
  /**
   * Initialize filter controls
   */
  initFilterControls() {
    // Only proceed if filter container exists
    if (!this.containers.filters) return;
    
    // Create date range filters
    const dateFilters = document.createElement('div');
    dateFilters.className = 'date-filters';
    dateFilters.innerHTML = `
      <div class="filter-group">
        <label for="startDate">Start Date:</label>
        <input type="date" id="startDate" value="${this.formatDateForInput(this.state.filters.startDate)}">
      </div>
      <div class="filter-group">
        <label for="endDate">End Date:</label>
        <input type="date" id="endDate" value="${this.formatDateForInput(this.state.filters.endDate)}">
      </div>
      <button id="applyDateFilter" class="btn btn-primary">Apply</button>
      <button id="resetDateFilter" class="btn btn-secondary">Reset</button>
    `;
    
    // Append filters to container
    this.containers.filters.appendChild(dateFilters);
    
    // Add event listeners
    document.getElementById('applyDateFilter').addEventListener('click', () => {
      const startDate = new Date(document.getElementById('startDate').value);
      const endDate = new Date(document.getElementById('endDate').value);
      
      if (startDate > endDate) {
        alert('Start date cannot be after end date');
        return;
      }
      
      this.updateFilters({ startDate, endDate });
    });
    
    document.getElementById('resetDateFilter').addEventListener('click', () => {
      this.updateFilters({
        startDate: this.getDefaultStartDate(),
        endDate: new Date()
      });
      
      document.getElementById('startDate').value = this.formatDateForInput(this.getDefaultStartDate());
      document.getElementById('endDate').value = this.formatDateForInput(new Date());
    });
  }
  
  /**
   * Update filters and refresh data
   * @param {Object} newFilters - New filter values
   */
  updateFilters(newFilters) {
    this.state.filters = {
      ...this.state.filters,
      ...newFilters
    };
    
    // Refresh data with new filters
    this.fetchProductivityData();
    this.fetchTrendsData();
    this.fetchBatchesList();
  }
  
  /**
   * Get default start date (30 days ago)
   * @returns {Date} Default start date
   */
  getDefaultStartDate() {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date;
  }
  
  /**
   * Format date for input elements
   * @param {Date} date - Date to format
   * @returns {string} Formatted date string (YYYY-MM-DD)
   */
  formatDateForInput(date) {
    return date.toISOString().split('T')[0];
  }
  
  /**
   * Fetch productivity data from API
   */
  async fetchProductivityData() {
    if (!this.containers.productivity) return;
    
    try {
      this.state.loading = true;
      this.state.error = null;
      this.state.usingFallbackData = false;
      this.renderLoadingState(this.containers.productivity);
      
      // Build URL with filters
      const url = new URL(`${this.config.apiBasePath}/api/batches/productivity`);
      url.searchParams.append('startDate', this.state.filters.startDate.toISOString());
      url.searchParams.append('endDate', this.state.filters.endDate.toISOString());
      if (this.state.filters.userId) {
        url.searchParams.append('userId', this.state.filters.userId);
      }
      url.searchParams.append('includeRoles', 'true');
      
      // Fetch data
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Unknown API error');
      }
      
      this.state.data = result.data;
      this.state.loading = false;
      this.renderProductivityDashboard();
    } catch (error) {
      console.error('Error fetching batch productivity:', error);
      this.handleApiError(error, 'productivity');
    }
  }
  
  /**
   * Fetch trends data from API
   */
  async fetchTrendsData() {
    if (!this.containers.trends) return;
    
    try {
      this.state.loading = true;
      this.renderLoadingState(this.containers.trends);
      
      // Build URL with filters
      const url = new URL(`${this.config.apiBasePath}/api/batches/trends`);
      url.searchParams.append('startDate', this.state.filters.startDate.toISOString());
      url.searchParams.append('endDate', this.state.filters.endDate.toISOString());
      url.searchParams.append('interval', 'daily');
      
      // Fetch data
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Unknown API error');
      }
      
      this.state.trends = result.data;
      this.state.loading = false;
      this.renderTrendsChart();
    } catch (error) {
      console.error('Error fetching batch trends:', error);
      this.handleApiError(error, 'trends');
    }
  }
  
  /**
   * Fetch batches list from API
   */
  async fetchBatchesList() {
    if (!this.containers.batches) return;
    
    try {
      this.state.loading = true;
      this.renderLoadingState(this.containers.batches);
      
      // Build URL with filters
      const url = new URL(`${this.config.apiBasePath}/api/batches`);
      url.searchParams.append('startDate', this.state.filters.startDate.toISOString());
      url.searchParams.append('endDate', this.state.filters.endDate.toISOString());
      url.searchParams.append('page', '1');
      url.searchParams.append('limit', '10');
      
      if (this.state.filters.userId) {
        url.searchParams.append('pickerId', this.state.filters.userId);
      }
      
      if (this.state.filters.status) {
        url.searchParams.append('status', this.state.filters.status);
      }
      
      // Fetch data
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Unknown API error');
      }
      
      this.state.batches = result.data;
      this.state.loading = false;
      this.renderBatchesList();
    } catch (error) {
      console.error('Error fetching batches list:', error);
      this.handleApiError(error, 'batches');
    }
  }
  
  /**
   * Fetch batch details from API
   * @param {number} batchId - Batch ID to fetch details for
   */
  async fetchBatchDetails(batchId) {
    if (!this.containers.batchDetails) return;
    
    try {
      this.state.loading = true;
      this.state.selectedBatchId = batchId;
      this.renderLoadingState(this.containers.batchDetails);
      
      // Fetch data
      const response = await fetch(`${this.config.apiBasePath}/api/batches/${batchId}`);
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Unknown API error');
      }
      
      this.state.selectedBatchDetails = result.data;
      this.state.loading = false;
      this.renderBatchDetails();
    } catch (error) {
      console.error(`Error fetching batch details for batch ${batchId}:`, error);
      this.handleApiError(error, 'batchDetails');
    }
  }
  
  /**
   * Handle API errors with fallback mechanisms
   * @param {Error} error - Error object
   * @param {string} dataType - Type of data being fetched
   */
  handleApiError(error, dataType) {
    this.state.error = error.message;
    this.state.loading = false;
    
    // Use fallback data if enabled
    if (this.config.fallbackEnabled) {
      this.state.usingFallbackData = true;
      
      switch (dataType) {
        case 'productivity':
          this.state.data = this.getFallbackData('productivity');
          this.renderProductivityDashboard();
          break;
        case 'trends':
          this.state.trends = this.getFallbackData('trends');
          this.renderTrendsChart();
          break;
        case 'batches':
          this.state.batches = this.getFallbackData('batches');
          this.renderBatchesList();
          break;
        case 'batchDetails':
          this.state.selectedBatchDetails = this.getFallbackData('batchDetails', this.state.selectedBatchId);
          this.renderBatchDetails();
          break;
      }
    } else {
      // Render error state
      const container = this.containers[dataType];
      if (container) {
        container.innerHTML = `
          <div class="error-container">
            <h3>Error Loading Data</h3>
            <p>${error.message}</p>
            <button class="btn btn-primary retry-btn">Retry</button>
          </div>
        `;
        
        // Add retry button event listener
        const retryBtn = container.querySelector('.retry-btn');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => {
            switch (dataType) {
              case 'productivity':
                this.fetchProductivityData();
                break;
              case 'trends':
                this.fetchTrendsData();
                break;
              case 'batches':
                this.fetchBatchesList();
                break;
              case 'batchDetails':
                this.fetchBatchDetails(this.state.selectedBatchId);
                break;
            }
          });
        }
      }
    }
  }
  
  /**
   * Get fallback data for different data types
   * @param {string} dataType - Type of data to get fallback for
   * @param {number} [id] - Optional ID for specific item details
   * @returns {Object} Fallback data
   */
  getFallbackData(dataType, id) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    switch (dataType) {
      case 'productivity':
        return {
          picker_productivity: [
            {
              user_id: 1,
              user_name: 'John Doe',
              total_batches: 45,
              total_products: 1250,
              total_picking_minutes: 1800,
              products_per_hour: 41.67,
              batches_per_hour: 1.5,
              min_picking_minutes: 15,
              max_picking_minutes: 120,
              avg_picking_minutes: 40
            },
            {
              user_id: 2,
              user_name: 'Jane Smith',
              total_batches: 38,
              total_products: 980,
              total_picking_minutes: 1500,
              products_per_hour: 39.2,
              batches_per_hour: 1.52,
              min_picking_minutes: 18,
              max_picking_minutes: 95,
              avg_picking_minutes: 39.47
            }
          ],
          packer_productivity: [
            {
              user_id: 3,
              user_name: 'Bob Johnson',
              total_batches: 52,
              total_products: 1430,
              total_packing_minutes: 1560,
              products_per_hour: 55,
              batches_per_hour: 2,
              min_packing_minutes: 12,
              max_packing_minutes: 85,
              avg_packing_minutes: 30
            },
            {
              user_id: 4,
              user_name: 'Alice Williams',
              total_batches: 48,
              total_products: 1350,
              total_packing_minutes: 1440,
              products_per_hour: 56.25,
              batches_per_hour: 2,
              min_packing_minutes: 15,
              max_packing_minutes: 75,
              avg_packing_minutes: 30
            }
          ],
          role_distribution: [
            {
              user_id: 1,
              user_name: 'John Doe',
              batches_picked: 45,
              total_picking_minutes: 1800,
              batches_packed: 0,
              total_packing_minutes: 0,
              primary_role: 'Picker'
            },
            {
              user_id: 2,
              user_name: 'Jane Smith',
              batches_picked: 38,
              total_picking_minutes: 1500,
              batches_packed: 0,
              total_packing_minutes: 0,
              primary_role: 'Picker'
            },
            {
              user_id: 3,
              user_name: 'Bob Johnson',
              batches_picked: 0,
              total_picking_minutes: 0,
              batches_packed: 52,
              total_packing_minutes: 1560,
              primary_role: 'Packer'
            },
            {
              user_id: 4,
              user_name: 'Alice Williams',
              batches_picked: 0,
              total_picking_minutes: 0,
              batches_packed: 48,
              total_packing_minutes: 1440,
              primary_role: 'Packer'
            },
            {
              user_id: 5,
              user_name: 'Charlie Brown',
              batches_picked: 25,
              total_picking_minutes: 1000,
              batches_packed: 30,
              total_packing_minutes: 900,
              primary_role: 'Both'
            }
          ],
          period: {
            start_date: thirtyDaysAgo,
            end_date: now
          }
        };
      
      case 'trends':
        // Generate daily data for the past 30 days
        const pickerDailyTrends = [];
        const packerDailyTrends = [];
        
        for (let i = 0; i < 30; i++) {
          const date = new Date(thirtyDaysAgo);
          date.setDate(date.getDate() + i);
          
          pickerDailyTrends.push({
            work_date: date,
            unique_pickers: Math.floor(Math.random() * 3) + 2,
            total_batches: Math.floor(Math.random() * 10) + 10,
            total_products: Math.floor(Math.random() * 300) + 200,
            total_picking_minutes: Math.floor(Math.random() * 300) + 300,
            products_per_hour: Math.floor(Math.random() * 20) + 30
          });
          
          packerDailyTrends.push({
            work_date: date,
            unique_packers: Math.floor(Math.random() * 3) + 2,
            total_batches: Math.floor(Math.random() * 10) + 10,
            total_products: Math.floor(Math.random() * 300) + 200,
            total_packing_minutes: Math.floor(Math.random() * 300) + 300,
            products_per_hour: Math.floor(Math.random() * 20) + 40
          });
        }
        
        return {
          picker_daily_trends: pickerDailyTrends,
          packer_daily_trends: packerDailyTrends,
          period: {
            start_date: thirtyDaysAgo,
            end_date: now
          }
        };
      
      case 'batches':
        // Generate 10 sample batches
        const batches = [];
        
        for (let i = 1; i <= 10; i++) {
          const createdAt = new Date(thirtyDaysAgo);
          createdAt.setDate(createdAt.getDate() + Math.floor(Math.random() * 30));
          
          const pickingStartedAt = new Date(createdAt);
          pickingStartedAt.setMinutes(pickingStartedAt.getMinutes() + Math.floor(Math.random() * 60));
          
          const pickingCompletedAt = new Date(pickingStartedAt);
          pickingCompletedAt.setMinutes(pickingCompletedAt.getMinutes() + Math.floor(Math.random() * 60) + 15);
          
          const packingStartedAt = new Date(pickingCompletedAt);
          packingStartedAt.setMinutes(packingStartedAt.getMinutes() + Math.floor(Math.random() * 30));
          
          const closedAt = new Date(packingStartedAt);
          closedAt.setMinutes(closedAt.getMinutes() + Math.floor(Math.random() * 45) + 15);
          
          batches.push({
            id: i,
            batch_number: `B${1000 + i}`,
            total_products: Math.floor(Math.random() * 50) + 10,
            total_picklists: Math.floor(Math.random() * 5) + 1,
            status: ['completed', 'in_progress', 'pending'][Math.floor(Math.random() * 3)],
            created_at: createdAt,
            picking_started_at: pickingStartedAt,
            picking_completed_at: pickingCompletedAt,
            packing_started_at: packingStartedAt,
            closed_at: closedAt,
            picker_id: Math.floor(Math.random() * 3) + 1,
            picker_name: ['John Doe', 'Jane Smith', 'Charlie Brown'][Math.floor(Math.random() * 3)],
            packer_id: Math.floor(Math.random() * 2) + 3,
            packer_name: ['Bob Johnson', 'Alice Williams'][Math.floor(Math.random() * 2)]
          });
        }
        
        return {
          batches,
          pagination: {
            page: 1,
            limit: 10,
            total: 45,
            pages: 5
          },
          filters: {
            start_date: thirtyDaysAgo,
            end_date: now
          }
        };
      
      case 'batchDetails':
        // Generate details for a specific batch
        const batchId = id || 1;
        const createdAt = new Date(thirtyDaysAgo);
        createdAt.setDate(createdAt.getDate() + Math.floor(Math.random() * 30));
        
        const pickingStartedAt = new Date(createdAt);
        pickingStartedAt.setMinutes(pickingStartedAt.getMinutes() + Math.floor(Math.random() * 60));
        
        const pickingCompletedAt = new Date(pickingStartedAt);
        pickingCompletedAt.setMinutes(pickingCompletedAt.getMinutes() + Math.floor(Math.random() * 60) + 15);
        
        const packingStartedAt = new Date(pickingCompletedAt);
        packingStartedAt.setMinutes(packingStartedAt.getMinutes() + Math.floor(Math.random() * 30));
        
        const closedAt = new Date(packingStartedAt);
        closedAt.setMinutes(closedAt.getMinutes() + Math.floor(Math.random() * 45) + 15);
        
        return {
          batch_id: batchId,
          batch_number: `B${1000 + batchId}`,
          total_products: Math.floor(Math.random() * 50) + 10,
          total_picklists: Math.floor(Math.random() * 5) + 1,
          picker_name: ['John Doe', 'Jane Smith', 'Charlie Brown'][Math.floor(Math.random() * 3)],
          packer_name: ['Bob Johnson', 'Alice Williams'][Math.floor(Math.random() * 2)],
          created_at: createdAt,
          picking_started_at: pickingStartedAt,
          picking_completed_at: pickingCompletedAt,
          packing_started_at: packingStartedAt,
          closed_at: closedAt,
          wait_time_minutes: Math.floor(Math.random() * 60),
          picking_time_minutes: Math.floor(Math.random() * 60) + 15,
          transition_time_minutes: Math.floor(Math.random() * 30),
          packing_time_minutes: Math.floor(Math.random() * 45) + 15,
          total_processing_time_minutes: Math.floor(Math.random() * 180) + 60
        };
      
      default:
        return null;
    }
  }
  
  /**
   * Render loading state in container
   * @param {HTMLElement} container - Container element
   */
  renderLoadingState(container) {
    if (!container) return;
    
    container.innerHTML = `
      <div class="loading-container">
        <div class="spinner"></div>
        <p>Loading data...</p>
      </div>
    `;
  }
  
  /**
   * Render productivity dashboard
   */
  renderProductivityDashboard() {
    if (!this.containers.productivity || !this.state.data) return;
    
    const { picker_productivity, packer_productivity, role_distribution } = this.state.data;
    
    // Create fallback notice if using fallback data
    const fallbackNotice = this.state.usingFallbackData ? `
      <div class="fallback-notice">
        <p><strong>Note:</strong> Displaying sample data. The productivity API endpoint is currently unavailable.</p>
      </div>
    ` : '';
    
    // Create picker productivity table
    const pickerTable = `
      <div class="productivity-section">
        <h3>Picker Productivity</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Picker</th>
              <th>Batches</th>
              <th>Products</th>
              <th>Products/Hour</th>
              <th>Batches/Hour</th>
              <th>Avg. Time (min)</th>
            </tr>
          </thead>
          <tbody>
            ${picker_productivity.map(picker => `
              <tr>
                <td>${this.escapeHtml(picker.user_name)}</td>
                <td>${picker.total_batches}</td>
                <td>${picker.total_products}</td>
                <td>${picker.products_per_hour.toFixed(2)}</td>
                <td>${picker.batches_per_hour.toFixed(2)}</td>
                <td>${picker.avg_picking_minutes.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    
    // Create packer productivity table
    const packerTable = `
      <div class="productivity-section">
        <h3>Packer Productivity</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Packer</th>
              <th>Batches</th>
              <th>Products</th>
              <th>Products/Hour</th>
              <th>Batches/Hour</th>
              <th>Avg. Time (min)</th>
            </tr>
          </thead>
          <tbody>
            ${packer_productivity.map(packer => `
              <tr>
                <td>${this.escapeHtml(packer.user_name)}</td>
                <td>${packer.total_batches}</td>
                <td>${packer.total_products}</td>
                <td>${packer.products_per_hour.toFixed(2)}</td>
                <td>${packer.batches_per_hour.toFixed(2)}</td>
                <td>${packer.avg_packing_minutes.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    
    // Create role distribution section if available
    let roleDistributionSection = '';
    if (role_distribution) {
      roleDistributionSection = `
        <div class="productivity-section">
          <h3>User Role Distribution</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Primary Role</th>
                <th>Batches Picked</th>
                <th>Picking Time (min)</th>
                <th>Batches Packed</th>
                <th>Packing Time (min)</th>
              </tr>
            </thead>
            <tbody>
              ${role_distribution.map(user => `
                <tr>
                  <td>${this.escapeHtml(user.user_name)}</td>
                  <td>${user.primary_role}</td>
                  <td>${user.batches_picked}</td>
                  <td>${user.total_picking_minutes}</td>
                  <td>${user.batches_packed}</td>
                  <td>${user.total_packing_minutes}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
    
    // Create date range info
    const dateRange = `
      <div class="date-range-info">
        <p>Data for period: ${this.formatDate(this.state.data.period.start_date)} - ${this.formatDate(this.state.data.period.end_date)}</p>
      </div>
    `;
    
    // Render all sections
    this.containers.productivity.innerHTML = `
      ${fallbackNotice}
      ${dateRange}
      <div class="productivity-dashboard">
        ${pickerTable}
        ${packerTable}
        ${roleDistributionSection}
      </div>
    `;
  }
  
  /**
   * Render trends chart
   */
  renderTrendsChart() {
    if (!this.containers.trends || !this.state.trends) return;
    
    // Create fallback notice if using fallback data
    const fallbackNotice = this.state.usingFallbackData ? `
      <div class="fallback-notice">
        <p><strong>Note:</strong> Displaying sample data. The trends API endpoint is currently unavailable.</p>
      </div>
    ` : '';
    
    // Create date range info
    const dateRange = `
      <div class="date-range-info">
        <p>Trends for period: ${this.formatDate(this.state.trends.period.start_date)} - ${this.formatDate(this.state.trends.period.end_date)}</p>
      </div>
    `;
    
    // Create chart container
    const chartContainer = `
      <div class="chart-container">
        <canvas id="productivityTrendsChart"></canvas>
      </div>
    `;
    
    // Render container
    this.containers.trends.innerHTML = `
      ${fallbackNotice}
      ${dateRange}
      ${chartContainer}
    `;
    
    // Render chart if Chart.js is available
    if (window.Chart) {
      this.renderProductivityTrendsChart();
    } else {
      // Fallback to table if Chart.js is not available
      this.renderTrendsTable();
    }
  }
  
  /**
   * Render productivity trends chart using Chart.js
   */
  renderProductivityTrendsChart() {
    const canvas = document.getElementById('productivityTrendsChart');
    if (!canvas) return;
    
    const { picker_daily_trends, packer_daily_trends } = this.state.trends;
    
    // Prepare data for chart
    const labels = picker_daily_trends.map(day => this.formatDate(day.work_date, { month: 'short', day: 'numeric' }));
    
    const pickerData = picker_daily_trends.map(day => day.products_per_hour);
    const packerData = packer_daily_trends.map(day => day.products_per_hour);
    
    // Create chart
    new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Picker Productivity (Products/Hour)',
            data: pickerData,
            borderColor: this.config.chartColors.picker,
            backgroundColor: this.config.chartColors.picker.replace('0.8', '0.1'),
            tension: 0.4
          },
          {
            label: 'Packer Productivity (Products/Hour)',
            data: packerData,
            borderColor: this.config.chartColors.packer,
            backgroundColor: this.config.chartColors.packer.replace('0.8', '0.1'),
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Daily Productivity Trends (Products/Hour)'
          },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Products per Hour'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Date'
            }
          }
        }
      }
    });
  }
  
  /**
   * Render trends table (fallback if Chart.js is not available)
   */
  renderTrendsTable() {
    const chartContainer = document.querySelector('.chart-container');
    if (!chartContainer) return;
    
    const { picker_daily_trends, packer_daily_trends } = this.state.trends;
    
    // Create table
    chartContainer.innerHTML = `
      <div class="trends-table-container">
        <h3>Daily Productivity Trends</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Picker Products/Hour</th>
              <th>Packer Products/Hour</th>
              <th>Picker Batches</th>
              <th>Packer Batches</th>
            </tr>
          </thead>
          <tbody>
            ${picker_daily_trends.map((day, index) => `
              <tr>
                <td>${this.formatDate(day.work_date, { month: 'short', day: 'numeric' })}</td>
                <td>${day.products_per_hour.toFixed(2)}</td>
                <td>${packer_daily_trends[index].products_per_hour.toFixed(2)}</td>
                <td>${day.total_batches}</td>
                <td>${packer_daily_trends[index].total_batches}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  /**
   * Render batches list
   */
  renderBatchesList() {
    if (!this.containers.batches || !this.state.batches) return;
    
    const { batches, pagination } = this.state.batches;
    
    // Create fallback notice if using fallback data
    const fallbackNotice = this.state.usingFallbackData ? `
      <div class="fallback-notice">
        <p><strong>Note:</strong> Displaying sample data. The batches API endpoint is currently unavailable.</p>
      </div>
    ` : '';
    
    // Create batches table
    const batchesTable = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Batch #</th>
            <th>Products</th>
            <th>Picklists</th>
            <th>Picker</th>
            <th>Packer</th>
            <th>Created</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${batches.map(batch => `
            <tr>
              <td>${this.escapeHtml(batch.batch_number)}</td>
              <td>${batch.total_products}</td>
              <td>${batch.total_picklists}</td>
              <td>${batch.picker_name ? this.escapeHtml(batch.picker_name) : '-'}</td>
              <td>${batch.packer_name ? this.escapeHtml(batch.packer_name) : '-'}</td>
              <td>${this.formatDate(batch.created_at)}</td>
              <td>${this.formatStatus(batch.status)}</td>
              <td>
                <button class="btn btn-sm btn-primary view-batch-btn" data-batch-id="${batch.id}">View Details</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    
    // Create pagination controls
    const paginationControls = `
      <div class="pagination-controls">
        <span>Page ${pagination.page} of ${pagination.pages}</span>
        <div class="pagination-buttons">
          <button class="btn btn-sm ${pagination.page === 1 ? 'btn-disabled' : 'btn-secondary'}" 
                  ${pagination.page === 1 ? 'disabled' : ''} 
                  data-page="${pagination.page - 1}">Previous</button>
          <button class="btn btn-sm ${pagination.page === pagination.pages ? 'btn-disabled' : 'btn-secondary'}" 
                  ${pagination.page === pagination.pages ? 'disabled' : ''} 
                  data-page="${pagination.page + 1}">Next</button>
        </div>
      </div>
    `;
    
    // Render all sections
    this.containers.batches.innerHTML = `
      ${fallbackNotice}
      <div class="batches-list">
        ${batchesTable}
        ${paginationControls}
      </div>
    `;
    
    // Add event listeners for batch detail buttons
    const viewBatchButtons = this.containers.batches.querySelectorAll('.view-batch-btn');
    viewBatchButtons.forEach(button => {
      button.addEventListener('click', () => {
        const batchId = parseInt(button.getAttribute('data-batch-id'));
        this.fetchBatchDetails(batchId);
      });
    });
    
    // Add event listeners for pagination buttons
    const paginationButtons = this.containers.batches.querySelectorAll('.pagination-buttons button:not(.btn-disabled)');
    paginationButtons.forEach(button => {
      button.addEventListener('click', () => {
        const page = parseInt(button.getAttribute('data-page'));
        // Update page in state and fetch new data
        // In a real implementation, this would update the page and refetch
        alert(`Pagination would navigate to page ${page}`);
      });
    });
  }
  
  /**
   * Render batch details
   */
  renderBatchDetails() {
    if (!this.containers.batchDetails || !this.state.selectedBatchDetails) return;
    
    const batch = this.state.selectedBatchDetails;
    
    // Create fallback notice if using fallback data
    const fallbackNotice = this.state.usingFallbackData ? `
      <div class="fallback-notice">
        <p><strong>Note:</strong> Displaying sample data. The batch details API endpoint is currently unavailable.</p>
      </div>
    ` : '';
    
    // Create batch details
    const batchDetails = `
      <div class="batch-details-header">
        <h3>Batch ${this.escapeHtml(batch.batch_number)} Details</h3>
        <button class="btn btn-sm btn-secondary close-details-btn">Back to List</button>
      </div>
      
      <div class="batch-details-content">
        <div class="batch-info-section">
          <h4>Batch Information</h4>
          <table class="details-table">
            <tr>
              <th>Batch ID:</th>
              <td>${batch.batch_id}</td>
              <th>Total Products:</th>
              <td>${batch.total_products}</td>
            </tr>
            <tr>
              <th>Picker:</th>
              <td>${batch.picker_name ? this.escapeHtml(batch.picker_name) : '-'}</td>
              <th>Total Picklists:</th>
              <td>${batch.total_picklists}</td>
            </tr>
            <tr>
              <th>Packer:</th>
              <td>${batch.packer_name ? this.escapeHtml(batch.packer_name) : '-'}</td>
              <th>Total Processing Time:</th>
              <td>${this.formatDuration(batch.total_processing_time_minutes)}</td>
            </tr>
          </table>
        </div>
        
        <div class="batch-timeline-section">
          <h4>Processing Timeline</h4>
          <div class="timeline">
            <div class="timeline-item">
              <div class="timeline-point"></div>
              <div class="timeline-content">
                <h5>Created</h5>
                <p>${this.formatDate(batch.created_at)}</p>
              </div>
            </div>
            <div class="timeline-connector">
              <span>${this.formatDuration(batch.wait_time_minutes)} wait time</span>
            </div>
            <div class="timeline-item">
              <div class="timeline-point"></div>
              <div class="timeline-content">
                <h5>Picking Started</h5>
                <p>${this.formatDate(batch.picking_started_at)}</p>
              </div>
            </div>
            <div class="timeline-connector">
              <span>${this.formatDuration(batch.picking_time_minutes)} picking time</span>
            </div>
            <div class="timeline-item">
              <div class="timeline-point"></div>
              <div class="timeline-content">
                <h5>Picking Completed</h5>
                <p>${this.formatDate(batch.picking_completed_at)}</p>
              </div>
            </div>
            <div class="timeline-connector">
              <span>${this.formatDuration(batch.transition_time_minutes)} transition time</span>
            </div>
            <div class="timeline-item">
              <div class="timeline-point"></div>
              <div class="timeline-content">
                <h5>Packing Started</h5>
                <p>${this.formatDate(batch.packing_started_at)}</p>
              </div>
            </div>
            <div class="timeline-connector">
              <span>${this.formatDuration(batch.packing_time_minutes)} packing time</span>
            </div>
            <div class="timeline-item">
              <div class="timeline-point"></div>
              <div class="timeline-content">
                <h5>Batch Closed</h5>
                <p>${this.formatDate(batch.closed_at)}</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="batch-metrics-section">
          <h4>Processing Metrics</h4>
          <div class="metrics-grid">
            <div class="metric-card">
              <h5>Wait Time</h5>
              <p class="metric-value">${this.formatDuration(batch.wait_time_minutes)}</p>
              <p class="metric-label">Time before picking started</p>
            </div>
            <div class="metric-card">
              <h5>Picking Time</h5>
              <p class="metric-value">${this.formatDuration(batch.picking_time_minutes)}</p>
              <p class="metric-label">Time spent picking products</p>
            </div>
            <div class="metric-card">
              <h5>Transition Time</h5>
              <p class="metric-value">${this.formatDuration(batch.transition_time_minutes)}</p>
              <p class="metric-label">Time between picking and packing</p>
            </div>
            <div class="metric-card">
              <h5>Packing Time</h5>
              <p class="metric-value">${this.formatDuration(batch.packing_time_minutes)}</p>
              <p class="metric-label">Time spent packing products</p>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Render batch details
    this.containers.batchDetails.innerHTML = `
      ${fallbackNotice}
      <div class="batch-details">
        ${batchDetails}
      </div>
    `;
    
    // Show batch details container and hide batches list
    if (this.containers.batches) {
      this.containers.batches.style.display = 'none';
    }
    this.containers.batchDetails.style.display = 'block';
    
    // Add event listener for close button
    const closeButton = this.containers.batchDetails.querySelector('.close-details-btn');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        // Hide batch details and show batches list
        this.containers.batchDetails.style.display = 'none';
        if (this.containers.batches) {
          this.containers.batches.style.display = 'block';
        }
      });
    }
  }
  
  /**
   * Format date for display
   * @param {Date|string} date - Date to format
   * @param {Object} [options] - Intl.DateTimeFormat options
   * @returns {string} Formatted date string
   */
  formatDate(date, options = this.config.dateFormat) {
    if (!date) return '-';
    
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      return new Intl.DateTimeFormat('default', options).format(dateObj);
    } catch (error) {
      console.error('Error formatting date:', error);
      return String(date);
    }
  }
  
  /**
   * Format duration for display
   * @param {number} minutes - Duration in minutes
   * @returns {string} Formatted duration string
   */
  formatDuration(minutes) {
    if (minutes === null || minutes === undefined) return '-';
    
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    } else {
      return `${mins}m`;
    }
  }
  
  /**
   * Format batch status for display
   * @param {string} status - Batch status
   * @returns {string} Formatted status HTML
   */
  formatStatus(status) {
    if (!status) return '-';
    
    const statusMap = {
      'pending': '<span class="status-badge status-pending">Pending</span>',
      'in_progress': '<span class="status-badge status-in-progress">In Progress</span>',
      'completed': '<span class="status-badge status-completed">Completed</span>',
      'cancelled': '<span class="status-badge status-cancelled">Cancelled</span>'
    };
    
    return statusMap[status.toLowerCase()] || `<span class="status-badge">${this.escapeHtml(status)}</span>`;
  }
  
  /**
   * Escape HTML special characters
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    if (!text) return '';
    
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }
  
  /**
   * Clean up resources when component is destroyed
   */
  destroy() {
    // Clear refresh intervals
    if (this.refreshIntervals) {
      Object.values(this.refreshIntervals).forEach(interval => clearInterval(interval));
    }
    
    console.log('Batch UI components destroyed');
  }
}

// Export the BatchUIComponents class
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BatchUIComponents;
} else {
  window.BatchUIComponents = BatchUIComponents;
}
