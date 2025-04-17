/**
 * Actual Data Sync Implementation for Picqer Middleware
 * 
 * This file implements the actual data synchronization methods that were missing
 * in the original implementation. It provides concrete implementations for:
 * 
 * 1. Incremental sync for all entity types
 * 2. Full sync for all entity types
 * 3. Retry functionality for failed syncs
 * 
 * These methods connect to the Picqer API, fetch data, and store it in the database.
 */

// Import required modules
const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');

/**
 * Implements actual sync functionality for all entity types
 */
class SyncImplementation {
  constructor(services) {
    this.services = services;
    console.log('SyncImplementation initialized with service instances');
  }

  /**
   * Perform incremental sync for products
   * @returns {Promise<Object>} - Sync result
   */
  async syncProducts(isFullSync = false) {
    try {
      console.log(`Starting ${isFullSync ? 'full' : 'incremental'} product sync...`);
      
      // Get the ProductService instance
      const productService = this.services.ProductService;
      
      if (!productService) {
        throw new Error('ProductService not available');
      }
      
      // Create sync progress record
      let syncProgress;
      if (typeof productService.createOrGetSyncProgress === 'function') {
        syncProgress = await productService.createOrGetSyncProgress('products', isFullSync);
      } else {
        console.log('createOrGetSyncProgress method not found in ProductService, using default progress');
        syncProgress = {
          entity_type: 'products',
          sync_id: `products_${Date.now()}`,
          current_offset: 0,
          batch_number: 0,
          items_processed: 0,
          status: 'in_progress',
          started_at: new Date().toISOString(),
          last_updated: new Date().toISOString()
        };
      }
      
      // Determine date range for sync
      let startDate;
      if (isFullSync) {
        // For full sync, use January 1, 2025 as start date
        startDate = new Date('2025-01-01T00:00:00.000Z');
      } else {
        // For incremental sync, get last sync date or use 30 days ago
        if (typeof productService.getLastSyncDate === 'function') {
          startDate = await productService.getLastSyncDate('products');
        } else {
          // Default to 30 days ago if method not available
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          startDate = thirtyDaysAgo;
        }
      }
      
      console.log(`Fetching products updated since: ${startDate.toISOString()}`);
      
      // Fetch products from Picqer
      let products = [];
      if (typeof productService.getProductsUpdatedSince === 'function') {
        products = await productService.getProductsUpdatedSince(startDate);
      } else if (typeof productService.getAllProducts === 'function') {
        products = await productService.getAllProducts(startDate, syncProgress);
      } else {
        throw new Error('No method available to fetch products from Picqer');
      }
      
      console.log(`Retrieved ${products.length} products from Picqer`);
      
      // Save products to database
      if (products.length > 0) {
        if (typeof productService.saveProductsToDatabase === 'function') {
          await productService.saveProductsToDatabase(products, syncProgress);
        } else if (typeof productService.saveProducts === 'function') {
          await productService.saveProducts(products);
        } else {
          throw new Error('No method available to save products to database');
        }
      }
      
      // Update sync status
      if (typeof productService.updateSyncStatus === 'function') {
        await productService.updateSyncStatus('products', products.length);
      }
      
      // Complete sync progress
      if (typeof productService.completeSyncProgress === 'function') {
        await productService.completeSyncProgress(syncProgress, true);
      }
      
      console.log(`✅ ${isFullSync ? 'Full' : 'Incremental'} product sync completed successfully`);
      return {
        success: true,
        entity: 'products',
        count: products.length,
        syncId: syncProgress.sync_id
      };
    } catch (error) {
      console.error(`❌ Error in ${isFullSync ? 'full' : 'incremental'} product sync:`, error.message);
      return {
        success: false,
        entity: 'products',
        error: error.message
      };
    }
  }

