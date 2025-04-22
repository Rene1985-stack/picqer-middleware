/**
 * Picqer API Rate Limiter
 * 
 * This module implements a rate limiting solution for the Picqer API to prevent
 * "Rate limit exceeded" errors. It includes:
 * 
 * 1. Request queuing to control the flow of API requests
 * 2. Configurable delays between requests
 * 3. Exponential backoff for retries when rate limits are hit
 * 4. Proper error handling and logging
 * 5. Option to automatically wait and retry when rate limits are hit (Picqer recommended approach)
 * 
 * Usage:
 * const rateLimiter = new PicqerRateLimiter();
 * const result = await rateLimiter.execute(() => apiClient.get('/products'));
 */

class PicqerRateLimiter {
  constructor(options = {}) {
    // Default configuration
    this.config = {
      requestsPerMinute: options.requestsPerMinute || 60, // Default: 60 requests per minute (1 per second)
      maxRetries: options.maxRetries || 5,               // Maximum number of retry attempts
      initialBackoffMs: options.initialBackoffMs || 1000, // Initial backoff in milliseconds
      maxBackoffMs: options.maxBackoffMs || 60000,       // Maximum backoff in milliseconds (1 minute)
      backoffFactor: options.backoffFactor || 2,         // Exponential backoff multiplier
      jitter: options.jitter !== undefined ? options.jitter : true, // Add randomness to backoff times
      logFunction: options.logFunction || console.log,   // Logging function
      errorFunction: options.errorFunction || console.error, // Error logging function
      
      // Picqer-style configuration options
      waitOnRateLimit: options.waitOnRateLimit !== undefined ? options.waitOnRateLimit : true, // Auto-retry on rate limit (Picqer style)
      sleepTimeOnRateLimitHitInMs: options.sleepTimeOnRateLimitHitInMs || 20000, // Wait time on rate limit hit (20 seconds default, like Picqer)
    };

    // Queue for pending requests
    this.queue = [];
    
    // Flag to indicate if the queue processor is running
    this.isProcessing = false;
    
    // Timestamp of the last request
    this.lastRequestTime = 0;
    
    // Calculate minimum delay between requests based on rate limit
    this.minDelayMs = Math.ceil(60000 / this.config.requestsPerMinute);
    
    // Statistics
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retries: 0,
      rateExceededCount: 0,
      waitTimeMs: 0
    };
  }

  /**
   * Execute a function with rate limiting
   * @param {Function} fn - The function to execute (should return a Promise)
   * @param {Object} options - Options for this specific request
   * @returns {Promise} - Promise that resolves with the result of the function
   */
  async execute(fn, options = {}) {
    return new Promise((resolve, reject) => {
      // Add the request to the queue
      this.queue.push({
        fn,
        options: { ...options },
        resolve,
        reject,
        retryCount: 0
      });
      
      this.stats.totalRequests++;
      
      // Start processing the queue if not already running
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process the request queue
   * @private
   */
  async processQueue() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    
    // Get the next request from the queue
    const request = this.queue.shift();
    
    try {
      // Calculate delay needed to respect rate limit
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      const delayNeeded = Math.max(0, this.minDelayMs - timeSinceLastRequest);
      
      // Wait if necessary to respect rate limit
      if (delayNeeded > 0) {
        await this.delay(delayNeeded);
      }
      
      // Execute the request
      this.lastRequestTime = Date.now();
      const result = await request.fn();
      
      // Request succeeded
      this.stats.successfulRequests++;
      request.resolve(result);
    } catch (error) {
      // Check if it's a rate limit error
      if (this.isRateLimitError(error)) {
        this.stats.rateExceededCount++;
        
        // Handle rate limit error using Picqer's approach if enabled
        if (this.config.waitOnRateLimit && request.retryCount < this.config.maxRetries) {
          // Log the rate limit hit
          this.config.logFunction(`Rate limit exceeded. Waiting ${this.config.sleepTimeOnRateLimitHitInMs/1000} seconds before retrying...`);
          
          // Increment retry counter
          request.retryCount++;
          this.stats.retries++;
          
          // Track wait time in stats
          this.stats.waitTimeMs += this.config.sleepTimeOnRateLimitHitInMs;
          
          // Wait for configured time
          await this.delay(this.config.sleepTimeOnRateLimitHitInMs);
          
          // Put the request back in the queue
          this.queue.unshift(request);
        } 
        // If waitOnRateLimit is disabled or max retries exceeded, use exponential backoff
        else if (!this.config.waitOnRateLimit && request.retryCount < this.config.maxRetries) {
          // Calculate backoff time with exponential backoff
          const backoffTime = this.calculateBackoff(request.retryCount);
          
          // Log retry attempt
          this.config.logFunction(`Rate limit exceeded. Retrying in ${backoffTime}ms (Attempt ${request.retryCount + 1}/${this.config.maxRetries})`);
          
          // Increment retry counter
          request.retryCount++;
          this.stats.retries++;
          
          // Track wait time in stats
          this.stats.waitTimeMs += backoffTime;
          
          // Wait for backoff time
          await this.delay(backoffTime);
          
          // Put the request back in the queue
          this.queue.unshift(request);
        } else {
          // Max retries exceeded
          this.stats.failedRequests++;
          this.config.errorFunction(`Rate limit exceeded. Max retries (${this.config.maxRetries}) exceeded.`);
          request.reject(error);
        }
      } else {
        // Not a rate limit error, just fail
        this.stats.failedRequests++;
        request.reject(error);
      }
    }
    
    // Continue processing the queue
    setImmediate(() => this.processQueue());
  }

  /**
   * Check if an error is a rate limit error
   * @param {Error} error - The error to check
   * @returns {boolean} - True if it's a rate limit error
   * @private
   */
  isRateLimitError(error) {
    // Check for various forms of rate limit errors
    if (!error) return false;
    
    // Check error message
    if (error.message && (
      error.message.includes('rate limit') || 
      error.message.includes('Rate limit') ||
      error.message.includes('too many requests')
    )) {
      return true;
    }
    
    // Check HTTP status code (429 is Too Many Requests)
    if (error.status === 429 || (error.response && error.response.status === 429)) {
      return true;
    }
    
    // Check Picqer specific error codes or messages
    if (error.code === 'RATE_LIMIT_EXCEEDED' || 
        (error.response && error.response.data && 
         error.response.data.error === 'rate_limit_exceeded')) {
      return true;
    }
    
    return false;
  }

  /**
   * Calculate backoff time with exponential backoff and optional jitter
   * @param {number} retryCount - The current retry count
   * @returns {number} - Backoff time in milliseconds
   * @private
   */
  calculateBackoff(retryCount) {
    // Calculate exponential backoff
    let backoff = this.config.initialBackoffMs * Math.pow(this.config.backoffFactor, retryCount);
    
    // Apply maximum backoff limit
    backoff = Math.min(backoff, this.config.maxBackoffMs);
    
    // Add jitter if enabled (prevents thundering herd problem)
    if (this.config.jitter) {
      // Add random jitter between 0-30%
      const jitterFactor = 0.7 + (Math.random() * 0.3);
      backoff = Math.floor(backoff * jitterFactor);
    }
    
    return backoff;
  }

  /**
   * Delay execution for a specified time
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} - Promise that resolves after the delay
   * @private
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Enable automatic retry on rate limit hit (Picqer style)
   */
  enableRetryOnRateLimitHit() {
    this.config.waitOnRateLimit = true;
  }

  /**
   * Disable automatic retry on rate limit hit
   */
  disableRetryOnRateLimitHit() {
    this.config.waitOnRateLimit = false;
  }

  /**
   * Set the sleep time on rate limit hit
   * @param {number} ms - Milliseconds to sleep
   */
  setSleepTimeOnRateLimitHit(ms) {
    this.config.sleepTimeOnRateLimitHitInMs = ms;
  }

  /**
   * Get current statistics
   * @returns {Object} - Statistics object
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retries: 0,
      rateExceededCount: 0,
      waitTimeMs: 0
    };
  }
}

module.exports = PicqerRateLimiter;
