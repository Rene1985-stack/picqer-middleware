/**
 * Updated Sync Implementation with batches support and days parameter
 * 
 * This module implements the actual sync logic for all entity types,
 * connecting the API adapter to the service classes.
 */

const { v4: uuidv4 } = require('uuid');

class SyncImplementation {
  constructor(services) {
    this.ProductService = services.ProductService;
    this.PicklistService = services.PicklistService;
    this.WarehouseService = services.WarehouseService;
    this.UserService = services.UserService;
    this.SupplierService = services.SupplierService;
    this.BatchService = services.BatchService;
    
    console.log('Sync implementation initialized with service instances');
  }
  
  /**
   * Get entity count from database
   * @param {string} entityType - Entity type (e.g., 'products')
   * @returns {Promise<number>} - Entity count
   */
  async getEntityCount(entityType) {
    try {
      switch (entityType) {
        case 'products':
          return this.ProductService ? await this.ProductService.getProductCountFromDatabase() : 0;
        case 'picklists':
          return this.PicklistService ? await this.PicklistService.getPicklistCountFromDatabase() : 0;
        case 'warehouses':
          return this.WarehouseService ? await this.WarehouseService.getWarehouseCountFromDatabase() : 0;
        case 'users':
          return this.UserService ? await this.UserService.getUserCountFromDatabase() : 0;
        case 'suppliers':
          return this.SupplierService ? await this.SupplierService.getSupplierCountFromDatabase() : 0;
        case 'batches':
          return this.BatchService ? await this.BatchService.getBatchCountFromDatabase() : 0;
        default:
          console.warn(`Unknown entity type: ${entityType}`);
          return 0;
      }
    } catch (error) {
      console.error(`Error getting ${entityType} count:`, error.message);
      return 0;
    }
  }
  
  /**
   * Get last sync date for entity
   * @param {string} entityType - Entity type (e.g., 'products')
   * @returns {Promise<string|null>} - Last sync date or null if never synced
   */
  async getLastSyncDate(entityType) {
    try {
      let lastSyncDate = null;
      
      switch (entityType) {
        case 'products':
          lastSyncDate = this.ProductService ? await this.ProductService.getLastSyncDate() : null;
          break;
        case 'picklists':
          lastSyncDate = this.PicklistService ? await this.PicklistService.getLastSyncDate() : null;
          break;
        case 'warehouses':
          lastSyncDate = this.WarehouseService ? await this.WarehouseService.getLastSyncDate() : null;
          break;
        case 'users':
          lastSyncDate = this.UserService ? await this.UserService.getLastSyncDate() : null;
          break;
        case 'suppliers':
          lastSyncDate = this.SupplierService ? await this.SupplierService.getLastSyncDate() : null;
          break;
        case 'batches':
          lastSyncDate = this.BatchService ? await this.BatchService.getLastSyncDate() : null;
          break;
        default:
          console.warn(`Unknown entity type: ${entityType}`);
      }
      
      return lastSyncDate ? lastSyncDate.toISOString() : null;
    } catch (error) {
      console.error(`Error getting last sync date for ${entityType}:`, error.message);
      return null;
    }
  }
  
  /**
   * Sync products from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Sync results
   */
  async syncProducts(fullSync = false) {
    try {
      console.log(`Starting ${fullSync ? 'full' : 'incremental'} product sync...`);
      
      if (!this.ProductService) {
        throw new Error('ProductService not initialized');
      }
      
      const result = await this.ProductService.syncProducts(fullSync);
      
      console.log(`Product sync completed: ${result.savedProducts} products saved`);
      return result;
    } catch (error) {
      console.error('Error in product sync:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Sync picklists from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Sync results
   */
  async syncPicklists(fullSync = false) {
    try {
      console.log(`Starting ${fullSync ? 'full' : 'incremental'} picklist sync...`);
      
      if (!this.PicklistService) {
        throw new Error('PicklistService not initialized');
      }
      
      const result = await this.PicklistService.syncPicklists(fullSync);
      
      console.log(`Picklist sync completed: ${result.savedPicklists} picklists saved`);
      return result;
    } catch (error) {
      console.error('Error in picklist sync:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Sync warehouses from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Sync results
   */
  async syncWarehouses(fullSync = false) {
    try {
      console.log(`Starting ${fullSync ? 'full' : 'incremental'} warehouse sync...`);
      
      if (!this.WarehouseService) {
        throw new Error('WarehouseService not initialized');
      }
      
      const result = await this.WarehouseService.syncWarehouses(fullSync);
      
      console.log(`Warehouse sync completed: ${result.savedWarehouses} warehouses saved`);
      return result;
    } catch (error) {
      console.error('Error in warehouse sync:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Sync users from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Sync results
   */
  async syncUsers(fullSync = false) {
    try {
      console.log(`Starting ${fullSync ? 'full' : 'incremental'} user sync...`);
      
      if (!this.UserService) {
        throw new Error('UserService not initialized');
      }
      
      const result = await this.UserService.syncUsers(fullSync);
      
      console.log(`User sync completed: ${result.savedUsers} users saved`);
      return result;
    } catch (error) {
      console.error('Error in user sync:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Sync suppliers from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Sync results
   */
  async syncSuppliers(fullSync = false) {
    try {
      console.log(`Starting ${fullSync ? 'full' : 'incremental'} supplier sync...`);
      
      if (!this.SupplierService) {
        throw new Error('SupplierService not initialized');
      }
      
      const result = await this.SupplierService.syncSuppliers(fullSync);
      
      console.log(`Supplier sync completed: ${result.savedSuppliers} suppliers saved`);
      return result;
    } catch (error) {
      console.error('Error in supplier sync:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Sync batches from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @param {number|null} days - Optional number of days to limit sync to
   * @returns {Promise<Object>} - Sync results
   */
  async syncBatches(fullSync = false, days = null) {
    try {
      if (days !== null) {
        console.log(`Starting batch sync for the last ${days} days...`);
      } else {
        console.log(`Starting ${fullSync ? 'full' : 'incremental'} batch sync...`);
      }
      
      if (!this.BatchService) {
        throw new Error('BatchService not initialized');
      }
      
      const result = await this.BatchService.syncBatches(fullSync, days);
      
      console.log(`Batch sync completed: ${result.savedBatches} batches saved`);
      return result;
    } catch (error) {
      console.error('Error in batch sync:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Retry a failed sync
   * @param {string} syncId - Sync ID to retry
   * @returns {Promise<Object>} - Retry results
   */
  async retrySync(syncId) {
    try {
      console.log(`Retrying sync ${syncId}...`);
      
      // Extract entity type from sync ID
      const entityType = syncId.split('_')[0];
      
      // Determine which sync to retry based on entity type
      switch (entityType) {
        case 'products':
          return this.syncProducts(false);
        case 'picklists':
          return this.syncPicklists(false);
        case 'warehouses':
          return this.syncWarehouses(false);
        case 'users':
          return this.syncUsers(false);
        case 'suppliers':
          return this.syncSuppliers(false);
        case 'batches':
          return this.syncBatches(false);
        default:
          throw new Error(`Unknown entity type: ${entityType}`);
      }
    } catch (error) {
      console.error(`Error retrying sync ${syncId}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = SyncImplementation;