  /**
   * Perform incremental sync for picklists
   * @returns {Promise<Object>} - Sync result
   */
  async syncPicklists(isFullSync = false) {
    try {
      console.log(`Starting ${isFullSync ? 'full' : 'incremental'} picklist sync...`);
      
      // Get the PicklistService instance
      const picklistService = this.services.PicklistService;
      
      if (!picklistService) {
        throw new Error('PicklistService not available');
      }
      
      // Create sync progress record
      let syncProgress;
      if (typeof picklistService.createOrGetSyncProgress === 'function') {
        syncProgress = await picklistService.createOrGetSyncProgress('picklists', isFullSync);
      } else {
        console.log('createOrGetSyncProgress method not found in PicklistService, using default progress');
        syncProgress = {
          entity_type: 'picklists',
          sync_id: `picklists_${Date.now()}`,
          current_offset: 0,
          batch_number: 0,
          items_processed: 0,
          status: 'in_progress',
          started_at: new Date().toISOString(),
          last_updated: new Date().toISOString()
        };
      }
      
      // Determine date range for sync
      let startDate;
      if (isFullSync) {
        // For full sync, use January 1, 2025 as start date
        startDate = new Date('2025-01-01T00:00:00.000Z');
      } else {
        // For incremental sync, get last sync date or use 30 days ago
        if (typeof picklistService.getLastSyncDate === 'function') {
          startDate = await picklistService.getLastSyncDate('picklists');
        } else if (typeof picklistService.getLastSync === 'function') {
          startDate = await picklistService.getLastSync('picklists');
        } else {
          // Default to 30 days ago if method not available
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          startDate = thirtyDaysAgo;
        }
      }
      
      console.log(`Fetching picklists updated since: ${startDate.toISOString()}`);
      
      // Fetch picklists from Picqer
      let picklists = [];
      if (typeof picklistService.getPicklistsUpdatedSince === 'function') {
        picklists = await picklistService.getPicklistsUpdatedSince(startDate);
      } else if (typeof picklistService.getAllPicklists === 'function') {
        picklists = await picklistService.getAllPicklists(startDate, syncProgress);
      } else {
        throw new Error('No method available to fetch picklists from Picqer');
      }
      
      console.log(`Retrieved ${picklists.length} picklists from Picqer`);
      
      // Save picklists to database
      if (picklists.length > 0) {
        if (typeof picklistService.savePicklistsToDatabase === 'function') {
          await picklistService.savePicklistsToDatabase(picklists, syncProgress);
        } else if (typeof picklistService.savePicklists === 'function') {
          await picklistService.savePicklists(picklists);
        } else {
          throw new Error('No method available to save picklists to database');
        }
      }
      
      // Update sync status
      if (typeof picklistService.updateSyncStatus === 'function') {
        await picklistService.updateSyncStatus('picklists', picklists.length);
      }
      
      // Complete sync progress
      if (typeof picklistService.completeSyncProgress === 'function') {
        await picklistService.completeSyncProgress(syncProgress, true);
      }
      
      console.log(`✅ ${isFullSync ? 'Full' : 'Incremental'} picklist sync completed successfully`);
      return {
        success: true,
        entity: 'picklists',
        count: picklists.length,
        syncId: syncProgress.sync_id
      };
    } catch (error) {
      console.error(`❌ Error in ${isFullSync ? 'full' : 'incremental'} picklist sync:`, error.message);
      return {
        success: false,
        entity: 'picklists',
        error: error.message
      };
    }
  }

