/**
 * Enhanced Picqer API Client with Pagination and Rate Limiting
 * 
 * This client handles API requests to Picqer with built-in pagination and rate limiting support.
 */
const axios = require('axios');

class PicqerApiClient {
  /**
   * Create a new Picqer API client
   * @param {Object} config - API configuration
   */
  constructor(config) {
    this.baseUrl = config.apiUrl || process.env.PICQER_API_URL;
    this.apiKey = config.apiKey || process.env.PICQER_API_KEY;
    this.waitOnRateLimit = config.waitOnRateLimit !== undefined ? 
      config.waitOnRateLimit : 
      (process.env.PICQER_RATE_LIMIT_WAIT === 'true');
    this.sleepTimeOnRateLimitHit = config.sleepTimeOnRateLimitHit || 
      parseInt(process.env.PICQER_RATE_LIMIT_SLEEP_MS || '20000');
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.requestDelay = config.requestDelay || 100; // ms between requests
    this.stats = {
      totalRequests: 0,
      rateLimitHits: 0,
      retries: 0
    };
  }

  /**
   * Make a GET request to the Picqer API with pagination support
   * @param {string} endpoint - API endpoint
   * @param {Object} params - Query parameters
   * @param {boolean} paginate - Whether to handle pagination automatically
   * @returns {Promise<Array|Object>} - API response
   */
  async get(endpoint, params = {}, paginate = true) {
    try {
      // Initial request
      let allResults = [];
      let offset = 0;
      let hasMoreResults = true;
      
      // Continue fetching until no more results
      while (hasMoreResults) {
        // Add offset parameter for pagination
        const paginatedParams = { ...params, offset };
        
        // Make the request
        const response = await this.makeRequest('GET', endpoint, paginatedParams);
        
        // Handle different response formats
        if (Array.isArray(response)) {
          allResults = allResults.concat(response);
          // If we got less than 100 results, we've reached the end
          hasMoreResults = response.length === 100 && paginate;
        } else if (response && response.data && Array.isArray(response.data)) {
          allResults = allResults.concat(response.data);
          // If we got less than 100 results, we've reached the end
          hasMoreResults = response.data.length === 100 && paginate;
        } else {
          // Not an array response, just return it directly
          return response;
        }
        
        // Increment offset for next page
        if (hasMoreResults) {
          offset += 100;
          console.log(`Fetched 100 results, continuing with offset ${offset}...`);
        }
      }
      
      // Return all results
      return allResults;
    } catch (error) {
      console.error(`Error in GET request to ${endpoint}:`, error.message);
      throw error;
    }
  }

  /**
   * Make a POST request to the Picqer API
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @returns {Promise<Object>} - API response
   */
  async post(endpoint, data = {}) {
    return this.makeRequest('POST', endpoint, {}, data);
  }

  /**
   * Make a PUT request to the Picqer API
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @returns {Promise<Object>} - API response
   */
  async put(endpoint, data = {}) {
    return this.makeRequest('PUT', endpoint, {}, data);
  }

  /**
   * Make a DELETE request to the Picqer API
   * @param {string} endpoint - API endpoint
   * @returns {Promise<Object>} - API response
   */
  async delete(endpoint) {
    return this.makeRequest('DELETE', endpoint);
  }

  /**
   * Make a request to the Picqer API with rate limiting and retries
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} params - Query parameters
   * @param {Object} data - Request body
   * @returns {Promise<Object>} - API response
   */
  async makeRequest(method, endpoint, params = {}, data = {}) {
    // Add request to queue and process
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        method,
        endpoint,
        params,
        data,
        resolve,
        reject,
        retries: 0
      });
      
      // Start processing queue if not already processing
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  /**
   * Process the request queue with rate limiting
   */
  async processQueue() {
    if (this.requestQueue.length === 0) {
      this.isProcessingQueue = false;
      return;
    }
    
    this.isProcessingQueue = true;
    const request = this.requestQueue.shift();
    
    try {
      // Add delay between requests to prevent hitting rate limits
      await new Promise(resolve => setTimeout(resolve, this.requestDelay));
      
      // Make the request
      const response = await this.executeRequest(
        request.method,
        request.endpoint,
        request.params,
        request.data,
        request.retries
      );
      
      // Resolve the promise
      request.resolve(response);
    } catch (error) {
      // Handle rate limiting
      if (error.response && error.response.status === 429) {
        this.stats.rateLimitHits++;
        console.warn('Rate limit hit, backing off...');
        
        if (this.waitOnRateLimit) {
          // Put the request back in the queue with increased retry count
          request.retries++;
          this.stats.retries++;
          this.requestQueue.unshift(request);
          
          // Wait before processing next request
          await new Promise(resolve => setTimeout(resolve, this.sleepTimeOnRateLimitHit));
        } else {
          // Reject the promise if not waiting on rate limit
          request.reject(error);
        }
      } else {
        // Reject the promise for other errors
        request.reject(error);
      }
    }
    
    // Process next request in queue
    this.processQueue();
  }

  /**
   * Execute a request to the Picqer API
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} params - Query parameters
   * @param {Object} data - Request body
   * @param {number} retryCount - Number of retries
   * @returns {Promise<Object>} - API response
   */
  async executeRequest(method, endpoint, params, data, retryCount) {
    try {
      // Build full URL
      const url = `${this.baseUrl}/${endpoint.replace(/^\//, '')}`;
      
      // Increment request counter
      this.stats.totalRequests++;
      
      // Log request (with retry information if applicable)
      const retryInfo = retryCount > 0 ? ` (retry ${retryCount})` : '';
      console.log(`Making request to: ${url}${retryInfo}`);
      
      // Make the request
      const response = await axios({
        method,
        url,
        params,
        data,
        headers: {
          'Authorization': `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
          'Content-Type': 'application/json',
          'User-Agent': 'PicqerMiddleware (https://github.com/yourusername/picqer-middleware - your@email.com)'
        }
      });
      
      // Log response status
      console.log(`Response status: ${response.status}`);
      
      // Log rate limit information if available
      if (response.headers['x-ratelimit-limit'] && response.headers['x-ratelimit-remaining']) {
        console.log(`Rate limit: ${response.headers['x-ratelimit-remaining']}/${response.headers['x-ratelimit-limit']}`);
      }
      
      return response.data;
    } catch (error) {
      // Log error details
      if (error.response) {
        console.error(`API error (${error.response.status}): ${error.response.data.error || JSON.stringify(error.response.data)}`);
      } else {
        console.error(`Request error: ${error.message}`);
      }
      
      throw error;
    }
  }

  /**
   * Get API client statistics
   * @returns {Object} - Statistics
   */
  getStats() {
    return this.stats;
  }
}

module.exports = PicqerApiClient;
