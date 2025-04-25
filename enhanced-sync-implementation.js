/**
 * Enhanced SyncImplementation with additional methods for dashboard compatibility
 * 
 * This file extends the SyncImplementation class to include methods that are
 * expected by the data_sync_api_adapter.js file, fixing the method mismatch issue.
 */

class SyncImplementation {
  constructor(services) {
    this.services = services;
    
    // Validate that all required services are provided
    this.validateServices();
    
    console.log('SyncImplementation initialized with services');
  }
  
  /**
   * Validate that all required services are provided
   */
  validateServices() {
    const requiredServices = [
      'BatchService',
      'PicklistService',
      'WarehouseService',
      'UserService',
      'SupplierService'
    ];
    
    const missingServices = requiredServices.filter(service => !this.services[service]);
    
    if (missingServices.length > 0) {
      console.warn(`Warning: Missing services in SyncImplementation: ${missingServices.join(', ')}`);
    }
  }
  
  /**
   * Get entity count - NEW METHOD for dashboard compatibility
   * @param {string} entityType - Type of entity
   * @returns {Promise<number>} - Entity count
   */
  async getEntityCount(entityType) {
    console.log(`Getting count for entity type: ${entityType}`);
    
    try {
      let count = 0;
      
      switch (entityType) {
        case 'products':
          if (this.services.PicklistService && typeof this.services.PicklistService.getCount === 'function') {
            count = await this.services.PicklistService.getCount();
          }
          break;
        case 'picklists':
          if (this.services.PicklistService && typeof this.services.PicklistService.getCount === 'function') {
            count = await this.services.PicklistService.getCount();
          }
          break;
        case 'warehouses':
          if (this.services.WarehouseService && typeof this.services.WarehouseService.getCount === 'function') {
            count = await this.services.WarehouseService.getCount();
          }
          break;
        case 'users':
          if (this.services.UserService && typeof this.services.UserService.getCount === 'function') {
            count = await this.services.UserService.getCount();
          }
          break;
        case 'suppliers':
          if (this.services.SupplierService && typeof this.services.SupplierService.getCount === 'function') {
            count = await this.services.SupplierService.getCount();
          }
          break;
        case 'batches':
          if (this.services.BatchService && typeof this.services.BatchService.getCount === 'function') {
            count = await this.services.BatchService.getCount();
          }
          break;
        default:
          console.warn(`Unknown entity type: ${entityType}`);
      }
      
      return count;
    } catch (error) {
      console.error(`Error getting count for ${entityType}:`, error.message);
      return 0;
    }
  }
  
  /**
   * Get last sync date - NEW METHOD for dashboard compatibility
   * @param {string} entityType - Type of entity
   * @returns {Promise<string>} - Last sync date
   */
  async getLastSyncDate(entityType) {
    console.log(`Getting last sync date for entity type: ${entityType}`);
    
    try {
      let lastSyncDate = null;
      
      switch (entityType) {
        case 'products':
          if (this.services.PicklistService && typeof this.services.PicklistService.getLastSyncDate === 'function') {
            lastSyncDate = await this.services.PicklistService.getLastSyncDate();
          }
          break;
        case 'picklists':
          if (this.services.PicklistService && typeof this.services.PicklistService.getLastSyncDate === 'function') {
            lastSyncDate = await this.services.PicklistService.getLastSyncDate();
          }
          break;
        case 'warehouses':
          if (this.services.WarehouseService && typeof this.services.WarehouseService.getLastSyncDate === 'function') {
            lastSyncDate = await this.services.WarehouseService.getLastSyncDate();
          }
          break;
        case 'users':
          if (this.services.UserService && typeof this.services.UserService.getLastSyncDate === 'function') {
            lastSyncDate = await this.services.UserService.getLastSyncDate();
          }
          break;
        case 'suppliers':
          if (this.services.SupplierService && typeof this.services.SupplierService.getLastSyncDate === 'function') {
            lastSyncDate = await this.services.SupplierService.getLastSyncDate();
          }
          break;
        case 'batches':
          if (this.services.BatchService && typeof this.services.BatchService.getLastSyncDate === 'function') {
            lastSyncDate = await this.services.BatchService.getLastSyncDate();
          }
          break;
        default:
          console.warn(`Unknown entity type: ${entityType}`);
      }
      
      return lastSyncDate || new Date().toISOString();
    } catch (error) {
      console.error(`Error getting last sync date for ${entityType}:`, error.message);
      return new Date().toISOString();
    }
  }
  
