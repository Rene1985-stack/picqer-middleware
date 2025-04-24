/**
 * Customized sync_implementation.js with flexible method detection
 * 
 * This file fixes the method naming mismatches in the sync implementation
 * to properly call the methods that actually exist in your service classes.
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

            // Check if the SyncStatus table exists
            const tableExists = await pool.request().query(`
                SELECT CASE WHEN EXISTS (
                    SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SyncStatus'
                ) THEN 1 ELSE 0 END AS table_exists
            `);
            
            if (tableExists.recordset[0].table_exists === 0) {
                return new Date(0).toISOString();
            }
            
            // Get last sync date from the SyncStatus table
            const result = await pool.request()
                .input('entityType', sql.NVarChar, entityType)
                .query(`
                    SELECT TOP 1 last_sync_date
                    FROM SyncStatus
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
            
            // Check for different method names that might exist in the service
            if (typeof this.ProductService.syncProducts === 'function') {
                return await this.ProductService.syncProducts(fullSync);
            } else if (typeof this.ProductService.syncAllProducts === 'function') {
                return await this.ProductService.syncAllProducts(fullSync);
            } else if (typeof this.ProductService.fetchAndSaveProducts === 'function') {
                return await this.ProductService.fetchAndSaveProducts(fullSync);
            } else if (typeof this.ProductService.sync === 'function') {
                return await this.ProductService.sync(fullSync);
            } else if (typeof this.ProductService.fetchProducts === 'function') {
                return await this.ProductService.fetchProducts(fullSync);
            } else {
                // Use syncService as fallback if available
                if (typeof this.syncService !== 'undefined' && typeof this.syncService.syncData === 'function') {
                    return await this.syncService.syncData('products', fullSync);
                }
                throw new Error('No suitable product sync method found in ProductService');
            }
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
            
            // Check for different method names that might exist in the service
            if (typeof this.PicklistService.syncPicklists === 'function') {
                return await this.PicklistService.syncPicklists(fullSync);
            } else if (typeof this.PicklistService.syncAllPicklists === 'function') {
                return await this.PicklistService.syncAllPicklists(fullSync);
            } else if (typeof this.PicklistService.fetchAndSavePicklists === 'function') {
                return await this.PicklistService.fetchAndSavePicklists(fullSync);
            } else if (typeof this.PicklistService.sync === 'function') {
                return await this.PicklistService.sync(fullSync);
            } else if (typeof this.PicklistService.fetchPicklists === 'function') {
                return await this.PicklistService.fetchPicklists(fullSync);
            } else {
                // Use syncService as fallback if available
                if (typeof this.syncService !== 'undefined' && typeof this.syncService.syncData === 'function') {
                    return await this.syncService.syncData('picklists', fullSync);
                }
                throw new Error('No suitable picklist sync method found in PicklistService');
            }
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
            
            // Check for different method names that might exist in the service
            if (typeof this.WarehouseService.syncWarehouses === 'function') {
                return await this.WarehouseService.syncWarehouses(fullSync);
            } else if (typeof this.WarehouseService.syncAllWarehouses === 'function') {
                return await this.WarehouseService.syncAllWarehouses(fullSync);
            } else if (typeof this.WarehouseService.fetchAndSaveWarehouses === 'function') {
                return await this.WarehouseService.fetchAndSaveWarehouses(fullSync);
            } else if (typeof this.WarehouseService.sync === 'function') {
                return await this.WarehouseService.sync(fullSync);
            } else if (typeof this.WarehouseService.fetchWarehouses === 'function') {
                return await this.WarehouseService.fetchWarehouses(fullSync);
            } else {
                // Use syncService as fallback if available
                if (typeof this.syncService !== 'undefined' && typeof this.syncService.syncData === 'function') {
                    return await this.syncService.syncData('warehouses', fullSync);
                }
                throw new Error('No suitable warehouse sync method found in WarehouseService');
            }
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
            
            // Check for different method names that might exist in the service
            if (typeof this.UserService.syncUsers === 'function') {
                return await this.UserService.syncUsers(fullSync);
            } else if (typeof this.UserService.syncAllUsers === 'function') {
                return await this.UserService.syncAllUsers(fullSync);
            } else if (typeof this.UserService.fetchAndSaveUsers === 'function') {
                return await this.UserService.fetchAndSaveUsers(fullSync);
            } else if (typeof this.UserService.sync === 'function') {
                return await this.UserService.sync(fullSync);
            } else if (typeof this.UserService.fetchUsers === 'function') {
                return await this.UserService.fetchUsers(fullSync);
            } else {
                // Use syncService as fallback if available
                if (typeof this.syncService !== 'undefined' && typeof this.syncService.syncData === 'function') {
                    return await this.syncService.syncData('users', fullSync);
                }
                throw new Error('No suitable user sync method found in UserService');
            }
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
            
            // Check for different method names that might exist in the service
            if (typeof this.SupplierService.syncSuppliers === 'function') {
                return await this.SupplierService.syncSuppliers(fullSync);
            } else if (typeof this.SupplierService.syncAllSuppliers === 'function') {
                return await this.SupplierService.syncAllSuppliers(fullSync);
            } else if (typeof this.SupplierService.fetchAndSaveSuppliers === 'function') {
                return await this.SupplierService.fetchAndSaveSuppliers(fullSync);
            } else if (typeof this.SupplierService.sync === 'function') {
                return await this.SupplierService.sync(fullSync);
            } else if (typeof this.SupplierService.fetchSuppliers === 'function') {
                return await this.SupplierService.fetchSuppliers(fullSync);
            } else {
                // Use syncService as fallback if available
                if (typeof this.syncService !== 'undefined' && typeof this.syncService.syncData === 'function') {
                    return await this.syncService.syncData('suppliers', fullSync);
                }
                throw new Error('No suitable supplier sync method found in SupplierService');
            }
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
            
            // Check for different method names that might exist in the service
            if (typeof this.BatchService.syncBatches === 'function') {
                return await this.BatchService.syncBatches(fullSync);
            } else if (typeof this.BatchService.syncAllBatches === 'function') {
                return await this.BatchService.syncAllBatches(fullSync);
            } else if (typeof this.BatchService.fetchAndSaveBatches === 'function') {
                return await this.BatchService.fetchAndSaveBatches(fullSync);
            } else if (typeof this.BatchService.sync === 'function') {
                return await this.BatchService.sync(fullSync);
            } else if (typeof this.BatchService.fetchBatches === 'function') {
                return await this.BatchService.fetchBatches(fullSync);
            } else {
                // Use syncService as fallback if available
                if (typeof this.syncService !== 'undefined' && typeof this.syncService.syncData === 'function') {
                    return await this.syncService.syncData('batches', fullSync);
                }
                
                // If no method exists, try to implement a basic batch sync
                console.log('No batch sync method found, implementing basic batch sync');
                return await this.implementBasicBatchSync(fullSync);
            }
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
     * Implement a basic batch sync if no method exists in BatchService
     * @param {boolean} [fullSync=false] - Whether to perform a full sync
     * @returns {Promise<Object>} - Result of the sync operation
     */
    async implementBasicBatchSync(fullSync = false) {
        try {
            if (!this.BatchService || !this.BatchService.pool) {
                throw new Error('BatchService or database pool not available');
            }
            
            // Get the last sync date
            let lastSyncDate;
            if (fullSync) {
                lastSyncDate = new Date(0).toISOString();
                console.log('Performing full batch sync');
            } else {
                lastSyncDate = await this.getLastSyncDate('batches');
                console.log('Last batch sync date:', lastSyncDate);
            }
            
            // Create a sync progress record
            const syncId = `batches_${Date.now()}`;
            await this.BatchService.pool.request()
                .input('syncId', sql.VarChar, syncId)
                .input('entityType', sql.VarChar, 'batches')
                .input('status', sql.VarChar, 'in_progress')
                .input('startTime', sql.DateTimeOffset, new Date())
                .query(`
                    INSERT INTO SyncProgress (sync_id, entity_type, status, start_time)
                    VALUES (@syncId, @entityType, @status, @startTime)
                `);
            
            // Fetch batches from Picqer
            let offset = 0;
            let totalBatches = 0;
            let hasMore = true;
            
            while (hasMore) {
                console.log(`Fetching batches with offset ${offset}...`);
                
                // Fetch batches from Picqer
                const response = await this.BatchService.picqerClient.get('/picklists/batches', {
                    offset: offset
                });
                
                if (response.status !== 200) {
                    throw new Error(`Error fetching batches: ${response.statusText}`);
                }
                
                const batches = response.data.data;
                
                if (batches.length === 0) {
                    hasMore = false;
                    continue;
                }
                
                // Process each batch
                for (const batch of batches) {
                    try {
                        // Validate batch ID - ensure it's a string
                        const batchId = String(batch.idpicklist_batch);
                        
                        // Fetch batch details
                        console.log(`Making request to: ${this.BatchService.picqerClient.baseURL}/picklists/batches/${batchId}`);
                        const batchResponse = await this.BatchService.picqerClient.get(`/picklists/batches/${batchId}`);
                        
                        if (batchResponse.status !== 200) {
                            console.error(`Error fetching batch ${batchId}: ${batchResponse.statusText}`);
                            continue;
                        }
                        
                        const batchDetails = batchResponse.data;
                        
                        // Save batch to database
                        await this.saveBatch(batchDetails);
                        
                        totalBatches++;
                    } catch (batchError) {
                        console.error(`Error processing batch ${batch.idpicklist_batch}:`, batchError.message);
                    }
                }
                
                // Increment offset
                offset += batches.length;
                
                // Check if we have more batches
                hasMore = batches.length === 100; // Assuming 100 is the page size
            }
            
            // Update the last sync date
            await this.BatchService.pool.request()
                .input('entityType', sql.VarChar, 'batches')
                .input('lastSyncDate', sql.DateTimeOffset, new Date())
                .query(`
                    UPDATE SyncStatus
                    SET last_sync_date = @lastSyncDate
                    WHERE entity_type = @entityType
                    
                    IF @@ROWCOUNT = 0
                    BEGIN
                        INSERT INTO SyncStatus (entity_type, last_sync_date)
                        VALUES (@entityType, @lastSyncDate)
                    END
                `);
            
            // Update the sync progress record
            await this.BatchService.pool.request()
                .input('syncId', sql.VarChar, syncId)
                .input('status', sql.VarChar, 'completed')
                .input('endTime', sql.DateTimeOffset, new Date())
                .input('count', sql.Int, totalBatches)
                .query(`
                    UPDATE SyncProgress
                    SET status = @status, end_time = @endTime, count = @count
                    WHERE sync_id = @syncId
                `);
            
            console.log(`Batch sync completed. Synced ${totalBatches} batches.`);
            
            return {
                success: true,
                message: `Batch sync completed. Synced ${totalBatches} batches.`,
                count: totalBatches
            };
        } catch (error) {
            console.error('Error in basic batch sync implementation:', error.message);
            return {
                success: false,
                message: `Error in basic batch sync: ${error.message}`,
                error: error.message
            };
        }
    }
    
    /**
     * Save a batch to the database
     * @param {Object} batch - Batch data from Picqer
     * @returns {Promise<void>}
     */
    async saveBatch(batch) {
        try {
            // Ensure batch ID is a string
            const batchId = String(batch.idpicklist_batch);
            
            // Check if the batch already exists
            const existingBatch = await this.BatchService.pool.request()
                .input('batchId', sql.VarChar, batchId)
                .query(`
                    SELECT idpicklist_batch
                    FROM Batches
                    WHERE idpicklist_batch = @batchId
                `);
            
            if (existingBatch.recordset.length > 0) {
                // Update existing batch
                await this.BatchService.pool.request()
                    .input('batchId', sql.VarChar, batchId)
                    .input('name', sql.NVarChar, batch.name || '')
                    .input('status', sql.NVarChar, batch.status || '')
                    .input('createdAt', sql.DateTimeOffset, new Date(batch.created_at))
                    .input('updatedAt', sql.DateTimeOffset, new Date(batch.updated_at))
                    .input('data', sql.NVarChar, JSON.stringify(batch))
                    .query(`
                        UPDATE Batches
                        SET name = @name,
                            status = @status,
                            created_at = @createdAt,
                            updated_at = @updatedAt,
                            data = @data
                        WHERE idpicklist_batch = @batchId
                    `);
            } else {
                // Insert new batch
                await this.BatchService.pool.request()
                    .input('batchId', sql.VarChar, batchId)
                    .input('name', sql.NVarChar, batch.name || '')
                    .input('status', sql.NVarChar, batch.status || '')
                    .input('createdAt', sql.DateTimeOffset, new Date(batch.created_at))
                    .input('updatedAt', sql.DateTimeOffset, new Date(batch.updated_at))
                    .input('data', sql.NVarChar, JSON.stringify(batch))
                    .query(`
                        INSERT INTO Batches (idpicklist_batch, name, status, created_at, updated_at, data)
                        VALUES (@batchId, @name, @status, @createdAt, @updatedAt, @data)
                    `);
            }
        } catch (error) {
            console.error(`Error saving batch ${batch.idpicklist_batch}:`, error.message);
            throw error;
        }
    }

    /**
     * Retry a sync operation
     * @param {string} syncId - ID of the sync operation to retry
     * @returns {Promise<Object>} - Result of the retry operation
     */
    async retrySync(syncId) {
        try {
            console.log(`Retrying sync operation ${syncId}...`);
            
            // Extract entity type from sync ID
            const entityType = syncId.split('_')[0];
            
            // Perform sync based on entity type
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
            console.error(`Error retrying sync operation ${syncId}:`, error.message);
            return {
                success: false,
                message: `Error retrying sync operation ${syncId}: ${error.message}`,
                error: error.message
            };
        }
    }
}

module.exports = SyncImplementation;
