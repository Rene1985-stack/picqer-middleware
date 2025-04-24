/**
 * Consistent API URL Formatting Helper
 * 
 * This file provides a consistent way to format API URLs across all dashboard files.
 * Include this file before other dashboard JavaScript files.
 */

// API URL Configuration
const API_CONFIG = {
  // Base URL for API requests - automatically detects current origin
  BASE_URL: window.location.origin,
  
  // API path prefix
  API_PATH: '/api',
  
  // API version (if needed in the future)
  API_VERSION: '',
  
  // Endpoints
  ENDPOINTS: {
    // Core endpoints
    STATUS: '/status',
    STATS: '/stats',
    LOGS: '/logs',
    HISTORY: '/history',
    SYNC: '/sync',
    ERRORS: '/errors',
    
    // Entity-specific endpoints
    SYNC_PRODUCTS: '/sync/products',
    SYNC_PICKLISTS: '/sync/picklists',
    SYNC_WAREHOUSES: '/sync/warehouses',
    SYNC_USERS: '/sync/users',
    SYNC_SUPPLIERS: '/sync/suppliers',
    SYNC_BATCHES: '/sync/batches',
    
    // Error endpoints
    ERRORS_BY_ENTITY: '/errors/{entity}',
    RETRY_SYNC: '/sync/retry/{syncId}',
    ERROR_DETAILS: '/errors/details/{errorId}'
  }
};

// API URL Helper
class ApiUrlHelper {
  /**
   * Get full API URL for an endpoint
   * @param {string} endpoint - Endpoint path from API_CONFIG.ENDPOINTS
   * @param {Object} params - URL parameters to replace in the endpoint path
   * @returns {string} - Full API URL
   */
  static getUrl(endpoint, params = {}) {
    let path = API_CONFIG.ENDPOINTS[endpoint] || endpoint;
    
    // Replace path parameters
    for (const [key, value] of Object.entries(params)) {
      path = path.replace(`{${key}}`, value);
    }
    
    // Combine base URL, API path, version (if any), and endpoint path
    return `${API_CONFIG.BASE_URL}${API_CONFIG.API_PATH}${API_CONFIG.API_VERSION}${path}`;
  }
  
  /**
   * Get URL with query parameters
   * @param {string} endpoint - Endpoint path from API_CONFIG.ENDPOINTS
   * @param {Object} pathParams - URL path parameters to replace
   * @param {Object} queryParams - Query parameters to add
   * @returns {string} - Full API URL with query parameters
   */
  static getUrlWithQuery(endpoint, pathParams = {}, queryParams = {}) {
    const baseUrl = this.getUrl(endpoint, pathParams);
    const queryString = Object.entries(queryParams)
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }
}

// Make API_CONFIG and ApiUrlHelper available globally
window.API_CONFIG = API_CONFIG;
window.ApiUrlHelper = ApiUrlHelper;

// Create a consistent set of API URLs for use in all dashboard files
window.API_URLS = {
  // Core endpoints
  STATUS: ApiUrlHelper.getUrl('STATUS'),
  STATS: ApiUrlHelper.getUrl('STATS'),
  LOGS: ApiUrlHelper.getUrl('LOGS'),
  HISTORY: ApiUrlHelper.getUrl('HISTORY'),
  SYNC: ApiUrlHelper.getUrl('SYNC'),
  ERRORS: ApiUrlHelper.getUrl('ERRORS'),
  
  // Entity-specific endpoints
  SYNC_PRODUCTS: ApiUrlHelper.getUrl('SYNC_PRODUCTS'),
  SYNC_PICKLISTS: ApiUrlHelper.getUrl('SYNC_PICKLISTS'),
  SYNC_WAREHOUSES: ApiUrlHelper.getUrl('SYNC_WAREHOUSES'),
  SYNC_USERS: ApiUrlHelper.getUrl('SYNC_USERS'),
  SYNC_SUPPLIERS: ApiUrlHelper.getUrl('SYNC_SUPPLIERS'),
  SYNC_BATCHES: ApiUrlHelper.getUrl('SYNC_BATCHES'),
  
  // Helper functions for dynamic endpoints
  getErrorsByEntity: (entity) => ApiUrlHelper.getUrl('ERRORS_BY_ENTITY', { entity }),
  getRetrySync: (syncId) => ApiUrlHelper.getUrl('RETRY_SYNC', { syncId }),
  getErrorDetails: (errorId) => ApiUrlHelper.getUrl('ERROR_DETAILS', { errorId }),
  
  // Helper for full sync URLs
  getFullSyncUrl: (endpoint) => ApiUrlHelper.getUrlWithQuery(endpoint, {}, { full: true })
};

console.log('API URL Helper initialized with base URL:', API_CONFIG.BASE_URL);