  /**
   * Perform incremental sync for warehouses
   * @returns {Promise<Object>} - Sync result
   */
  async syncWarehouses(isFullSync = false) {
    try {
      console.log(`Starting ${isFullSync ? 'full' : 'incremental'} warehouse sync...`);
      
      // Get the WarehouseService instance
      const warehouseService = this.services.WarehouseService;
      
      if (!warehouseService) {
        throw new Error('WarehouseService not available');
      }
      
      // Create sync progress record
      let syncProgress;
      if (typeof warehouseService.createOrGetSyncProgress === 'function') {
        syncProgress = await warehouseService.createOrGetSyncProgress('warehouses', isFullSync);
      } else {
        console.log('createOrGetSyncProgress method not found in WarehouseService, using default progress');
        syncProgress = {
          entity_type: 'warehouses',
          sync_id: `warehouses_${Date.now()}`,
          current_offset: 0,
          batch_number: 0,
          items_processed: 0,
          status: 'in_progress',
          started_at: new Date().toISOString(),
          last_updated: new Date().toISOString()
        };
      }
      
      // Determine date range for sync
      let startDate;
      if (isFullSync) {
        // For full sync, use January 1, 2025 as start date
        startDate = new Date('2025-01-01T00:00:00.000Z');
      } else {
        // For incremental sync, get last sync date or use 30 days ago
        if (typeof warehouseService.getLastSyncDate === 'function') {
          startDate = await warehouseService.getLastSyncDate('warehouses');
        } else if (typeof warehouseService.getLastSync === 'function') {
          startDate = await warehouseService.getLastSync('warehouses');
        } else {
          // Default to 30 days ago if method not available
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          startDate = thirtyDaysAgo;
        }
      }
      
      console.log(`Fetching warehouses updated since: ${startDate.toISOString()}`);
      
      // Fetch warehouses from Picqer
      let warehouses = [];
      if (typeof warehouseService.getWarehousesUpdatedSince === 'function') {
        warehouses = await warehouseService.getWarehousesUpdatedSince(startDate);
      } else if (typeof warehouseService.getAllWarehouses === 'function') {
        warehouses = await warehouseService.getAllWarehouses(startDate, syncProgress);
      } else {
        throw new Error('No method available to fetch warehouses from Picqer');
      }
      
      console.log(`Retrieved ${warehouses.length} warehouses from Picqer`);
      
      // Save warehouses to database
      if (warehouses.length > 0) {
        if (typeof warehouseService.saveWarehousesToDatabase === 'function') {
          await warehouseService.saveWarehousesToDatabase(warehouses, syncProgress);
        } else if (typeof warehouseService.saveWarehouses === 'function') {
          await warehouseService.saveWarehouses(warehouses);
        } else {
          throw new Error('No method available to save warehouses to database');
        }
      }
      
      // Update sync status
      if (typeof warehouseService.updateSyncStatus === 'function') {
        await warehouseService.updateSyncStatus('warehouses', warehouses.length);
      }
      
      // Complete sync progress
      if (typeof warehouseService.completeSyncProgress === 'function') {
        await warehouseService.completeSyncProgress(syncProgress, true);
      }
      
      console.log(`✅ ${isFullSync ? 'Full' : 'Incremental'} warehouse sync completed successfully`);
      return {
        success: true,
        entity: 'warehouses',
        count: warehouses.length,
        syncId: syncProgress.sync_id
      };
    } catch (error) {
      console.error(`❌ Error in ${isFullSync ? 'full' : 'incremental'} warehouse sync:`, error.message);
      return {
        success: false,
        entity: 'warehouses',
        error: error.message
      };
    }
  }

