/**
 * Updated sync_implementation.js with correct method names
 * 
 * This file fixes the method naming mismatches in the sync implementation
 * to match the actual method names in the service classes.
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
                    // Use the correct method name or fallback to a generic count method
                    if (typeof this.ProductService.getProductCount === 'function') {
                        return await this.ProductService.getProductCount();
                    } else if (typeof this.ProductService.getCount === 'function') {
                        return await this.ProductService.getCount();
                    } else {
                        console.log('Product count method not found, using fallback');
                        return await this.getFallbackCount('Products');
                    }
                case 'picklists':
                    if (typeof this.PicklistService.getPicklistCount === 'function') {
                        return await this.PicklistService.getPicklistCount();
                    } else if (typeof this.PicklistService.getCount === 'function') {
                        return await this.PicklistService.getCount();
                    } else {
                        console.log('Picklist count method not found, using fallback');
                        return await this.getFallbackCount('Picklists');
                    }
                case 'warehouses':
                    if (typeof this.WarehouseService.getWarehouseCount === 'function') {
                        return await this.WarehouseService.getWarehouseCount();
                    } else if (typeof this.WarehouseService.getCount === 'function') {
                        return await this.WarehouseService.getCount();
                    } else {
                        console.log('Warehouse count method not found, using fallback');
                        return await this.getFallbackCount('Warehouses');
                    }
                case 'users':
                    if (typeof this.UserService.getUserCount === 'function') {
                        return await this.UserService.getUserCount();
                    } else if (typeof this.UserService.getCount === 'function') {
                        return await this.UserService.getCount();
                    } else {
                        console.log('User count method not found, using fallback');
                        return await this.getFallbackCount('Users');
                    }
                case 'suppliers':
                    if (typeof this.SupplierService.getSupplierCount === 'function') {
                        return await this.SupplierService.getSupplierCount();
                    } else if (typeof this.SupplierService.getCount === 'function') {
                        return await this.SupplierService.getCount();
                    } else {
                        console.log('Supplier count method not found, using fallback');
                        return await this.getFallbackCount('Suppliers');
                    }
                case 'batches':
                    if (typeof this.BatchService.getBatchCount === 'function') {
                        return await this.BatchService.getBatchCount();
                    } else if (typeof this.BatchService.getCount === 'function') {
                        return await this.BatchService.getCount();
                    } else {
                        console.log('Batch count method not found, using fallback');
                        return await this.getFallbackCount('Batches');
                    }
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
     * Get a fallback count from the database directly
     * @param {string} tableName - Name of the table to count
     * @returns {Promise<number>} - Count of records
     */
    async getFallbackCount(tableName) {
        try {
            // Get a connection from one of the services
            let pool;
            if (this.BatchService && this.BatchService.pool) {
                pool = this.BatchService.pool;
            } else if (this.ProductService && this.ProductService.pool) {
                pool = this.ProductService.pool;
            } else if (this.PicklistService && this.PicklistService.pool) {
                pool = this.PicklistService.pool;
            } else {
                console.error('No pool available for fallback count');
                return 0;
            }

            // Check if the table exists
            const tableExists = await pool.request().query(`
                SELECT CASE WHEN EXISTS (
                    SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${tableName}'
                ) THEN 1 ELSE 0 END AS table_exists
            `);
            
            if (tableExists.recordset[0].table_exists === 0) {
                return 0;
            }
            
            // Get count from the table
            const result = await pool.request().query(`
                SELECT COUNT(*) AS count FROM ${tableName}
            `);
            
            return result.recordset[0].count;
        } catch (error) {
            console.error(`Error getting fallback count for ${tableName}:`, error.message);
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
                    // Use the correct method name or fallback to a generic method
                    if (typeof this.ProductService.getLastProductSyncDate === 'function') {
                        return await this.ProductService.getLastProductSyncDate();
                    } else if (typeof this.ProductService.getLastSyncDate === 'function') {
                        return await this.ProductService.getLastSyncDate();
                    } else {
                        console.log('Product last sync date method not found, using fallback');
                        return await this.getFallbackLastSyncDate('products');
                    }
                case 'picklists':
                    if (typeof this.PicklistService.getLastPicklistSyncDate === 'function') {
                        return await this.PicklistService.getLastPicklistSyncDate();
                    } else if (typeof this.PicklistService.getLastSyncDate === 'function') {
                        return await this.PicklistService.getLastSyncDate();
                    } else {
                        console.log('Picklist last sync date method not found, using fallback');
                        return await this.getFallbackLastSyncDate('picklists');
                    }
                case 'warehouses':
                    if (typeof this.WarehouseService.getLastWarehouseSyncDate === 'function') {
                        return await this.WarehouseService.getLastWarehouseSyncDate();
                    } else if (typeof this.WarehouseService.getLastSyncDate === 'function') {
                        return await this.WarehouseService.getLastSyncDate();
                    } else {
                        console.log('Warehouse last sync date method not found, using fallback');
                        return await this.getFallbackLastSyncDate('warehouses');
                    }
                case 'users':
                    if (typeof this.UserService.getLastUserSyncDate === 'function') {
                        return await this.UserService.getLastUserSyncDate();
                    } else if (typeof this.UserService.getLastSyncDate === 'function') {
                        return await this.UserService.getLastSyncDate();
                    } else {
                        console.log('User last sync date method not found, using fallback');
                        return await this.getFallbackLastSyncDate('users');
                    }
                case 'suppliers':
                    if (typeof this.SupplierService.getLastSupplierSyncDate === 'function') {
                        return await this.SupplierService.getLastSupplierSyncDate();
                    } else if (typeof this.SupplierService.getLastSyncDate === 'function') {
                        return await this.SupplierService.getLastSyncDate();
                    } else {
                        console.log('Supplier last sync date method not found, using fallback');
                        return await this.getFallbackLastSyncDate('suppliers');
                    }
                case 'batches':
                    if (typeof this.BatchService.getLastBatchesSyncDate === 'function') {
                        return await this.BatchService.getLastBatchesSyncDate();
                    } else if (typeof this.BatchService.getLastSyncDate === 'function') {
                        return await this.BatchService.getLastSyncDate();
                    } else {
                        console.log('Batch last sync date method not found, using fallback');
                        return await this.getFallbackLastSyncDate('batches');
                    }
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
     * Get a fallback last sync date from the database directly
     * @param {string} entityType - Type of entity
     * @returns {Promise<string>} - Last sync date as ISO string
     */
    async getFallbackLastSyncDate(entityType) {
        try {
            // Get a connection from one of the services
            let pool;
            if (this.BatchService && this.BatchService.pool) {
                pool = this.BatchService.pool;
            } else if (this.ProductService && this.ProductService.pool) {
                pool = this.ProductService.pool;
            } else if (this.PicklistService && this.PicklistService.pool) {
                pool = this.PicklistService.pool;
            } else {
                console.error('No pool available for fallback last sync date');
                return new Date(0).toISOString();
            }

            // Check if the SyncProgress table exists
            const tableExists = await pool.request().query(`
                SELECT CASE WHEN EXISTS (
                    SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SyncProgress'
                ) THEN 1 ELSE 0 END AS table_exists
            `);
            
            if (tableExists.recordset[0].table_exists === 0) {
                return new Date(0).toISOString();
            }
            
            // Get last sync date from the SyncProgress table
            const result = await pool.request()
                .input('entityType', sql.NVarChar, entityType)
                .query(`
                    SELECT TOP 1 last_sync_date
                    FROM SyncProgress
                    WHERE entity_type = @entityType
                    ORDER BY last_sync_date DESC
                `);
            
            if (result.recordset.length > 0) {
                return result.recordset[0].last_sync_date.toISOString();
            } else {
                return new Date(0).toISOString();
            }
        } catch (error) {
            console.error(`Error getting fallback last sync date for ${entityType}:`, error.message);
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
