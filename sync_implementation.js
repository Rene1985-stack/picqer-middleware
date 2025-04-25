/**
 * Updated SyncImplementation with database connection adapter support
 * 
 * This file updates the SyncImplementation to ensure it works properly
 * with the updated database connection code.
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