  /**
   * Perform incremental sync for users
   * @returns {Promise<Object>} - Sync result
   */
  async syncUsers(isFullSync = false) {
    try {
      console.log(`Starting ${isFullSync ? 'full' : 'incremental'} user sync...`);
      
      // Get the UserService instance
      const userService = this.services.UserService;
      
      if (!userService) {
        throw new Error('UserService not available');
      }
      
      // Create sync progress record
      let syncProgress;
      if (typeof userService.createOrGetSyncProgress === 'function') {
        syncProgress = await userService.createOrGetSyncProgress('users', isFullSync);
      } else {
        console.log('createOrGetSyncProgress method not found in UserService, using default progress');
        syncProgress = {
          entity_type: 'users',
          sync_id: `users_${Date.now()}`,
          current_offset: 0,
          batch_number: 0,
          items_processed: 0,
          status: 'in_progress',
          started_at: new Date().toISOString(),
          last_updated: new Date().toISOString()
        };
      }
      
      // Determine date range for sync
      let startDate;
      if (isFullSync) {
        // For full sync, use January 1, 2025 as start date
        startDate = new Date('2025-01-01T00:00:00.000Z');
      } else {
        // For incremental sync, get last sync date or use 30 days ago
        if (typeof userService.getLastSyncDate === 'function') {
          startDate = await userService.getLastSyncDate('users');
        } else if (typeof userService.getLastSync === 'function') {
          startDate = await userService.getLastSync('users');
        } else {
          // Default to 30 days ago if method not available
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          startDate = thirtyDaysAgo;
        }
      }
      
      console.log(`Fetching users updated since: ${startDate.toISOString()}`);
      
      // Fetch users from Picqer
      let users = [];
      if (typeof userService.getUsersUpdatedSince === 'function') {
        users = await userService.getUsersUpdatedSince(startDate);
      } else if (typeof userService.getAllUsers === 'function') {
        users = await userService.getAllUsers(startDate, syncProgress);
      } else {
        throw new Error('No method available to fetch users from Picqer');
      }
      
      console.log(`Retrieved ${users.length} users from Picqer`);
      
      // Save users to database
      if (users.length > 0) {
        if (typeof userService.saveUsersToDatabase === 'function') {
          await userService.saveUsersToDatabase(users, syncProgress);
        } else if (typeof userService.saveUsers === 'function') {
          await userService.saveUsers(users);
        } else {
          throw new Error('No method available to save users to database');
        }
      }
      
      // Update sync status
      if (typeof userService.updateSyncStatus === 'function') {
        await userService.updateSyncStatus('users', users.length);
      }
      
      // Complete sync progress
      if (typeof userService.completeSyncProgress === 'function') {
        await userService.completeSyncProgress(syncProgress, true);
      }
      
      console.log(`✅ ${isFullSync ? 'Full' : 'Incremental'} user sync completed successfully`);
      return {
        success: true,
        entity: 'users',
        count: users.length,
        syncId: syncProgress.sync_id
      };
    } catch (error) {
      console.error(`❌ Error in ${isFullSync ? 'full' : 'incremental'} user sync:`, error.message);
      return {
        success: false,
        entity: 'users',
        error: error.message
      };
    }
  }

