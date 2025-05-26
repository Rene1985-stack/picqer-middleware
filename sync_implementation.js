/**
 * Updated Sync Implementation with BatchService integration
 * 
 * This file implements the actual data synchronization methods including
 * the new BatchService for syncing picklist batches from Picqer.
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
   * Get entity count from database
   * @param {string} entityType - Entity type (e.g., 'products', 'batches')
   * @returns {Promise<number>} - Entity count
   */
  async getEntityCount(entityType) {
    try {
      console.log(`Getting count for entity type: ${entityType}`);
      
      switch (entityType) {
        case 'products':
          if (this.services.ProductService && typeof this.services.ProductService.getProductCountFromDatabase === 'function') {
            return await this.services.ProductService.getProductCountFromDatabase();
          } else {
            console.log('getProductCountFromDatabase method not found, using direct database query');
            return await this.getCountFromDatabase(entityType);
          }
        
        case 'picklists':
          if (this.services.PicklistService && typeof this.services.PicklistService.getPicklistCountFromDatabase === 'function') {
            return await this.services.PicklistService.getPicklistCountFromDatabase();
          } else {
            return await this.getCountFromDatabase(entityType);
          }
        
        case 'warehouses':
          if (this.services.WarehouseService && typeof this.services.WarehouseService.getWarehouseCountFromDatabase === 'function') {
            return await this.services.WarehouseService.getWarehouseCountFromDatabase();
          } else {
            return await this.getCountFromDatabase(entityType);
          }
        
        case 'users':
          if (this.services.UserService && typeof this.services.UserService.getUserCountFromDatabase === 'function') {
            return await this.services.UserService.getUserCountFromDatabase();
          } else {
            return await this.getCountFromDatabase(entityType);
          }
        
        case 'suppliers':
          if (this.services.SupplierService && typeof this.services.SupplierService.getSupplierCountFromDatabase === 'function') {
            return await this.services.SupplierService.getSupplierCountFromDatabase();
          } else {
            console.log('getSupplierCountFromDatabase method not found, using direct database query');
            return await this.getCountFromDatabase(entityType);
          }
          
        case 'batches':
          if (this.services.BatchService && typeof this.services.BatchService.getBatchCountFromDatabase === 'function') {
            return await this.services.BatchService.getBatchCountFromDatabase();
          } else {
            console.log('getBatchCountFromDatabase method not found, using direct database query');
            return await this.getCountFromDatabase(entityType);
          }
        
        default:
          return 0;
      }
    } catch (error) {
      console.error(`Error getting count for entity type ${entityType}:`, error.message);
      return 0;
    }
  }

  /**
   * Get count from database using direct query
   * @param {string} entityType - Entity type (e.g., 'products', 'batches')
   * @returns {Promise<number>} - Entity count
   */
  async getCountFromDatabase(entityType) {
    try {
      // Get SQL config from any service
      const sqlConfig = this.getSqlConfig();
      
      if (!sqlConfig) {
        console.error('SQL config not available');
        return 0;
      }
      
      const pool = await sql.connect(sqlConfig);
      
      // Map entity type to table name
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
        case 'batches':
          tableName = 'Batches';
          break;
        default:
          return 0;
      }
      
      const result = await pool.request().query(`SELECT COUNT(*) as count FROM ${tableName}`);
      return result.recordset[0].count;
    } catch (error) {
      console.error(`Error getting count from database for ${entityType}:`, error.message);
      return 0;
    }
  }

  /**
   * Get last sync date for entity
   * @param {string} entityType - Entity type (e.g., 'products', 'batches')
   * @returns {Promise<Date|null>} - Last sync date or null if never synced
   */
  async getLastSyncDate(entityType) {
    try {
      console.log(`Getting last sync date for entity type: ${entityType}`);
      
      switch (entityType) {
        case 'products':
          if (this.services.ProductService && typeof this.services.ProductService.getLastSyncDate === 'function') {
            return await this.services.ProductService.getLastSyncDate();
          } else {
            console.log('getLastSyncDate method not found, using direct database query');
            return await this.getLastSyncDateFromDatabase(entityType);
          }
        
        case 'picklists':
          if (this.services.PicklistService && typeof this.services.PicklistService.getLastSyncDate === 'function') {
            return await this.services.PicklistService.getLastSyncDate();
          } else {
            console.log('getLastSyncDate method not found, using direct database query');
            return await this.getLastSyncDateFromDatabase(entityType);
          }
        
        case 'warehouses':
          if (this.services.WarehouseService && typeof this.services.WarehouseService.getLastSyncDate === 'function') {
            return await this.services.WarehouseService.getLastSyncDate();
          } else {
            console.log('getLastSyncDate method not found, using direct database query');
            return await this.getLastSyncDateFromDatabase(entityType);
          }
        
        case 'users':
          if (this.services.UserService && typeof this.services.UserService.getLastSyncDate === 'function') {
            return await this.services.UserService.getLastSyncDate();
          } else {
            console.log('getLastSyncDate method not found, using direct database query');
            return await this.getLastSyncDateFromDatabase(entityType);
          }
        
        case 'suppliers':
          if (this.services.SupplierService && typeof this.services.SupplierService.getLastSyncDate === 'function') {
            console.log('getLastSyncDate method called, using getLastSuppliersSyncDate instead');
            return await this.services.SupplierService.getLastSyncDate();
          } else {
            return await this.getLastSyncDateFromDatabase(entityType);
          }
          
        case 'batches':
          if (this.services.BatchService && typeof this.services.BatchService.getLastSyncDate === 'function') {
            return await this.services.BatchService.getLastSyncDate();
          } else {
            console.log('getLastSyncDate method not found for batches, using direct database query');
            return await this.getLastSyncDateFromDatabase(entityType);
          }
        
        default:
          return null;
      }
    } catch (error) {
      console.error(`Error getting last sync date for entity type ${entityType}:`, error.message);
      return null;
    }
  }

  /**
   * Get last sync date from database using direct query
   * @param {string} entityType - Entity type (e.g., 'products', 'batches')
   * @returns {Promise<Date|null>} - Last sync date or null if never synced
   */
  async getLastSyncDateFromDatabase(entityType) {
    try {
      // Get SQL config from any service
      const sqlConfig = this.getSqlConfig();
      
      if (!sqlConfig) {
        console.error('SQL config not available');
        return null;
      }
      
      const pool = await sql.connect(sqlConfig);
      
      const result = await pool.request()
        .input('entityType', sql.NVarChar, entityType)
        .query(`
          SELECT last_sync_date 
          FROM SyncStatus 
          WHERE entity_type = @entityType
        `);
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting last sync date from database for ${entityType}:`, error.message);
      return null;
    }
  }

  /**
   * Get SQL config from any available service
   * @returns {Object|null} - SQL config or null if not available
   */
  getSqlConfig() {
    // Try to get SQL config from any service
    if (this.services.ProductService && this.services.ProductService.sqlConfig) {
      return this.services.ProductService.sqlConfig;
    } else if (this.services.PicklistService && this.services.PicklistService.sqlConfig) {
      return this.services.PicklistService.sqlConfig;
    } else if (this.services.WarehouseService && this.services.WarehouseService.sqlConfig) {
      return this.services.WarehouseService.sqlConfig;
    } else if (this.services.UserService && this.services.UserService.sqlConfig) {
      return this.services.UserService.sqlConfig;
    } else if (this.services.SupplierService && this.services.SupplierService.sqlConfig) {
      return this.services.SupplierService.sqlConfig;
    } else if (this.services.BatchService && this.services.BatchService.sqlConfig) {
      return this.services.BatchService.sqlConfig;
    }
    
    return null;
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
        } else if (typeof supplierService.getLastSuppliersSyncDate === 'function') {
          startDate = await supplierService.getLastSuppliersSyncDate();
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
   * Perform incremental sync for batches
   * @param {boolean} isFullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Sync result
   */
  async syncBatches(isFullSync = false) {
    try {
      console.log(`Starting ${isFullSync ? 'full' : 'incremental'} batch sync...`);
      
      // Get the BatchService instance
      const batchService = this.services.BatchService;
      
      if (!batchService) {
        throw new Error('BatchService not available');
      }
      
      // Create sync progress record
      let syncProgress;
      if (typeof batchService.createOrGetSyncProgress === 'function') {
        syncProgress = await batchService.createOrGetSyncProgress('batches', isFullSync);
      } else {
        console.log('createOrGetSyncProgress method not found in BatchService, using default progress');
        syncProgress = {
          entity_type: 'batches',
          sync_id: `batches_${Date.now()}`,
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
        if (typeof batchService.getLastSyncDate === 'function') {
          startDate = await batchService.getLastSyncDate();
        } else {
          // Default to 30 days ago if method not available
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          startDate = thirtyDaysAgo;
        }
      }
      
      console.log(`Fetching batches updated since: ${startDate.toISOString()}`);
      
      // Fetch batches from Picqer
      let batches = [];
      if (typeof batchService.getBatchesUpdatedSince === 'function') {
        batches = await batchService.getBatchesUpdatedSince(startDate);
      } else if (typeof batchService.getAllBatches === 'function') {
        batches = await batchService.getAllBatches(startDate, syncProgress);
      } else {
        throw new Error('No method available to fetch batches from Picqer');
      }
      
      console.log(`Retrieved ${batches.length} batches from Picqer`);
      
      // Save batches to database
      if (batches.length > 0) {
        if (typeof batchService.saveBatchesToDatabase === 'function') {
          await batchService.saveBatchesToDatabase(batches, syncProgress);
        } else {
          throw new Error('No method available to save batches to database');
        }
      }
      
      // Update sync status
      if (typeof batchService.updateSyncStatus === 'function') {
        await batchService.updateSyncStatus('batches', batches.length);
      }
      
      // Complete sync progress
      if (typeof batchService.completeSyncProgress === 'function') {
        await batchService.completeSyncProgress(syncProgress, true);
      }
      
      console.log(`✅ ${isFullSync ? 'Full' : 'Incremental'} batch sync completed successfully`);
      return {
        success: true,
        entity: 'batches',
        count: batches.length,
        syncId: syncProgress.sync_id
      };
    } catch (error) {
      console.error(`❌ Error in ${isFullSync ? 'full' : 'incremental'} batch sync:`, error.message);
      return {
        success: false,
        entity: 'batches',
        error: error.message
      };
    }
  }

  /**
   * Retry a failed sync
   * @param {string} syncId - Sync ID to retry
   * @returns {Promise<Object>} - Retry result
   */
  async retrySync(syncId) {
    try {
      console.log(`Retrying sync with ID ${syncId}...`);
      
      // Get SQL config from any service
      const sqlConfig = this.getSqlConfig();
      
      if (!sqlConfig) {
        throw new Error('SQL config not available');
      }
      
      // Connect to database
      const pool = await sql.connect(sqlConfig);
      
      // Get sync record
      const result = await pool.request()
        .input('syncId', sql.NVarChar, syncId)
        .query(`
          SELECT * FROM SyncProgress 
          WHERE sync_id = @syncId
        `);
      
      if (result.recordset.length === 0) {
        throw new Error(`Sync record with ID ${syncId} not found`);
      }
      
      const syncRecord = result.recordset[0];
      const entityType = syncRecord.entity_type;
      const isFullSync = syncRecord.is_full_sync === 1;
      
      console.log(`Found sync record for entity type ${entityType}, full sync: ${isFullSync}`);
      
      // Retry sync based on entity type
      switch (entityType) {
        case 'products':
          return await this.syncProducts(isFullSync);
        case 'picklists':
          return await this.syncPicklists(isFullSync);
        case 'warehouses':
          return await this.syncWarehouses(isFullSync);
        case 'users':
          return await this.syncUsers(isFullSync);
        case 'suppliers':
          return await this.syncSuppliers(isFullSync);
        case 'batches':
          return await this.syncBatches(isFullSync);
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