  /**
   * Retry sync - NEW METHOD for dashboard compatibility
   * @param {string} syncId - Sync ID to retry
   * @returns {Promise<Object>} - Retry result
   */
  async retrySync(syncId) {
    console.log(`Retrying sync with ID: ${syncId}`);
    
    try {
      // Parse entity type from sync ID (format: entity_timestamp)
      const parts = syncId.split('_');
      const entityType = parts[0];
      
      // Call appropriate sync method based on entity type
      switch (entityType) {
        case 'products':
          return await this.syncProducts(true);
        case 'picklists':
          return await this.syncPicklists(true);
        case 'warehouses':
          return await this.syncWarehouses(true);
        case 'users':
          return await this.syncUsers(true);
        case 'suppliers':
          return await this.syncSuppliers(true);
        case 'batches':
          return await this.syncBatches(true);
        default:
          throw new Error(`Unknown entity type in sync ID: ${entityType}`);
      }
    } catch (error) {
      console.error(`Error retrying sync ${syncId}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Sync all entities
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Sync results
   */
  async syncAll(fullSync = false) {
    console.log(`Starting sync for all entities (fullSync: ${fullSync})`);
    
    try {
      // Run all sync methods in parallel
      const results = await Promise.allSettled([
        this.syncProducts(fullSync),
        this.syncPicklists(fullSync),
        this.syncWarehouses(fullSync),
        this.syncUsers(fullSync),
        this.syncSuppliers(fullSync),
        this.syncBatches(fullSync)
      ]);
      
      // Process results
      const syncResults = {
        success: results.some(result => result.status === 'fulfilled' && result.value.success),
        entities: {
          products: results[0].status === 'fulfilled' ? results[0].value : { success: false, error: results[0].reason?.message || 'Unknown error' },
          picklists: results[1].status === 'fulfilled' ? results[1].value : { success: false, error: results[1].reason?.message || 'Unknown error' },
          warehouses: results[2].status === 'fulfilled' ? results[2].value : { success: false, error: results[2].reason?.message || 'Unknown error' },
          users: results[3].status === 'fulfilled' ? results[3].value : { success: false, error: results[3].reason?.message || 'Unknown error' },
          suppliers: results[4].status === 'fulfilled' ? results[4].value : { success: false, error: results[4].reason?.message || 'Unknown error' },
          batches: results[5].status === 'fulfilled' ? results[5].value : { success: false, error: results[5].reason?.message || 'Unknown error' }
        }
      };
      
      console.log('Sync completed for all entities');
      return syncResults;
    } catch (error) {
      console.error('Error in syncAll:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Sync products
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Sync results
   */
  async syncProducts(fullSync = false) {
    console.log(`Starting sync for products (fullSync: ${fullSync})`);
    
    try {
      if (!this.services.PicklistService) {
        throw new Error('PicklistService not available');
      }
      
      // Call the service method
      const result = await this.services.PicklistService.syncProducts(fullSync);
      
      console.log('Sync completed for products');
      return {
        success: true,
        count: result.count || 0,
        message: result.message || 'Products sync completed'
      };
    } catch (error) {
      console.error('Error in syncProducts:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Sync picklists
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Sync results
   */
  async syncPicklists(fullSync = false) {
    console.log(`Starting sync for picklists (fullSync: ${fullSync})`);
    
    try {
      if (!this.services.PicklistService) {
        throw new Error('PicklistService not available');
      }
      
      // Call the service method
      const result = await this.services.PicklistService.syncPicklists(fullSync);
      
      console.log('Sync completed for picklists');
      return {
        success: true,
        count: result.count || 0,
        message: result.message || 'Picklists sync completed'
      };
    } catch (error) {
      console.error('Error in syncPicklists:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Sync warehouses
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Sync results
   */
  async syncWarehouses(fullSync = false) {
    console.log(`Starting sync for warehouses (fullSync: ${fullSync})`);
    
    try {
      if (!this.services.WarehouseService) {
        throw new Error('WarehouseService not available');
      }
      
      // Call the service method
      const result = await this.services.WarehouseService.syncWarehouses(fullSync);
      
      console.log('Sync completed for warehouses');
      return {
        success: true,
        count: result.count || 0,
        message: result.message || 'Warehouses sync completed'
      };
    } catch (error) {
      console.error('Error in syncWarehouses:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Sync users
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Sync results
   */
  async syncUsers(fullSync = false) {
    console.log(`Starting sync for users (fullSync: ${fullSync})`);
    
    try {
      if (!this.services.UserService) {
        throw new Error('UserService not available');
      }
      
      // Call the service method
      const result = await this.services.UserService.syncUsers(fullSync);
      
      console.log('Sync completed for users');
      return {
        success: true,
        count: result.count || 0,
        message: result.message || 'Users sync completed'
      };
    } catch (error) {
      console.error('Error in syncUsers:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Sync suppliers
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Sync results
   */
  async syncSuppliers(fullSync = false) {
    console.log(`Starting sync for suppliers (fullSync: ${fullSync})`);
    
    try {
      if (!this.services.SupplierService) {
        throw new Error('SupplierService not available');
      }
      
      // Call the service method
      const result = await this.services.SupplierService.syncSuppliers(fullSync);
      
      console.log('Sync completed for suppliers');
      return {
        success: true,
        count: result.count || 0,
        message: result.message || 'Suppliers sync completed'
      };
    } catch (error) {
      console.error('Error in syncSuppliers:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Sync batches
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Sync results
   */
  async syncBatches(fullSync = false) {
    console.log(`Starting sync for batches (fullSync: ${fullSync})`);
    
    try {
      if (!this.services.BatchService) {
        throw new Error('BatchService not available');
      }
      
      // Call the service method
      const result = await this.services.BatchService.syncBatches(fullSync);
      
      console.log('Sync completed for batches');
      return {
        success: true,
        count: result.count || 0,
        message: result.message || 'Batches sync completed'
      };
    } catch (error) {
      console.error('Error in syncBatches:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = SyncImplementation;
