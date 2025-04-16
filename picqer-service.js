const axios = require('axios');

/**
 * Service for interacting with the Picqer API with enhanced debugging
 */
class PicqerService {
  constructor(apiKey, baseUrl) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    
    console.log('Initializing PicqerService with:');
    console.log('API Key (first 5 chars):', this.apiKey.substring(0, 5) + '...');
    console.log('Base URL:', this.baseUrl);
    
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Add request interceptor for debugging
    this.client.interceptors.request.use(request => {
      console.log('Making request to:', request.baseURL + request.url);
      console.log('Request headers:', JSON.stringify(request.headers));
      return request;
    });
    
    // Add response interceptor for debugging
    this.client.interceptors.response.use(
      response => {
        console.log('Response status:', response.status);
        console.log('Response headers:', JSON.stringify(response.headers));
        return response;
      },
      error => {
        console.error('Request failed:');
        if (error.response) {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          console.error('Response status:', error.response.status);
          console.error('Response headers:', JSON.stringify(error.response.headers));
          console.error('Response data:', JSON.stringify(error.response.data));
        } else if (error.request) {
          // The request was made but no response was received
          console.error('No response received:', error.request);
        } else {
          // Something happened in setting up the request that triggered an Error
          console.error('Error message:', error.message);
        }
        console.error('Error config:', JSON.stringify(error.config));
        return Promise.reject(error);
      }
    );
  }

  /**
   * Test the API connection
   * @returns {Promise<Object>} - API response
   */
  async testConnection() {
    try {
      console.log('Testing connection to Picqer API...');
      // Try to get a single product to test the connection
      const response = await this.client.get('/products', { params: { limit: 1 } });
      console.log('Connection test successful!');
      return response.data;
    } catch (error) {
      console.error('Connection test failed:', error.message);
      throw error;
    }
  }

  /**
   * Get all products from Picqer with pagination
   * @param {Date} updatedSince - Only get products updated since this date
   * @returns {Promise<Array>} - Array of products
   */
  async getAllProducts(updatedSince = null) {
    console.log('Fetching all products from Picqer...');
    
    let allProducts = [];
    let page = 1;
    let hasMorePages = true;
    
    try {
      while (hasMorePages) {
        console.log(`Fetching page ${page}...`);
        
        // Build query parameters
        const params = { page };
        
        // Add updated_since parameter if provided
        if (updatedSince) {
          // Format date as YYYY-MM-DD HH:MM:SS
          const formattedDate = updatedSince.toISOString().replace('T', ' ').substring(0, 19);
          params.updated_since = formattedDate;
        }
        
        // Make API request
        const response = await this.client.get('/products', { params });
        
        // Check if we have data
        if (response.data && Array.isArray(response.data)) {
          // Add products to our collection
          allProducts = [...allProducts, ...response.data];
          
          // Check if we have more pages (Picqer returns 100 items per page)
          hasMorePages = response.data.length === 100;
          
          // Increment page counter
          page++;
          
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          hasMorePages = false;
        }
      }
      
      console.log(`Fetched ${allProducts.length} products in total.`);
      return allProducts;
    } catch (error) {
      console.error('Error fetching products from Picqer:', error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log('Rate limit hit, waiting before retrying...');
        
        // Wait for 60 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 60000));
        
        // Retry the request
        return this.getAllProducts(updatedSince);
      }
      
      throw error;
    }
  }

  /**
   * Get a single product by its product code
   * @param {string} productCode - The product code to look up
   * @returns {Promise<Object>} - Product data
   */
  async getProductByCode(productCode) {
    try {
      const response = await this.client.get('/products', { 
        params: { productcode: productCode }
      });
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        return response.data[0];
      }
      
      return null;
    } catch (error) {
      console.error(`Error fetching product with code ${productCode}:`, error.message);
      throw error;
    }
  }

  /**
   * Get products updated since a specific date
   * @param {Date} date - The date to check updates from
   * @returns {Promise<Array>} - Array of updated products
   */
  async getProductsUpdatedSince(date) {
    return this.getAllProducts(date);
  }
}

module.exports = PicqerService;
