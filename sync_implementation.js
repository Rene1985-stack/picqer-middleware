/**
 * Updated sync_implementation.js with batch sync integration
 * 
 * This file integrates batch synchronization into the existing sync implementation
 * following the same pattern as other entities.
 */

const sql = require('mssql');

class SyncImplementation {
    /**
     * Initialize the SyncImplementation with service instances
     * @param {Object} services - Service instances
     */
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
     * Get the count of entities in the database
     * @param {string} entityType - Type of entity
     * @returns {Promise<number>} - Count of entities
     */
    async getEntityCount(entityType) {
        try {
            switch (entityType) {
                case 'products':
                    return await this.ProductService.getProductCount();
                case 'picklists':
                    return await this.PicklistService.getPicklistCount();
                case 'warehouses':
                    return await this.WarehouseService.getWarehouseCount();
                case 'users':
                    return await this.UserService.getUserCount();
                case 'suppliers':
                    return await this.SupplierService.getSupplierCount();
                case 'batches':
                    return await this.BatchService.getBatchCount();
                default:
                    console.log(`Unknown entity type: ${entityType}`);
                    return 0;
            }
        } catch (error) {
            console.error(`Error getting ${entityType} count:`, error.message);
            return 0;
        }
    }

    /**
     * Get the last sync date for an entity
     * @param {string} entityType - Type of entity
     * @returns {Promise<string>} - Last sync date as ISO string
     */
    async getLastSyncDate(entityType) {
        try {
            switch (entityType) {
                case 'products':
                    return await this.ProductService.getLastProductSyncDate();
                case 'picklists':
                    return await this.PicklistService.getLastPicklistSyncDate();
                case 'warehouses':
                    return await this.WarehouseService.getLastWarehouseSyncDate();
                case 'users':
                    return await this.UserService.getLastUserSyncDate();
                case 'suppliers':
                    return await this.SupplierService.getLastSupplierSyncDate();
                case 'batches':
                    return await this.BatchService.getLastBatchesSyncDate();
                default:
                    console.log(`Unknown entity type: ${entityType}`);
                    return new Date(0).toISOString();
            }
        } catch (error) {
            console.error(`Error getting last ${entityType} sync date:`, error.message);
            return new Date(0).toISOString();
        }
    }

    /**
     * Sync products from Picqer to the database
     * @param {boolean} [fullSync=false] - Whether to perform a full sync
     * @returns {Promise<Object>} - Result of the sync operation
     */
    async syncProducts(fullSync = false) {
        try {
            console.log(`Starting ${fullSync ? 'full' : 'incremental'} product sync...`);
            return await this.ProductService.syncProducts(fullSync);
        } catch (error) {
            console.error('Error syncing products:', error.message);
            return {
                success: false,
                message: `Error syncing products: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Sync picklists from Picqer to the database
     * @param {boolean} [fullSync=false] - Whether to perform a full sync
     * @returns {Promise<Object>} - Result of the sync operation
     */
    async syncPicklists(fullSync = false) {
        try {
            console.log(`Starting ${fullSync ? 'full' : 'incremental'} picklist sync...`);
            return await this.PicklistService.syncPicklists(fullSync);
        } catch (error) {
            console.error('Error syncing picklists:', error.message);
            return {
                success: false,
                message: `Error syncing picklists: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Sync warehouses from Picqer to the database
     * @param {boolean} [fullSync=false] - Whether to perform a full sync
     * @returns {Promise<Object>} - Result of the sync operation
     */
    async syncWarehouses(fullSync = false) {
        try {
            console.log(`Starting ${fullSync ? 'full' : 'incremental'} warehouse sync...`);
            return await this.WarehouseService.syncWarehouses(fullSync);
        } catch (error) {
            console.error('Error syncing warehouses:', error.message);
            return {
                success: false,
                message: `Error syncing warehouses: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Sync users from Picqer to the database
     * @param {boolean} [fullSync=false] - Whether to perform a full sync
     * @returns {Promise<Object>} - Result of the sync operation
     */
    async syncUsers(fullSync = false) {
        try {
            console.log(`Starting ${fullSync ? 'full' : 'incremental'} user sync...`);
            return await this.UserService.syncUsers(fullSync);
        } catch (error) {
            console.error('Error syncing users:', error.message);
            return {
                success: false,
                message: `Error syncing users: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Sync suppliers from Picqer to the database
     * @param {boolean} [fullSync=false] - Whether to perform a full sync
     * @returns {Promise<Object>} - Result of the sync operation
     */
    async syncSuppliers(fullSync = false) {
        try {
            console.log(`Starting ${fullSync ? 'full' : 'incremental'} supplier sync...`);
            return await this.SupplierService.syncSuppliers(fullSync);
        } catch (error) {
            console.error('Error syncing suppliers:', error.message);
            return {
                success: false,
                message: `Error syncing suppliers: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Sync batches from Picqer to the database
     * @param {boolean} [fullSync=false] - Whether to perform a full sync
     * @returns {Promise<Object>} - Result of the sync operation
     */
    async syncBatches(fullSync = false) {
        try {
            console.log(`Starting ${fullSync ? 'full' : 'incremental'} batch sync...`);
            return await this.BatchService.syncBatches(fullSync);
        } catch (error) {
            console.error('Error syncing batches:', error.message);
            return {
                success: false,
                message: `Error syncing batches: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Retry a sync operation
     * @param {string} syncId - ID of the sync operation to retry
     * @returns {Promise<Object>} - Result of the retry operation
     */
    async retrySync(syncId) {
        try {
            console.log(`Retrying sync operation: ${syncId}`);
            
            // Parse the sync ID to determine entity type and sync type
            const parts = syncId.split('_');
            if (parts.length < 2) {
                throw new Error(`Invalid sync ID: ${syncId}`);
            }
            
            const entityType = parts[0];
            const fullSync = parts.includes('full');
            
            // Retry the sync based on entity type
            switch (entityType) {
                case 'products':
                    return await this.syncProducts(fullSync);
                case 'picklists':
                    return await this.syncPicklists(fullSync);
                case 'warehouses':
                    return await this.syncWarehouses(fullSync);
                case 'users':
                    return await this.syncUsers(fullSync);
                case 'suppliers':
                    return await this.syncSuppliers(fullSync);
                case 'batches':
                    return await this.syncBatches(fullSync);
                default:
                    throw new Error(`Unknown entity type: ${entityType}`);
            }
        } catch (error) {
            console.error(`Error retrying sync operation ${syncId}:`, error.message);
            return {
                success: false,
                message: `Error retrying sync operation: ${error.message}`,
                error: error.message
            };
        }
    }
}

module.exports = SyncImplementation;
