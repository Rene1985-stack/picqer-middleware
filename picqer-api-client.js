/**
 * Picqer API Client with Rate Limiting
 * 
 * This module provides a client for interacting with the Picqer API
 * with built-in rate limiting to prevent "Rate limit exceeded" errors.
 */
const axios = require('axios');
const PicqerRateLimiter = require('./picqer-rate-limiter');

class PicqerApiClient {
  /**
   * Create a new Picqer API client with rate limiting
   * @param {string} apiKey - Picqer API key
   * @param {string} baseUrl - Picqer API base URL
   * @param {Object} options - Rate limiting options
   */
  constructor(apiKey, baseUrl, options = {}) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    
    // Create HTTP client
    this.httpClient = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'PicqerMiddleware (middleware@skapa-global.com)'
      }
    });
    
    // Create rate limiter with custom options or defaults
    this.rateLimiter = new PicqerRateLimiter({
      requestsPerMinute: options.requestsPerMinute || 30,
      maxRetries: options.maxRetries || 5,
      initialBackoffMs: options.initialBackoffMs || 2000,
      waitOnRateLimit: options.waitOnRateLimit !== undefined ? options.waitOnRateLimit : true,
      sleepTimeOnRateLimitHitInMs: options.sleepTimeOnRateLimitHitInMs || 20000
    });
    
    // Statistics
    this.requestCount = 0;
    
    // Add request interceptor for debugging
    this.httpClient.interceptors.request.use(request => {
      console.log('Making request to:', request.baseURL + request.url);
      return request;
    });
    
    // Add response interceptor for debugging
    this.httpClient.interceptors.response.use(
      response => {
        console.log('Response status:', response.status);
        return response;
      },
      error => {
        console.error('Request failed:');
        if (error.response) {
          console.error('Response status:', error.response.status);
        } else if (error.request) {
          console.error('No response received');
        } else {
          console.error('Error message:', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Make a GET request to the Picqer API with rate limiting
   * @param {string} endpoint - API endpoint (e.g., '/products')
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} - API response
   */
  async get(endpoint, params = {}) {
    return this.rateLimiter.execute(async () => {
      try {
        this.requestCount++;
        const response = await this.httpClient.get(endpoint, { params });
        return response.data;
      } catch (error) {
        this.handleApiError(error, 'GET', endpoint);
        throw error;
      }
    });
  }

  /**
   * Make a POST request to the Picqer API with rate limiting
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @returns {Promise<Object>} - API response
   */
  async post(endpoint, data = {}) {
    return this.rateLimiter.execute(async () => {
      try {
        this.requestCount++;
        const response = await this.httpClient.post(endpoint, data);
        return response.data;
      } catch (error) {
        this.handleApiError(error, 'POST', endpoint);
        throw error;
      }
    });
  }

  /**
   * Make a PUT request to the Picqer API with rate limiting
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body
   * @returns {Promise<Object>} - API response
   */
  async put(endpoint, data = {}) {
    return this.rateLimiter.execute(async () => {
      try {
        this.requestCount++;
        const response = await this.httpClient.put(endpoint, data);
        return response.data;
      } catch (error) {
        this.handleApiError(error, 'PUT', endpoint);
        throw error;
      }
    });
  }

  /**
   * Make a DELETE request to the Picqer API with rate limiting
   * @param {string} endpoint - API endpoint
   * @returns {Promise<Object>} - API response
   */
  async delete(endpoint) {
    return this.rateLimiter.execute(async () => {
      try {
        this.requestCount++;
        const response = await this.httpClient.delete(endpoint);
        return response.data;
      } catch (error) {
        this.handleApiError(error, 'DELETE', endpoint);
        throw error;
      }
    });
  }

  /**
   * Handle API errors with improved logging
   * @param {Error} error - The error object
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @private
   */
  handleApiError(error, method, endpoint) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(`[Picqer API Error] ${method} ${endpoint} failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      // The request was made but no response was received
      console.error(`[Picqer API Error] ${method} ${endpoint} failed: No response received`);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error(`[Picqer API Error] ${method} ${endpoint} failed: ${error.message}`);
    }
  }

  /**
   * Get rate limiter statistics
   * @returns {Object} - Statistics object
   */
  getStats() {
    return {
      requestCount: this.requestCount,
      rateLimiter: this.rateLimiter.getStats()
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.requestCount = 0;
    this.rateLimiter.resetStats();
  }
}

module.exports = PicqerApiClient;