  /**
   * Perform incremental sync for suppliers
   * @returns {Promise<Object>} - Sync result
   */
  async syncSuppliers(isFullSync = false) {
    try {
      console.log(`Starting ${isFullSync ? 'full' : 'incremental'} supplier sync...`);
      
      // Get the SupplierService instance
      const supplierService = this.services.SupplierService;
      
      if (!supplierService) {
        throw new Error('SupplierService not available');
      }
      
      // Create sync progress record
      let syncProgress;
      if (typeof supplierService.createOrGetSyncProgress === 'function') {
        syncProgress = await supplierService.createOrGetSyncProgress('suppliers', isFullSync);
      } else {
        console.log('createOrGetSyncProgress method not found in SupplierService, using default progress');
        syncProgress = {
          entity_type: 'suppliers',
          sync_id: `suppliers_${Date.now()}`,
          current_offset: 0,
          batch_number: 0,
          items_processed: 0,
          status: 'in_progress',
          started_at: new Date().toISOString(),
          last_updated: new Date().toISOString()
        };
      }
      
      // Determine date range for sync
      let startDate;
      if (isFullSync) {
        // For full sync, use January 1, 2025 as start date
        startDate = new Date('2025-01-01T00:00:00.000Z');
      } else {
        // For incremental sync, get last sync date or use 30 days ago
        if (typeof supplierService.getLastSyncDate === 'function') {
          startDate = await supplierService.getLastSyncDate('suppliers');
        } else if (typeof supplierService.getLastSync === 'function') {
          startDate = await supplierService.getLastSync('suppliers');
        } else {
          // Default to 30 days ago if method not available
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          startDate = thirtyDaysAgo;
        }
      }
      
      console.log(`Fetching suppliers updated since: ${startDate.toISOString()}`);
      
      // Fetch suppliers from Picqer
      let suppliers = [];
      if (typeof supplierService.getSuppliersUpdatedSince === 'function') {
        suppliers = await supplierService.getSuppliersUpdatedSince(startDate);
      } else if (typeof supplierService.getAllSuppliers === 'function') {
        suppliers = await supplierService.getAllSuppliers(startDate, syncProgress);
      } else {
        throw new Error('No method available to fetch suppliers from Picqer');
      }
      
      console.log(`Retrieved ${suppliers.length} suppliers from Picqer`);
      
      // Save suppliers to database
      if (suppliers.length > 0) {
        if (typeof supplierService.saveSuppliersToDatabase === 'function') {
          await supplierService.saveSuppliersToDatabase(suppliers, syncProgress);
        } else if (typeof supplierService.saveSuppliers === 'function') {
          await supplierService.saveSuppliers(suppliers);
        } else {
          throw new Error('No method available to save suppliers to database');
        }
      }
      
      // Update sync status
      if (typeof supplierService.updateSyncStatus === 'function') {
        await supplierService.updateSyncStatus('suppliers', suppliers.length);
      }
      
      // Complete sync progress
      if (typeof supplierService.completeSyncProgress === 'function') {
        await supplierService.completeSyncProgress(syncProgress, true);
      }
      
      console.log(`✅ ${isFullSync ? 'Full' : 'Incremental'} supplier sync completed successfully`);
      return {
        success: true,
        entity: 'suppliers',
        count: suppliers.length,
        syncId: syncProgress.sync_id
      };
    } catch (error) {
      console.error(`❌ Error in ${isFullSync ? 'full' : 'incremental'} supplier sync:`, error.message);
      return {
        success: false,
        entity: 'suppliers',
        error: error.message
      };
    }
  }

  /**
   * Retry a failed sync
   * @param {string} syncId - ID of the failed sync
   * @returns {Promise<Object>} - Retry result
   */
  async retrySync(syncId) {
    try {
      console.log(`Retrying sync with ID: ${syncId}`);
      
      // Parse entity type from syncId (format: entity_timestamp)
      const parts = syncId.split('_');
      if (parts.length < 2) {
        throw new Error(`Invalid sync ID format: ${syncId}`);
      }
      
      const entityType = parts[0];
      
      // Determine which sync method to call based on entity type
      let result;
      switch (entityType) {
        case 'products':
          result = await this.syncProducts(true);
          break;
        case 'picklists':
          result = await this.syncPicklists(true);
          break;
        case 'warehouses':
          result = await this.syncWarehouses(true);
          break;
        case 'users':
          result = await this.syncUsers(true);
          break;
        case 'suppliers':
          result = await this.syncSuppliers(true);
          break;
        default:
          throw new Error(`Unknown entity type: ${entityType}`);
      }
      
      console.log(`✅ Retry of sync ${syncId} completed with result:`, result);
      return {
        success: true,
        original_sync_id: syncId,
        new_sync_id: result.syncId,
        entity: entityType,
        count: result.count
      };
    } catch (error) {
      console.error(`❌ Error retrying sync ${syncId}:`, error.message);
      return {
        success: false,
        original_sync_id: syncId,
        error: error.message
      };
    }
  }

