/**
 * Picqer Rate Limiter
 * 
 * Implements rate limiting for Picqer API requests to prevent "Rate limit exceeded" errors.
 * Follows Picqer's recommended approach for handling rate limits.
 */
class PicqerRateLimiter {
  /**
   * Create a new rate limiter
   * @param {Object} options - Rate limiting options
   */
  constructor(options = {}) {
    // Configuration
    this.requestsPerMinute = options.requestsPerMinute || 30;
    this.maxRetries = options.maxRetries || 5;
    this.initialBackoffMs = options.initialBackoffMs || 2000;
    this.waitOnRateLimit = options.waitOnRateLimit !== undefined ? options.waitOnRateLimit : true;
    this.sleepTimeOnRateLimitHitInMs = options.sleepTimeOnRateLimitHitInMs || 20000;
    
    // Logging functions
    this.log = options.logFunction || ((msg) => console.log(`[Rate Limiter] ${msg}`));
    this.error = options.errorFunction || ((msg) => console.error(`[Rate Limiter Error] ${msg}`));
    
    // Queue and state
    this.queue = [];
    this.processing = false;
    this.lastRequestTime = 0;
    
    // Statistics
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retries: 0,
      rateLimitHits: 0
    };
  }

  /**
   * Execute a function with rate limiting
   * @param {Function} fn - Function to execute
   * @returns {Promise<any>} - Result of the function
   */
  async execute(fn) {
    return new Promise((resolve, reject) => {
      // Add to queue
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process the queue of requests
   * @private
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    try {
      // Calculate delay to maintain rate limit
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      const minTimeBetweenRequests = (60 * 1000) / this.requestsPerMinute;
      const delay = Math.max(0, minTimeBetweenRequests - timeSinceLastRequest);
      
      if (delay > 0) {
        this.log(`Delaying request for ${delay}ms to maintain rate limit`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // Get next request from queue
      const { fn, resolve, reject } = this.queue.shift();
      
      // Execute with retry logic
      let result;
      let retries = 0;
      let success = false;
      
      while (!success && retries <= this.maxRetries) {
        try {
          this.stats.totalRequests++;
          this.lastRequestTime = Date.now();
          
          result = await fn();
          success = true;
          this.stats.successfulRequests++;
        } catch (error) {
          if (this.isRateLimitError(error) && this.waitOnRateLimit && retries < this.maxRetries) {
            retries++;
            this.stats.retries++;
            this.stats.rateLimitHits++;
            
            const backoffTime = this.calculateBackoff(retries);
            this.error(`Rate limit hit, retrying in ${backoffTime}ms (retry ${retries}/${this.maxRetries})`);
            
            await new Promise(resolve => setTimeout(resolve, backoffTime));
          } else {
            this.stats.failedRequests++;
            reject(error);
            break;
          }
        }
      }
      
      if (success) {
        resolve(result);
      }
    } catch (error) {
      this.error(`Unexpected error in rate limiter: ${error.message}`);
    } finally {
      this.processing = false;
      
      // Process next request if any
      if (this.queue.length > 0) {
        this.processQueue();
      }
    }
  }

  /**
   * Check if an error is a rate limit error
   * @param {Error} error - The error to check
   * @returns {boolean} - Whether it's a rate limit error
   * @private
   */
  isRateLimitError(error) {
    return (
      error.response &&
      error.response.status === 429
    );
  }

  /**
   * Calculate backoff time with exponential backoff
   * @param {number} retryCount - Current retry count
   * @returns {number} - Backoff time in milliseconds
   * @private
   */
  calculateBackoff(retryCount) {
    if (this.waitOnRateLimit) {
      return this.sleepTimeOnRateLimitHitInMs;
    }
    
    return Math.min(
      this.initialBackoffMs * Math.pow(2, retryCount - 1),
      60000 // Max 1 minute
    );
  }

  /**
   * Enable automatic retry on rate limit hit (Picqer style)
   */
  enableRetryOnRateLimitHit() {
    this.waitOnRateLimit = true;
  }

  /**
   * Disable automatic retry on rate limit hit
   */
  disableRetryOnRateLimitHit() {
    this.waitOnRateLimit = false;
  }

  /**
   * Set the sleep time on rate limit hit
   * @param {number} ms - Milliseconds to sleep
   */
  setSleepTimeOnRateLimitHit(ms) {
    this.sleepTimeOnRateLimitHitInMs = ms;
  }

  /**
   * Get rate limiter statistics
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
      rateLimitHits: 0
    };
  }
}

module.exports = PicqerRateLimiter;
