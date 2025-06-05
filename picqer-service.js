const axios = require('axios');

class PicqerService {
  constructor(apiKey, apiUrl) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
    this.axiosInstance = axios.create({
      baseURL: apiUrl,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Rate limiting configuration
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.requestDelay = 1000; // 1 second between requests
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
  }

  /**
   * Make a rate-limited API request
   */
  async makeRequest(endpoint, params = {}) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ endpoint, params, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process the request queue with rate limiting
   */
  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const { endpoint, params, resolve, reject } = this.requestQueue.shift();
      
      try {
        const response = await this.executeRequest(endpoint, params);
        resolve(response);
      } catch (error) {
        reject(error);
      }

      // Wait before processing next request
      if (this.requestQueue.length > 0) {
        await this.sleep(this.requestDelay);
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Execute the actual HTTP request with retry logic
   */
  async executeRequest(endpoint, params, retryCount = 0) {
    try {
      console.log(`Making request to: ${endpoint}`);
      const response = await this.axiosInstance.get(endpoint, { params });
      return response.data;
    } catch (error) {
      if (error.response?.status === 429 && retryCount < this.maxRetries) {
        // Rate limit hit, wait and retry
        console.log(`Rate limit hit, retrying in ${this.retryDelay}ms...`);
        await this.sleep(this.retryDelay);
        return this.executeRequest(endpoint, params, retryCount + 1);
      }
      
      console.error(`API request failed for ${endpoint}:`, error.message);
      throw error;
    }
  }

  /**
   * Get purchase orders from Picqer API
   */
  async getPurchaseOrders(since = null) {
    try {
      const params = {};
      if (since) {
        params.since = since.toISOString();
      }

      const response = await this.makeRequest('/purchaseorders', params);
      return response.data || response;
    } catch (error) {
      console.error('Error fetching purchase orders from Picqer:', error);
      throw error;
    }
  }

  /**
   * Get purchase order by ID
   */
  async getPurchaseOrderById(id) {
    try {
      const response = await this.makeRequest(`/purchaseorders/${id}`);
      return response.data || response;
    } catch (error) {
      console.error(`Error fetching purchase order ${id} from Picqer:`, error);
      throw error;
    }
  }

  /**
   * Get picklists from Picqer API
   */
  async getPicklists(since = null) {
    try {
      const params = {};
      if (since) {
        params.since = since.toISOString();
      }

      const response = await this.makeRequest('/picklists', params);
      return response.data || response;
    } catch (error) {
      console.error('Error fetching picklists from Picqer:', error);
      throw error;
    }
  }

  /**
   * Get warehouses from Picqer API
   */
  async getWarehouses(since = null) {
    try {
      const params = {};
      if (since) {
        params.since = since.toISOString();
      }

      const response = await this.makeRequest('/warehouses', params);
      return response.data || response;
    } catch (error) {
      console.error('Error fetching warehouses from Picqer:', error);
      throw error;
    }
  }

  /**
   * Get batches from Picqer API
   */
  async getBatches(since = null) {
    try {
      const params = {};
      if (since) {
        params.since = since.toISOString();
      }

      const response = await this.makeRequest('/batches', params);
      return response.data || response;
    } catch (error) {
      console.error('Error fetching batches from Picqer:', error);
      throw error;
    }
  }

  /**
   * Get receipts from Picqer API
   */
  async getReceipts(since = null) {
    try {
      const params = {};
      if (since) {
        params.since = since.toISOString();
      }

      const response = await this.makeRequest('/receipts', params);
      return response.data || response;
    } catch (error) {
      console.error('Error fetching receipts from Picqer:', error);
      throw error;
    }
  }

  /**
   * Get users from Picqer API
   */
  async getUsers(since = null) {
    try {
      const params = {};
      if (since) {
        params.since = since.toISOString();
      }

      const response = await this.makeRequest('/users', params);
      return response.data || response;
    } catch (error) {
      console.error('Error fetching users from Picqer:', error);
      throw error;
    }
  }

  /**
   * Get suppliers from Picqer API
   */
  async getSuppliers(since = null) {
    try {
      const params = {};
      if (since) {
        params.since = since.toISOString();
      }

      const response = await this.makeRequest('/suppliers', params);
      return response.data || response;
    } catch (error) {
      console.error('Error fetching suppliers from Picqer:', error);
      throw error;
    }
  }

  /**
   * Get products from Picqer API
   */
  async getProducts(since = null) {
    try {
      const params = {};
      if (since) {
        params.since = since.toISOString();
      }

      const response = await this.makeRequest('/products', params);
      return response.data || response;
    } catch (error) {
      console.error('Error fetching products from Picqer:', error);
      throw error;
    }
  }

  /**
   * Test API connection
   */
  async testConnection() {
    try {
      const response = await this.makeRequest('/users');
      return { success: true, message: 'API connection successful' };
    } catch (error) {
      return { success: false, message: `API connection failed: ${error.message}` };
    }
  }

  /**
   * Sleep utility function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = PicqerService;