  /**
   * Get the count of entities in the database
   * @param {string} entityType - Type of entity
   * @returns {Promise<number>} - Count of entities
   */
  async getEntityCount(entityType) {
    try {
      console.log(`Getting count for entity type: ${entityType}`);
      
      // Get the appropriate service based on entity type
      let service;
      let countMethod;
      
      switch (entityType) {
        case 'products':
          service = this.services.ProductService;
          countMethod = 'getProductCountFromDatabase';
          break;
        case 'picklists':
          service = this.services.PicklistService;
          countMethod = 'getPicklistCountFromDatabase';
          break;
        case 'warehouses':
          service = this.services.WarehouseService;
          countMethod = 'getWarehouseCountFromDatabase';
          break;
        case 'users':
          service = this.services.UserService;
          countMethod = 'getUserCountFromDatabase';
          break;
        case 'suppliers':
          service = this.services.SupplierService;
          countMethod = 'getSupplierCountFromDatabase';
          break;
        default:
          throw new Error(`Unknown entity type: ${entityType}`);
      }
      
      if (!service) {
        throw new Error(`Service for entity type ${entityType} not available`);
      }
      
      // Try to call the count method
      if (typeof service[countMethod] === 'function') {
        return await service[countMethod]();
      } else {
        // Fallback to direct database query if method not available
        console.log(`${countMethod} method not found, using direct database query`);
        
        // Connect to database
        const pool = await sql.connect(service.sqlConfig);
        
        // Determine table name based on entity type
        let tableName;
        switch (entityType) {
          case 'products':
            tableName = 'Products';
            break;
          case 'picklists':
            tableName = 'Picklists';
            break;
          case 'warehouses':
            tableName = 'Warehouses';
            break;
          case 'users':
            tableName = 'Users';
            break;
          case 'suppliers':
            tableName = 'Suppliers';
            break;
          default:
            throw new Error(`Unknown entity type: ${entityType}`);
        }
        
        // Query database for count
        const result = await pool.request().query(`
          SELECT COUNT(*) AS count FROM ${tableName}
        `);
        
        return result.recordset[0].count;
      }
    } catch (error) {
      console.error(`Error getting count for entity type ${entityType}:`, error.message);
      return 0;
    }
  }

  /**
   * Get the last sync date for an entity type
   * @param {string} entityType - Type of entity
   * @returns {Promise<Date>} - Last sync date
   */
  async getLastSyncDate(entityType) {
    try {
      console.log(`Getting last sync date for entity type: ${entityType}`);
      
      // Get the appropriate service based on entity type
      let service;
      
      switch (entityType) {
        case 'products':
          service = this.services.ProductService;
          break;
        case 'picklists':
          service = this.services.PicklistService;
          break;
        case 'warehouses':
          service = this.services.WarehouseService;
          break;
        case 'users':
          service = this.services.UserService;
          break;
        case 'suppliers':
          service = this.services.SupplierService;
          break;
        default:
          throw new Error(`Unknown entity type: ${entityType}`);
      }
      
      if (!service) {
        throw new Error(`Service for entity type ${entityType} not available`);
      }
      
      // Try to call the getLastSyncDate method
      if (typeof service.getLastSyncDate === 'function') {
        return await service.getLastSyncDate(entityType);
      } else if (typeof service.getLastSync === 'function') {
        return await service.getLastSync(entityType);
      } else {
        // Fallback to direct database query if method not available
        console.log('getLastSyncDate method not found, using direct database query');
        
        // Connect to database
        const pool = await sql.connect(service.sqlConfig);
        
        // Query database for last sync date
        const result = await pool.request()
          .input('entityType', sql.NVarChar, entityType)
          .query(`
            SELECT last_sync_date 
            FROM SyncStatus 
            WHERE entity_type = @entityType
          `);
        
        if (result.recordset.length > 0) {
          return new Date(result.recordset[0].last_sync_date);
        } else {
          // Default to January 1, 2025 if no record found
          return new Date('2025-01-01T00:00:00.000Z');
        }
      }
    } catch (error) {
      console.error(`Error getting last sync date for entity type ${entityType}:`, error.message);
      // Default to January 1, 2025 if error occurs
      return new Date('2025-01-01T00:00:00.000Z');
    }
  }
}

module.exports = SyncImplementation;
