/**
 * Picqer API Client with Rate Limiting
 * 
 * This module enhances the existing API adapter with rate limiting capabilities
 * to prevent "Rate limit exceeded" errors when interacting with the Picqer API.
 * 
 * It wraps the existing API client with a rate limiter that:
 * 1. Queues requests to control the flow
 * 2. Adds configurable delays between requests
 * 3. Implements Picqer's recommended approach for handling rate limits
 * 4. Provides proper error handling and logging
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
        'Accept': 'application/json'
      }
    });
    
    // Create rate limiter with custom options or defaults
    this.rateLimiter = new PicqerRateLimiter({
      requestsPerMinute: options.requestsPerMinute || 30, // Conservative default: 30 requests per minute
      maxRetries: options.maxRetries || 5,
      initialBackoffMs: options.initialBackoffMs || 2000,
      logFunction: options.logFunction || ((msg) => console.log(`[Picqer API] ${msg}`)),
      errorFunction: options.errorFunction || ((msg) => console.error(`[Picqer API Error] ${msg}`)),
      // Picqer-style configuration options
      waitOnRateLimit: options.waitOnRateLimit !== undefined ? options.waitOnRateLimit : true,
      sleepTimeOnRateLimitHitInMs: options.sleepTimeOnRateLimitHitInMs || 20000 // 20 seconds, like Picqer's default
    });
    
    // Statistics
    this.requestCount = 0;
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
   * Enable automatic retry on rate limit hit (Picqer style)
   */
  enableRetryOnRateLimitHit() {
    this.rateLimiter.enableRetryOnRateLimitHit();
  }

  /**
   * Disable automatic retry on rate limit hit
   */
  disableRetryOnRateLimitHit() {
    this.rateLimiter.disableRetryOnRateLimitHit();
  }

  /**
   * Set the sleep time on rate limit hit
   * @param {number} ms - Milliseconds to sleep
   */
  setSleepTimeOnRateLimitHit(ms) {
    this.rateLimiter.setSleepTimeOnRateLimitHit(ms);
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
