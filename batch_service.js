/**
 * Minimal Batch Service Implementation
 * 
 * This file provides a minimal implementation of the batch service
 * that follows the same pattern as other entity services without
 * introducing additional complexity.
 */

const sql = require('mssql');

class BatchService {
    /**
     * Initialize the BatchService
     * @param {string} apiKey - Picqer API key
     * @param {string} baseUrl - Picqer API base URL
     * @param {Object} dbConfig - Database configuration
     */
    constructor(apiKey, baseUrl, dbConfig) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.dbConfig = dbConfig;
        this.pool = null;
        
        console.log('BatchService initialized');
    }

    /**
     * Initialize the database connection pool
     * @returns {Promise<sql.ConnectionPool>} - SQL connection pool
     */
    async initializePool() {
        if (!this.pool) {
            try {
                this.pool = await new sql.ConnectionPool(this.dbConfig).connect();
                console.log('BatchService database connection pool initialized');
            } catch (error) {
                console.error('Error initializing BatchService database connection pool:', error.message);
                throw error;
            }
        }
        return this.pool;
    }

    /**
     * Initialize the batches database schema
     * @returns {Promise<void>}
     */
    async initializeBatchesDatabase() {
        try {
            console.log('Initializing batches database schema...');
            
            // Initialize pool if not already initialized
            await this.initializePool();
            
            // Create Batches table if it doesn't exist
            await this.pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Batches')
                BEGIN
                    CREATE TABLE Batches (
                        id INT IDENTITY(1,1) PRIMARY KEY,
                        idbatch INT,
                        batch_number NVARCHAR(255),
                        created_at DATETIME,
                        assigned_to_iduser INT,
                        picking_started_at DATETIME,
                        picking_completed_at DATETIME,
                        closed_by_iduser INT,
                        packing_started_at DATETIME,
                        closed_at DATETIME,
                        status NVARCHAR(50),
                        warehouse_id INT,
                        total_products INT,
                        total_picklists INT,
                        notes NVARCHAR(MAX),
                        last_sync_date DATETIME
                    )
                END
            `);
            
            // Add columns if they don't exist
            const columns = [
                { name: 'idbatch', type: 'INT' },
                { name: 'batch_number', type: 'NVARCHAR(255)' },
                { name: 'created_at', type: 'DATETIME' },
                { name: 'assigned_to_iduser', type: 'INT' },
                { name: 'picking_started_at', type: 'DATETIME' },
                { name: 'picking_completed_at', type: 'DATETIME' },
                { name: 'closed_by_iduser', type: 'INT' },
                { name: 'packing_started_at', type: 'DATETIME' },
                { name: 'closed_at', type: 'DATETIME' },
                { name: 'status', type: 'NVARCHAR(50)' },
                { name: 'warehouse_id', type: 'INT' },
                { name: 'total_products', type: 'INT' },
                { name: 'total_picklists', type: 'INT' },
                { name: 'notes', type: 'NVARCHAR(MAX)' },
                { name: 'last_sync_date', type: 'DATETIME' }
            ];
            
            for (const column of columns) {
                try {
                    const columnExists = await this.pool.request().query(`
                        SELECT COUNT(*) AS count
                        FROM sys.columns
                        WHERE Name = '${column.name}'
                        AND Object_ID = Object_ID('Batches')
                    `);
                    
                    if (columnExists.recordset[0].count === 0) {
                        console.log(`Adding column ${column.name} to table Batches...`);
                        await this.pool.request().query(`
                            ALTER TABLE Batches
                            ADD ${column.name} ${column.type}
                        `);
                        console.log(`Column ${column.name} added to table Batches successfully.`);
                    } else {
                        console.log(`Column ${column.name} already exists in table Batches.`);
                    }
                } catch (error) {
                    console.error(`Error adding column ${column.name} to Batches table:`, error.message);
                }
            }
            
            // Add idpicklist_batch column to Picklists table if it doesn't exist
            try {
                const columnExists = await this.pool.request().query(`
                    SELECT COUNT(*) AS count
                    FROM sys.columns
                    WHERE Name = 'idpicklist_batch'
                    AND Object_ID = Object_ID('Picklists')
                `);
                
                if (columnExists.recordset[0].count === 0) {
                    console.log('Adding column idpicklist_batch to table Picklists...');
                    await this.pool.request().query(`
                        ALTER TABLE Picklists
                        ADD idpicklist_batch INT
                    `);
                    console.log('Column idpicklist_batch added to table Picklists successfully.');
                } else {
                    console.log('Column idpicklist_batch already exists in table Picklists.');
                }
            } catch (error) {
                console.error('Error adding column idpicklist_batch to Picklists table:', error.message);
            }
            
            // Update SyncStatus table to include batches entity
            try {
                const entityExists = await this.pool.request().query(`
                    SELECT COUNT(*) AS count
                    FROM SyncStatus
                    WHERE entity_name = 'batches'
                `);
                
                if (entityExists.recordset[0].count === 0) {
                    await this.pool.request().query(`
                        INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date, last_sync_count, total_count)
                        VALUES ('batches', 'batches', GETDATE(), 0, 0)
                    `);
                    console.log('Added batches entity to SyncStatus');
                } else {
                    await this.pool.request().query(`
                        UPDATE SyncStatus
                        SET entity_type = 'batches'
                        WHERE entity_name = 'batches'
                    `);
                    console.log('Updated existing batches entity in SyncStatus');
                }
            } catch (error) {
                console.error('Error updating SyncStatus table:', error.message);
            }
            
            console.log('Batches database schema initialized successfully');
        } catch (error) {
            console.error('Error initializing batches database schema:', error.message);
            throw error;
        }
    }

    /**
     * Get the count of batches in the database
     * @returns {Promise<number>} - Count of batches
     */
    async getCount() {
        try {
            await this.initializePool();
            
            const result = await this.pool.request().query(`
                SELECT COUNT(*) AS count
                FROM Batches
            `);
            
            return result.recordset[0].count;
        } catch (error) {
            console.error('Error getting batch count:', error.message);
            return 0;
        }
    }

    /**
     * Get the last sync date for batches
     * @returns {Promise<string>} - Last sync date as ISO string
     */
    async getLastSyncDate() {
        try {
            await this.initializePool();
            
            const result = await this.pool.request().query(`
                SELECT TOP 1 last_sync_date
                FROM SyncProgress
                WHERE entity_type = 'batches'
                ORDER BY last_sync_date DESC
            `);
            
            if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
                return result.recordset[0].last_sync_date.toISOString();
            } else {
                return new Date(0).toISOString();
            }
        } catch (error) {
            console.error('Error getting last batch sync date:', error.message);
            return new Date(0).toISOString();
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
            
            // Initialize pool if not already initialized
            await this.initializePool();
            
            // Get last sync date for incremental sync
            let lastSyncDate = null;
            if (!fullSync) {
                lastSyncDate = await this.getLastSyncDate();
                console.log(`Last batch sync date: ${lastSyncDate}`);
            }
            
            // Create a unique sync ID
            const syncId = `batches_${fullSync ? 'full' : 'incremental'}_${Date.now()}`;
            
            // Record sync start in SyncProgress table
            await this.pool.request()
                .input('syncId', sql.NVarChar, syncId)
                .input('entityType', sql.NVarChar, 'batches')
                .input('syncType', sql.NVarChar, fullSync ? 'full' : 'incremental')
                .input('startDate', sql.DateTime, new Date())
                .input('status', sql.NVarChar, 'in_progress')
                .query(`
                    INSERT INTO SyncProgress (
                        sync_id, entity_type, sync_type, start_date, status
                    )
                    VALUES (
                        @syncId, @entityType, @syncType, @startDate, @status
                    )
                `);
            
            // Fetch batches from Picqer API
            const batches = await this.fetchBatchesFromPicqer(lastSyncDate);
            console.log(`Fetched ${batches.length} batches from Picqer`);
            
            // Process batches
            let processedCount = 0;
            for (const batch of batches) {
                await this.processBatch(batch);
                processedCount++;
                
                // Update sync progress every 10 batches
                if (processedCount % 10 === 0) {
                    await this.updateSyncProgress(syncId, processedCount, batches.length);
                }
            }
            
            // Update SyncStatus table
            const totalCount = await this.getCount();
            await this.pool.request()
                .input('lastSyncDate', sql.DateTime, new Date())
                .input('lastSyncCount', sql.Int, processedCount)
                .input('totalCount', sql.Int, totalCount)
                .query(`
                    UPDATE SyncStatus
                    SET last_sync_date = @lastSyncDate,
                        last_sync_count = @lastSyncCount,
                        total_count = @totalCount
                    WHERE entity_name = 'batches'
                `);
            
            // Record sync completion in SyncProgress table
            await this.pool.request()
                .input('syncId', sql.NVarChar, syncId)
                .input('endDate', sql.DateTime, new Date())
                .input('status', sql.NVarChar, 'completed')
                .input('processedCount', sql.Int, processedCount)
                .input('totalCount', sql.Int, batches.length)
                .query(`
                    UPDATE SyncProgress
                    SET end_date = @endDate,
                        status = @status,
                        processed_count = @processedCount,
                        total_count = @totalCount
                    WHERE sync_id = @syncId
                `);
            
            console.log(`Batch sync completed: ${processedCount} batches processed`);
            
            return {
                success: true,
                syncId,
                processedCount,
                totalCount: batches.length,
                message: `Batch sync completed: ${processedCount} batches processed`
            };
        } catch (error) {
            console.error('Error syncing batches:', error.message);
            
            // Record sync failure in SyncProgress table
            try {
                await this.pool.request()
                    .input('syncId', sql.NVarChar, syncId)
                    .input('endDate', sql.DateTime, new Date())
                    .input('status', sql.NVarChar, 'failed')
                    .input('error', sql.NVarChar, error.message)
                    .query(`
                        UPDATE SyncProgress
                        SET end_date = @endDate,
                            status = @status,
                            error = @error
                        WHERE sync_id = @syncId
                    `);
            } catch (updateError) {
                console.error('Error updating sync progress:', updateError.message);
            }
            
            return {
                success: false,
                error: error.message,
                message: `Batch sync failed: ${error.message}`
            };
        }
    }

    /**
     * Fetch batches from Picqer API
     * @param {string} [lastSyncDate=null] - Last sync date for incremental sync
     * @returns {Promise<Array>} - Array of batches
     */
    async fetchBatchesFromPicqer(lastSyncDate = null) {
        try {
            // This is a simplified implementation that returns mock data
            // In a real implementation, you would make API calls to Picqer
            
            // For testing purposes, return some mock batches
            return [
                {
                    idbatch: 1001,
                    batch_number: 'BATCH-1001',
                    created_at: new Date().toISOString(),
                    status: 'new',
                    warehouse_id: 1,
                    total_products: 5,
                    total_picklists: 2
                },
                {
                    idbatch: 1002,
                    batch_number: 'BATCH-1002',
                    created_at: new Date().toISOString(),
                    status: 'in_progress',
                    warehouse_id: 1,
                    total_products: 8,
                    total_picklists: 3
                },
                {
                    idbatch: 1003,
                    batch_number: 'BATCH-1003',
                    created_at: new Date().toISOString(),
                    status: 'completed',
                    warehouse_id: 2,
                    total_products: 12,
                    total_picklists: 4
                }
            ];
        } catch (error) {
            console.error('Error fetching batches from Picqer:', error.message);
            throw error;
        }
    }

    /**
     * Process a batch and save it to the database
     * @param {Object} batch - Batch data from Picqer
     * @returns {Promise<void>}
     */
    async processBatch(batch) {
        try {
            await this.initializePool();
            
            // Check if batch already exists
            const existingBatch = await this.pool.request()
                .input('idbatch', sql.Int, batch.idbatch)
                .query(`
                    SELECT id
                    FROM Batches
                    WHERE idbatch = @idbatch
                `);
            
            if (existingBatch.recordset.length > 0) {
                // Update existing batch
                await this.pool.request()
                    .input('idbatch', sql.Int, batch.idbatch)
                    .input('batch_number', sql.NVarChar, batch.batch_number)
                    .input('created_at', sql.DateTime, new Date(batch.created_at))
                    .input('status', sql.NVarChar, batch.status)
                    .input('warehouse_id', sql.Int, batch.warehouse_id)
                    .input('total_products', sql.Int, batch.total_products)
                    .input('total_picklists', sql.Int, batch.total_picklists)
                    .input('last_sync_date', sql.DateTime, new Date())
                    .query(`
                        UPDATE Batches
                        SET batch_number = @batch_number,
                            created_at = @created_at,
                            status = @status,
                            warehouse_id = @warehouse_id,
                            total_products = @total_products,
                            total_picklists = @total_picklists,
                            last_sync_date = @last_sync_date
                        WHERE idbatch = @idbatch
                    `);
            } else {
                // Insert new batch
                await this.pool.request()
                    .input('idbatch', sql.Int, batch.idbatch)
                    .input('batch_number', sql.NVarChar, batch.batch_number)
                    .input('created_at', sql.DateTime, new Date(batch.created_at))
                    .input('status', sql.NVarChar, batch.status)
                    .input('warehouse_id', sql.Int, batch.warehouse_id)
                    .input('total_products', sql.Int, batch.total_products)
                    .input('total_picklists', sql.Int, batch.total_picklists)
                    .input('last_sync_date', sql.DateTime, new Date())
                    .query(`
                        INSERT INTO Batches (
                            idbatch, batch_number, created_at, status, warehouse_id,
                            total_products, total_picklists, last_sync_date
                        )
                        VALUES (
                            @idbatch, @batch_number, @created_at, @status, @warehouse_id,
                            @total_products, @total_picklists, @last_sync_date
                        )
                    `);
            }
        } catch (error) {
            console.error(`Error processing batch ${batch.idbatch}:`, error.message);
            throw error;
        }
    }

    /**
     * Update sync progress in the SyncProgress table
     * @param {string} syncId - Sync ID
     * @param {number} processedCount - Number of processed batches
     * @param {number} totalCount - Total number of batches
     * @returns {Promise<void>}
     */
    async updateSyncProgress(syncId, processedCount, totalCount) {
        try {
            await this.pool.request()
                .input('syncId', sql.NVarChar, syncId)
                .input('processedCount', sql.Int, processedCount)
                .input('totalCount', sql.Int, totalCount)
                .query(`
                    UPDATE SyncProgress
                    SET processed_count = @processedCount,
                        total_count = @totalCount
                    WHERE sync_id = @syncId
                `);
        } catch (error) {
            console.error('Error updating sync progress:', error.message);
        }
    }
}

module.exports = BatchService;
