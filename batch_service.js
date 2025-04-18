// standard_batch_service.js
const sql = require('mssql');
const axios = require('axios');
const { SchemaManager } = require('./schema_manager');

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
        this.schemaManager = null;
    }

    /**
     * Initialize the database connection pool
     * @returns {Promise<sql.ConnectionPool>} - SQL connection pool
     */
    async getPool() {
        if (!this.pool) {
            this.pool = await new sql.ConnectionPool(this.dbConfig).connect();
            this.schemaManager = new SchemaManager(this.pool);
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
            const pool = await this.getPool();
            
            // Ensure the Batches table exists with all required columns
            await this.schemaManager.ensureTableExists('Batches', {
                id: { type: 'INT', primaryKey: true, identity: true },
                idbatch: { type: 'INT', nullable: false },
                batch_number: { type: 'NVARCHAR(50)', nullable: false },
                created_at: { type: 'DATETIME', nullable: false, defaultValue: 'GETDATE()' },
                assigned_to_iduser: { type: 'INT', nullable: true },
                picking_started_at: { type: 'DATETIME', nullable: true },
                picking_completed_at: { type: 'DATETIME', nullable: true },
                closed_by_iduser: { type: 'INT', nullable: true },
                packing_started_at: { type: 'DATETIME', nullable: true },
                closed_at: { type: 'DATETIME', nullable: true },
                status: { type: 'NVARCHAR(50)', nullable: false, defaultValue: "'open'" },
                warehouse_id: { type: 'INT', nullable: true },
                total_products: { type: 'INT', nullable: true },
                total_picklists: { type: 'INT', nullable: true },
                notes: { type: 'NVARCHAR(MAX)', nullable: true },
                last_sync_date: { type: 'DATETIME', nullable: false, defaultValue: 'GETDATE()' }
            });

            // Ensure the Picklists table has the batch relationship column
            await this.schemaManager.ensureColumnExists('Picklists', 'idpicklist_batch', { type: 'INT', nullable: true });
            
            // Create indexes for better performance
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_batches_batch_number' AND object_id = OBJECT_ID('Batches'))
                BEGIN
                    CREATE INDEX idx_batches_batch_number ON Batches(batch_number);
                END
            `);
            
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_batches_idbatch' AND object_id = OBJECT_ID('Batches'))
                BEGIN
                    CREATE INDEX idx_batches_idbatch ON Batches(idbatch);
                END
            `);
            
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_batches_status' AND object_id = OBJECT_ID('Batches'))
                BEGIN
                    CREATE INDEX idx_batches_status ON Batches(status);
                END
            `);
            
            console.log('Batches database schema initialized successfully');
        } catch (error) {
            console.error('Error initializing batches database schema:', error);
            throw error;
        }
    }

    /**
     * Get batches from Picqer API
     * @param {string} [sinceTimestamp] - Optional timestamp to get batches since
     * @returns {Promise<Array>} - Array of batch objects
     */
    async getBatchesFromPicqer(sinceTimestamp = null) {
        try {
            let url = `${this.baseUrl}/batches`;
            if (sinceTimestamp) {
                url += `?since=${sinceTimestamp}`;
            }

            console.log(`Fetching batches from Picqer API: ${url}`);
            
            const response = await axios.get(url, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Picqer Middleware',
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            console.log(`Retrieved ${response.data.length} batches from Picqer API`);
            return response.data;
        } catch (error) {
            console.error('Error fetching batches from Picqer:', error.message);
            if (error.response) {
                console.error(`Response status: ${error.response.status}`);
                console.error('Response data:', error.response.data);
            }
            throw error;
        }
    }

    /**
     * Get the last sync date for batches
     * @returns {Promise<string>} - Last sync date as ISO string
     */
    async getLastBatchesSyncDate() {
        try {
            const pool = await this.getPool();
            
            // Check if the sync_progress table exists and has the necessary columns
            await this.schemaManager.ensureTableExists('SyncProgress', {
                id: { type: 'INT', primaryKey: true, identity: true },
                entity_type: { type: 'NVARCHAR(50)', nullable: false },
                last_sync_date: { type: 'DATETIME', nullable: false },
                status: { type: 'NVARCHAR(50)', nullable: false },
                total_count: { type: 'INT', nullable: true },
                processed_count: { type: 'INT', nullable: true },
                error_message: { type: 'NVARCHAR(MAX)', nullable: true }
            });

            const result = await pool.request()
                .input('entityType', sql.NVarChar, 'batches')
                .query(`
                    SELECT TOP 1 last_sync_date
                    FROM SyncProgress
                    WHERE entity_type = @entityType
                    ORDER BY last_sync_date DESC
                `);

            if (result.recordset.length > 0) {
                return result.recordset[0].last_sync_date.toISOString();
            } else {
                // If no record exists, return a date far in the past
                return new Date(0).toISOString();
            }
        } catch (error) {
            console.error('Error getting last batches sync date:', error);
            // If there's an error, return a date far in the past
            return new Date(0).toISOString();
        }
    }

    /**
     * Update the sync status for batches
     * @param {Date} syncDate - The sync date to record
     * @param {string} status - The status of the sync
     * @param {Object} [counts] - Optional counts object with total_count and processed_count
     * @param {string} [errorMessage] - Optional error message
     */
    async updateBatchesSyncStatus(syncDate, status, counts = {}, errorMessage = null) {
        try {
            const pool = await this.getPool();
            
            // Ensure the SyncProgress table exists
            await this.schemaManager.ensureTableExists('SyncProgress', {
                id: { type: 'INT', primaryKey: true, identity: true },
                entity_type: { type: 'NVARCHAR(50)', nullable: false },
                last_sync_date: { type: 'DATETIME', nullable: false },
                status: { type: 'NVARCHAR(50)', nullable: false },
                total_count: { type: 'INT', nullable: true },
                processed_count: { type: 'INT', nullable: true },
                error_message: { type: 'NVARCHAR(MAX)', nullable: true }
            });

            const request = pool.request()
                .input('entityType', sql.NVarChar, 'batches')
                .input('lastSyncDate', sql.DateTime, syncDate)
                .input('status', sql.NVarChar, status);

            // Add optional parameters if they exist
            if (counts.total_count !== undefined) {
                request.input('totalCount', sql.Int, counts.total_count);
            }
            if (counts.processed_count !== undefined) {
                request.input('processedCount', sql.Int, counts.processed_count);
            }
            if (errorMessage) {
                request.input('errorMessage', sql.NVarChar, errorMessage);
            }

            // Build the query dynamically based on which columns exist
            let query = `
                INSERT INTO SyncProgress (
                    entity_type, 
                    last_sync_date, 
                    status
            `;

            // Add optional columns to the query
            if (counts.total_count !== undefined) {
                query += `, total_count`;
            }
            if (counts.processed_count !== undefined) {
                query += `, processed_count`;
            }
            if (errorMessage) {
                query += `, error_message`;
            }

            query += `) VALUES (
                @entityType, 
                @lastSyncDate, 
                @status
            `;

            // Add optional values to the query
            if (counts.total_count !== undefined) {
                query += `, @totalCount`;
            }
            if (counts.processed_count !== undefined) {
                query += `, @processedCount`;
            }
            if (errorMessage) {
                query += `, @errorMessage`;
            }

            query += `)`;

            await request.query(query);
            console.log(`Updated batches sync status: ${status}, date: ${syncDate}`);
        } catch (error) {
            console.error('Error updating batches sync status:', error);
            throw error;
        }
    }

    /**
     * Save batches to the database
     * @param {Array} batches - Array of batch objects from Picqer API
     * @returns {Promise<number>} - Number of batches saved
     */
    async saveBatchesToDatabase(batches) {
        try {
            console.log(`Saving ${batches.length} batches to database...`);
            const pool = await this.getPool();
            
            // Ensure the Batches table exists with all required columns
            await this.schemaManager.ensureTableExists('Batches', {
                id: { type: 'INT', primaryKey: true, identity: true },
                idbatch: { type: 'INT', nullable: false },
                batch_number: { type: 'NVARCHAR(50)', nullable: false },
                created_at: { type: 'DATETIME', nullable: false, defaultValue: 'GETDATE()' },
                assigned_to_iduser: { type: 'INT', nullable: true },
                picking_started_at: { type: 'DATETIME', nullable: true },
                picking_completed_at: { type: 'DATETIME', nullable: true },
                closed_by_iduser: { type: 'INT', nullable: true },
                packing_started_at: { type: 'DATETIME', nullable: true },
                closed_at: { type: 'DATETIME', nullable: true },
                status: { type: 'NVARCHAR(50)', nullable: false, defaultValue: "'open'" },
                warehouse_id: { type: 'INT', nullable: true },
                total_products: { type: 'INT', nullable: true },
                total_picklists: { type: 'INT', nullable: true },
                notes: { type: 'NVARCHAR(MAX)', nullable: true },
                last_sync_date: { type: 'DATETIME', nullable: false, defaultValue: 'GETDATE()' }
            });

            // Ensure the Picklists table has the batch relationship column
            await this.schemaManager.ensureColumnExists('Picklists', 'idpicklist_batch', { type: 'INT', nullable: true });
            
            // Create a transaction for batch inserts
            const transaction = new sql.Transaction(pool);
            await transaction.begin();
            
            try {
                let savedCount = 0;
                
                for (const batch of batches) {
                    // Check if batch already exists
                    const checkResult = await new sql.Request(transaction)
                        .input('idbatch', sql.Int, batch.idbatch)
                        .query(`
                            SELECT id FROM Batches 
                            WHERE idbatch = @idbatch
                        `);
                    
                    const request = new sql.Request(transaction);
                    
                    // Map Picqer batch data to our schema
                    request.input('idbatch', sql.Int, batch.idbatch);
                    request.input('batchNumber', sql.NVarChar, batch.batchnumber);
                    request.input('createdAt', sql.DateTime, new Date(batch.created));
                    request.input('assignedToIduser', sql.Int, batch.assigned_to_iduser || null);
                    request.input('pickingStartedAt', sql.DateTime, batch.picking_started_at ? new Date(batch.picking_started_at) : null);
                    request.input('pickingCompletedAt', sql.DateTime, batch.picking_completed_at ? new Date(batch.picking_completed_at) : null);
                    request.input('closedByIduser', sql.Int, batch.closed_by_iduser || null);
                    request.input('packingStartedAt', sql.DateTime, batch.packing_started_at ? new Date(batch.packing_started_at) : null);
                    request.input('closedAt', sql.DateTime, batch.closed_at ? new Date(batch.closed_at) : null);
                    request.input('status', sql.NVarChar, batch.status || 'open');
                    request.input('warehouseId', sql.Int, batch.idwarehouse || null);
                    request.input('totalProducts', sql.Int, batch.total_products || 0);
                    request.input('totalPicklists', sql.Int, batch.total_picklists || 0);
                    request.input('notes', sql.NVarChar, batch.notes || null);
                    request.input('lastSyncDate', sql.DateTime, new Date());
                    
                    if (checkResult.recordset.length > 0) {
                        // Update existing batch
                        const batchId = checkResult.recordset[0].id;
                        request.input('batchId', sql.Int, batchId);
                        
                        await request.query(`
                            UPDATE Batches
                            SET 
                                batch_number = @batchNumber,
                                created_at = @createdAt,
                                assigned_to_iduser = @assignedToIduser,
                                picking_started_at = @pickingStartedAt,
                                picking_completed_at = @pickingCompletedAt,
                                closed_by_iduser = @closedByIduser,
                                packing_started_at = @packingStartedAt,
                                closed_at = @closedAt,
                                status = @status,
                                warehouse_id = @warehouseId,
                                total_products = @totalProducts,
                                total_picklists = @totalPicklists,
                                notes = @notes,
                                last_sync_date = @lastSyncDate
                            WHERE id = @batchId
                        `);
                    } else {
                        // Insert new batch
                        const insertResult = await request.query(`
                            INSERT INTO Batches (
                                idbatch,
                                batch_number,
                                created_at,
                                assigned_to_iduser,
                                picking_started_at,
                                picking_completed_at,
                                closed_by_iduser,
                                packing_started_at,
                                closed_at,
                                status,
                                warehouse_id,
                                total_products,
                                total_picklists,
                                notes,
                                last_sync_date
                            )
                            VALUES (
                                @idbatch,
                                @batchNumber,
                                @createdAt,
                                @assignedToIduser,
                                @pickingStartedAt,
                                @pickingCompletedAt,
                                @closedByIduser,
                                @packingStartedAt,
                                @closedAt,
                                @status,
                                @warehouseId,
                                @totalProducts,
                                @totalPicklists,
                                @notes,
                                @lastSyncDate
                            );
                            SELECT SCOPE_IDENTITY() AS id;
                        `);
                    }
                    
                    // Update picklists with batch relationship if available
                    if (batch.picklists && batch.picklists.length > 0) {
                        for (const picklistId of batch.picklists) {
                            await new sql.Request(transaction)
                                .input('picklistId', sql.Int, picklistId)
                                .input('batchId', sql.Int, checkResult.recordset.length > 0 ? 
                                    checkResult.recordset[0].id : insertResult.recordset[0].id)
                                .query(`
                                    UPDATE Picklists
                                    SET idpicklist_batch = @batchId
                                    WHERE idpicklist = @picklistId
                                `);
                        }
                    }
                    
                    savedCount++;
                }
                
                // Commit the transaction
                await transaction.commit();
                console.log(`Successfully saved ${savedCount} batches to database`);
                return savedCount;
            } catch (error) {
                // Rollback the transaction on error
                await transaction.rollback();
                console.error('Error in batch save transaction:', error);
                throw error;
            }
        } catch (error) {
            console.error('Error saving batches to database:', error);
            throw error;
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
            
            // Get the last sync date (only used for incremental sync)
            const lastSyncDate = fullSync ? null : await this.getLastBatchesSyncDate();
            if (!fullSync) {
                console.log(`Last batch sync date: ${lastSyncDate}`);
            }
            
            // Get batches from Picqer
            const batches = await this.getBatchesFromPicqer(fullSync ? null : lastSyncDate);
            
            if (batches.length === 0) {
                console.log('No new batches to sync');
                await this.updateBatchesSyncStatus(new Date(), 'success', { total_count: 0, processed_count: 0 });
                return {
                    success: true,
                    message: 'No new batches to sync',
                    count: 0
                };
            }
            
            console.log(`Retrieved ${batches.length} batches from Picqer API`);
            
            // Update sync status to in progress
            await this.updateBatchesSyncStatus(new Date(), 'in_progress', { total_count: batches.length, processed_count: 0 });
            
            // Save batches to database
            const savedCount = await this.saveBatchesToDatabase(batches);
            
            // Update sync status to success
            await this.updateBatchesSyncStatus(new Date(), 'success', { total_count: batches.length, processed_count: savedCount });
            
            console.log(`Batch sync completed successfully. Saved ${savedCount} batches.`);
            return {
                success: true,
                message: `Batch sync completed successfully. Saved ${savedCount} batches.`,
                count: savedCount
            };
        } catch (error) {
            console.error('Error syncing batches:', error);
            
            // Update sync status to error
            await this.updateBatchesSyncStatus(new Date(), 'error', {}, error.message);
            
            return {
                success: false,
                message: `Error syncing batches: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Get the count of batches in the database
     * @returns {Promise<number>} - Count of batches
     */
    async getBatchCount() {
        try {
            const pool = await this.getPool();
            
            // Check if the Batches table exists
            const tableExists = await pool.request().query(`
                SELECT CASE WHEN EXISTS (
                    SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Batches'
                ) THEN 1 ELSE 0 END AS table_exists
            `);
            
            if (tableExists.recordset[0].table_exists === 0) {
                return 0;
            }
            
            // Get count of batches
            const result = await pool.request().query(`
                SELECT COUNT(*) AS count FROM Batches
            `);
            
            return result.recordset[0].count;
        } catch (error) {
            console.error('Error getting batch count:', error);
            return 0;
        }
    }

    /**
     * Test the connection to the Picqer API
     * @returns {Promise<boolean>} - True if connection is successful
     */
    async testConnection() {
        try {
            const url = `${this.baseUrl}/batches?limit=1`;
            
            const response = await axios.get(url, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Picqer Middleware',
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });
            
            return response.status === 200;
        } catch (error) {
            console.error('Error testing connection to Picqer API:', error.message);
            return false;
        }
    }
}

module.exports = BatchService;
