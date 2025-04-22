/**
 * Picqer Rate Limiter
 * 
 * This module provides rate limiting functionality for the Picqer API
 * to prevent "Rate limit exceeded" errors. It implements Picqer's recommended
 * approach for handling rate limits with automatic retry.
 * 
 * Features:
 * 1. Request queuing to control API request flow
 * 2. Configurable delays between requests
 * 3. Automatic retry on rate limit hits (Picqer style)
 * 4. Comprehensive error handling and statistics
 */

class PicqerRateLimiter {
  /**
   * Create a new rate limiter
   * @param {Object} options - Rate limiting options
   */
  constructor(options = {}) {
    // Queue configuration
    this.requestsPerMinute = options.requestsPerMinute || 30;
    this.delayBetweenRequestsMs = Math.ceil(60000 / this.requestsPerMinute);
    
    // Retry configuration
    this.maxRetries = options.maxRetries || 5;
    this.initialBackoffMs = options.initialBackoffMs || 2000;
    
    // Picqer-style configuration
    this.waitOnRateLimit = options.waitOnRateLimit !== undefined ? options.waitOnRateLimit : true;
    this.sleepTimeOnRateLimitHitInMs = options.sleepTimeOnRateLimitHitInMs || 20000; // 20 seconds, like Picqer's default
    
    // Logging functions
    this.logFunction = options.logFunction || console.log;
    this.errorFunction = options.errorFunction || console.error;
    
    // Queue state
    this.queue = [];
    this.processing = false;
    this.lastRequestTime = 0;
    
    // Statistics
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitHits: 0,
      retryAttempts: 0,
      totalWaitTimeMs: 0
    };
    
    this.logFunction(`Picqer rate limiter initialized with ${this.requestsPerMinute} requests per minute`);
    this.logFunction(`Delay between requests: ${this.delayBetweenRequestsMs}ms`);
    this.logFunction(`Auto-retry on rate limit: ${this.waitOnRateLimit ? 'Enabled' : 'Disabled'}`);
    this.logFunction(`Sleep time on rate limit hit: ${this.sleepTimeOnRateLimitHitInMs}ms`);
  }

  /**
   * Execute a function with rate limiting
   * @param {Function} fn - Function to execute
   * @returns {Promise<any>} - Result of the function
   */
  async execute(fn) {
    return new Promise((resolve, reject) => {
      // Add request to queue
      this.queue.push({
        fn,
        resolve,
        reject,
        retryCount: 0
      });
      
      // Start processing queue if not already processing
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process the queue of requests
   * @private
   */
  async processQueue() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }
    
    this.processing = true;
    
    // Get next request from queue
    const request = this.queue.shift();
    
    try {
      // Calculate time to wait before making request
      const now = Date.now();
      const timeToWait = Math.max(0, this.lastRequestTime + this.delayBetweenRequestsMs - now);
      
      if (timeToWait > 0) {
        this.stats.totalWaitTimeMs += timeToWait;
        await new Promise(resolve => setTimeout(resolve, timeToWait));
      }
      
      // Update last request time
      this.lastRequestTime = Date.now();
      
      // Execute the function
      this.stats.totalRequests++;
      const result = await request.fn();
      
      // Request succeeded
      this.stats.successfulRequests++;
      request.resolve(result);
    } catch (error) {
      // Check if this is a rate limit error (HTTP 429)
      const isRateLimitError = error.response && error.response.status === 429;
      
      if (isRateLimitError) {
        this.stats.rateLimitHits++;
        this.logFunction(`Rate limit hit (429 Too Many Requests)`);
        
        // Check if we should retry automatically (Picqer style)
        if (this.waitOnRateLimit && request.retryCount < this.maxRetries) {
          this.stats.retryAttempts++;
          request.retryCount++;
          
          // Calculate sleep time (Picqer style: fixed sleep time)
          const sleepTime = this.sleepTimeOnRateLimitHitInMs;
          
          this.logFunction(`Waiting ${sleepTime}ms before retry (attempt ${request.retryCount}/${this.maxRetries})`);
          this.stats.totalWaitTimeMs += sleepTime;
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, sleepTime));
          
          // Add request back to the front of the queue
          this.queue.unshift(request);
        } else {
          // Max retries reached or auto-retry disabled
          this.stats.failedRequests++;
          
          if (request.retryCount >= this.maxRetries) {
            this.errorFunction(`Max retries (${this.maxRetries}) reached for rate limited request`);
          } else {
            this.errorFunction(`Auto-retry disabled for rate limited request`);
          }
          
          request.reject(error);
        }
      } else {
        // Not a rate limit error
        this.stats.failedRequests++;
        request.reject(error);
      }
    }
    
    // Continue processing queue
    setImmediate(() => this.processQueue());
  }

  /**
   * Enable automatic retry on rate limit hit (Picqer style)
   */
  enableRetryOnRateLimitHit() {
    this.waitOnRateLimit = true;
    this.logFunction('Picqer rate limit auto-retry enabled');
  }

  /**
   * Disable automatic retry on rate limit hit
   */
  disableRetryOnRateLimitHit() {
    this.waitOnRateLimit = false;
    this.logFunction('Picqer rate limit auto-retry disabled');
  }

  /**
   * Set the sleep time on rate limit hit
   * @param {number} ms - Milliseconds to sleep
   */
  setSleepTimeOnRateLimitHit(ms) {
    this.sleepTimeOnRateLimitHitInMs = ms;
    this.logFunction(`Picqer rate limit sleep time set to ${ms}ms`);
  }

  /**
   * Get rate limiter statistics
   * @returns {Object} - Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      requestsPerMinute: this.requestsPerMinute,
      delayBetweenRequestsMs: this.delayBetweenRequestsMs,
      waitOnRateLimit: this.waitOnRateLimit,
      sleepTimeOnRateLimitHitInMs: this.sleepTimeOnRateLimitHitInMs
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitHits: 0,
      retryAttempts: 0,
      totalWaitTimeMs: 0
    };
  }
}

module.exports = PicqerRateLimiter;
