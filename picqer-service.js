const axios = require('axios');

/**
 * Service for interacting with the Picqer API
 */
class PicqerService {
  constructor(apiKey, baseUrl) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
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
