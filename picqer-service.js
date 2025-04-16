const axios = require('axios');

/**
 * Service for interacting with the Picqer API using the same authentication method as Power BI
 */
class PicqerService {
  constructor(apiKey, baseUrl) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    
    console.log('Initializing PicqerService with:');
    console.log('API Key (first 5 chars):', this.apiKey.substring(0, 5) + '...');
    console.log('Base URL:', this.baseUrl);
    
    // Create Base64 encoded credentials (apiKey + ":")
    const credentials = `${this.apiKey}:`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');
    
    // Create client with Basic Authentication header
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Basic ${encodedCredentials}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PicqerMiddleware (middleware@skapa-global.com)'
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
        return response;
      },
      error => {
        console.error('Request failed:');
        if (error.response) {
          console.error('Response status:', error.response.status);
          console.error('Response data:', JSON.stringify(error.response.data));
        } else if (error.request) {
          console.error('No response received:', error.request);
        } else {
          console.error('Error message:', error.message);
        }
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
      const response = await this.client.get('/products', { 
        params: { 
          limit: 1 
        } 
      });
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
    let offset = 0;
    let hasMoreProducts = true;
    
    try {
      while (hasMoreProducts) {
        console.log(`Fetching products with offset ${offset}...`);
        
        // Build query parameters
        const params = { offset };
        
        // Add updated_since parameter if provided
        if (updatedSince) {
          // Format date as YYYY-MM-DD HH:MM:SS
          const formattedDate = updatedSince.toISOString().replace('T', ' ').substring(0, 19);
          params.updated_since = formattedDate;
        }
        
        // Make API request
        const response = await this.client.get('/products', { params });
        
        // Check if we have data
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          // Add products to our collection
          allProducts = [...allProducts, ...response.data];
          
          // Check if we have more products (Picqer returns 100 items per page)
          hasMoreProducts = response.data.length === 100;
          
          // Increment offset for next page
          offset += 100;
          
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          hasMoreProducts = false;
        }
      }
      
      console.log(`Fetched ${allProducts.length} products in total.`);
      return allProducts;
    } catch (error) {
      console.error('Error fetching products from Picqer:', error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log('Rate limit hit, waiting before retrying...');
        
        // Wait for 20 seconds before retrying (same as Power BI query)
        await new Promise(resolve => setTimeout(resolve, 20000));
        
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
