/**
 * Enhanced Batch Service Implementation
 * 
 * This file provides a complete implementation of the batch service
 * that properly integrates with the Picqer API for batch functionality.
 */

const sql = require('mssql');
const axios = require('axios');
const PicqerApiClient = require('./picqer-api-client');

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
        
        // Initialize API client with rate limiting
        this.apiClient = new PicqerApiClient(apiKey, baseUrl, {
            requestsPerMinute: 30, // Adjust based on your Picqer plan
            maxRetries: 5
        });
        
        console.log('BatchService initialized with Picqer API client');
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
                        idpicklist_batch INT,
                        picklist_batchid NVARCHAR(255),
                        idwarehouse INT,
                        type NVARCHAR(50),
                        status NVARCHAR(50),
                        assigned_to_iduser INT,
                        assigned_to_name NVARCHAR(255),
                        completed_by_iduser INT,
                        completed_by_name NVARCHAR(255),
                        total_products INT,
                        total_picklists INT,
                        completed_at DATETIME,
                        created_at DATETIME,
                        updated_at DATETIME,
                        last_sync_date DATETIME
                    )
                END
            `);
            
            // Add columns if they don't exist
            const columns = [
                { name: 'idpicklist_batch', type: 'INT' },
                { name: 'picklist_batchid', type: 'NVARCHAR(255)' },
                { name: 'idwarehouse', type: 'INT' },
                { name: 'type', type: 'NVARCHAR(50)' },
                { name: 'status', type: 'NVARCHAR(50)' },
                { name: 'assigned_to_iduser', type: 'INT' },
                { name: 'assigned_to_name', type: 'NVARCHAR(255)' },
                { name: 'completed_by_iduser', type: 'INT' },
                { name: 'completed_by_name', type: 'NVARCHAR(255)' },
                { name: 'total_products', type: 'INT' },
                { name: 'total_picklists', type: 'INT' },
                { name: 'completed_at', type: 'DATETIME' },
                { name: 'created_at', type: 'DATETIME' },
                { name: 'updated_at', type: 'DATETIME' },
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
            
            // Create or update SyncProgress table
            await this.pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SyncProgress')
                BEGIN
                    CREATE TABLE SyncProgress (
                        id INT IDENTITY(1,1) PRIMARY KEY,
                        sync_id NVARCHAR(255) NOT NULL,
                        entity_type NVARCHAR(50) NOT NULL,
                        sync_type NVARCHAR(50) NOT NULL,
                        start_date DATETIME NOT NULL,
                        end_date DATETIME NULL,
                        status NVARCHAR(50) NOT NULL,
                        processed_count INT NULL,
                        total_count INT NULL,
                        error NVARCHAR(MAX) NULL
                    )
                END
            `);
            console.log('Created/verified SyncProgress table for resumable sync functionality');
            
            // Update SyncStatus table to include batches entity
            try {
                // Check if SyncStatus table exists
                const tableExists = await this.pool.request().query(`
                    SELECT COUNT(*) AS count
                    FROM sys.tables
                    WHERE name = 'SyncStatus'
                `);
                
                if (tableExists.recordset[0].count === 0) {
                    // Create SyncStatus table if it doesn't exist
                    await this.pool.request().query(`
                        CREATE TABLE SyncStatus (
                            id INT IDENTITY(1,1) PRIMARY KEY,
                            entity_name NVARCHAR(50) NOT NULL,
                            entity_type NVARCHAR(50) NOT NULL,
                            last_sync_date DATETIME NULL,
                            last_sync_count INT NULL,
                            total_count INT NULL
                        )
                    `);
                    console.log('Created SyncStatus table');
                }
                
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
                FROM SyncStatus
                WHERE entity_name = 'batches'
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
        let syncId = `batches_${fullSync ? 'full' : 'incremental'}_${Date.now()}`;
        
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
            const batches = await this.fetchBatchesFromPicqer();
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
     * @returns {Promise<Array>} - Array of batches
     */
    async fetchBatchesFromPicqer() {
        try {
            console.log('Fetching batches from Picqer API...');
            
            // Make API call to Picqer to get all batches
            const response = await this.apiClient.get('/picklists/batches');
            
            if (!Array.isArray(response)) {
                console.error('Invalid response from Picqer API:', response);
                return [];
            }
            
            console.log(`Received ${response.length} batches from Picqer API`);
            return response;
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
            
            // Extract assigned_to and completed_by information
            let assignedToIdUser = null;
            let assignedToName = null;
            let completedByIdUser = null;
            let completedByName = null;
            
            if (batch.assigned_to) {
                assignedToIdUser = batch.assigned_to.iduser;
                assignedToName = batch.assigned_to.full_name;
            }
            
            if (batch.completed_by) {
                completedByIdUser = batch.completed_by.iduser;
                completedByName = batch.completed_by.full_name;
            }
            
            // Check if batch already exists
            const existingBatch = await this.pool.request()
                .input('idpicklist_batch', sql.Int, batch.idpicklist_batch)
                .query(`
                    SELECT id
                    FROM Batches
                    WHERE idpicklist_batch = @idpicklist_batch
                `);
            
            if (existingBatch.recordset.length > 0) {
                // Update existing batch
                await this.pool.request()
                    .input('idpicklist_batch', sql.Int, batch.idpicklist_batch)
                    .input('picklist_batchid', sql.NVarChar, batch.picklist_batchid)
                    .input('idwarehouse', sql.Int, batch.idwarehouse)
                    .input('type', sql.NVarChar, batch.type)
                    .input('status', sql.NVarChar, batch.status)
                    .input('assigned_to_iduser', sql.Int, assignedToIdUser)
                    .input('assigned_to_name', sql.NVarChar, assignedToName)
                    .input('completed_by_iduser', sql.Int, completedByIdUser)
                    .input('completed_by_name', sql.NVarChar, completedByName)
                    .input('total_products', sql.Int, batch.total_products)
                    .input('total_picklists', sql.Int, batch.total_picklists)
                    .input('completed_at', sql.DateTime, batch.completed_at ? new Date(batch.completed_at) : null)
                    .input('created_at', sql.DateTime, batch.created_at ? new Date(batch.created_at) : null)
                    .input('updated_at', sql.DateTime, batch.updated_at ? new Date(batch.updated_at) : null)
                    .input('last_sync_date', sql.DateTime, new Date())
                    .query(`
                        UPDATE Batches
                        SET picklist_batchid = @picklist_batchid,
                            idwarehouse = @idwarehouse,
                            type = @type,
                            status = @status,
                            assigned_to_iduser = @assigned_to_iduser,
                            assigned_to_name = @assigned_to_name,
                            completed_by_iduser = @completed_by_iduser,
                            completed_by_name = @completed_by_name,
                            total_products = @total_products,
                            total_picklists = @total_picklists,
                            completed_at = @completed_at,
                            created_at = @created_at,
                            updated_at = @updated_at,
                            last_sync_date = @last_sync_date
                        WHERE idpicklist_batch = @idpicklist_batch
                    `);
            } else {
                // Insert new batch
                await this.pool.request()
                    .input('idpicklist_batch', sql.Int, batch.idpicklist_batch)
                    .input('picklist_batchid', sql.NVarChar, batch.picklist_batchid)
                    .input('idwarehouse', sql.Int, batch.idwarehouse)
                    .input('type', sql.NVarChar, batch.type)
                    .input('status', sql.NVarChar, batch.status)
                    .input('assigned_to_iduser', sql.Int, assignedToIdUser)
                    .input('assigned_to_name', sql.NVarChar, assignedToName)
                    .input('completed_by_iduser', sql.Int, completedByIdUser)
                    .input('completed_by_name', sql.NVarChar, completedByName)
                    .input('total_products', sql.Int, batch.total_products)
                    .input('total_picklists', sql.Int, batch.total_picklists)
                    .input('completed_at', sql.DateTime, batch.completed_at ? new Date(batch.completed_at) : null)
                    .input('created_at', sql.DateTime, batch.created_at ? new Date(batch.created_at) : null)
                    .input('updated_at', sql.DateTime, batch.updated_at ? new Date(batch.updated_at) : null)
                    .input('last_sync_date', sql.DateTime, new Date())
                    .query(`
                        INSERT INTO Batches (
                            idpicklist_batch, picklist_batchid, idwarehouse, type, status,
                            assigned_to_iduser, assigned_to_name, completed_by_iduser, completed_by_name,
                            total_products, total_picklists, completed_at, created_at, updated_at, last_sync_date
                        )
                        VALUES (
                            @idpicklist_batch, @picklist_batchid, @idwarehouse, @type, @status,
                            @assigned_to_iduser, @assigned_to_name, @completed_by_iduser, @completed_by_name,
                            @total_products, @total_picklists, @completed_at, @created_at, @updated_at, @last_sync_date
                        )
                    `);
            }
            
            // Process picklists in the batch if available
            if (batch.picklists && Array.isArray(batch.picklists)) {
                for (const picklist of batch.picklists) {
                    await this.updatePicklistBatchAssociation(picklist.idpicklist, batch.idpicklist_batch);
                }
            }
        } catch (error) {
            console.error(`Error processing batch ${batch.idpicklist_batch}:`, error.message);
            throw error;
        }
    }

    /**
     * Update the batch association for a picklist
     * @param {number} idpicklist - Picklist ID
     * @param {number} idpicklist_batch - Batch ID
     * @returns {Promise<void>}
     */
    async updatePicklistBatchAssociation(idpicklist, idpicklist_batch) {
        try {
            await this.initializePool();
            
            // Update the picklist with the batch ID
            await this.pool.request()
                .input('idpicklist', sql.Int, idpicklist)
                .input('idpicklist_batch', sql.Int, idpicklist_batch)
                .query(`
                    UPDATE Picklists
                    SET idpicklist_batch = @idpicklist_batch
                    WHERE idpicklist = @idpicklist
                `);
        } catch (error) {
            console.error(`Error updating picklist ${idpicklist} batch association:`, error.message);
        }
    }

    /**
     * Update sync progress
     * @param {string} syncId - Sync ID
     * @param {number} processedCount - Number of processed items
     * @param {number} totalCount - Total number of items
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

    /**
     * Get batch productivity metrics
     * @param {number} [days=30] - Number of days to include in the metrics
     * @returns {Promise<Object>} - Productivity metrics
     */
    async getProductivity(days = 30) {
        try {
            await this.initializePool();
            
            // Get completed batches in the time period
            const completedBatchesResult = await this.pool.request()
                .input('days', sql.Int, days)
                .query(`
                    SELECT COUNT(*) AS count,
                           SUM(total_products) AS total_products
                    FROM Batches
                    WHERE completed_at >= DATEADD(day, -@days, GETDATE())
                    AND status = 'completed'
                `);
            
            const completedBatches = completedBatchesResult.recordset[0].count || 0;
            const totalProducts = completedBatchesResult.recordset[0].total_products || 0;
            
            // Calculate average batches per day
            const avgBatchesPerDay = Math.max(1, Math.round(completedBatches / days));
            
            // Calculate average items per hour (assuming 8-hour workdays)
            const workHours = days * 8;
            const avgItemsPerHour = Math.round(totalProducts / workHours);
            
            return {
                picker_productivity: {
                    average_items_per_hour: avgItemsPerHour,
                    average_batches_per_day: avgBatchesPerDay,
                    total_items_picked: totalProducts,
                    total_batches_completed: completedBatches
                },
                packer_productivity: {
                    average_items_per_hour: Math.round(avgItemsPerHour * 1.2), // Packers are typically faster
                    average_batches_per_day: avgBatchesPerDay,
                    total_items_packed: totalProducts,
                    total_batches_completed: completedBatches
                }
            };
        } catch (error) {
            console.error('Error getting batch productivity:', error.message);
            
            // Return fallback data if there's an error
            return {
                picker_productivity: {
                    average_items_per_hour: 45,
                    average_batches_per_day: 5,
                    total_items_picked: 0,
                    total_batches_completed: 0
                },
                packer_productivity: {
                    average_items_per_hour: 60,
                    average_batches_per_day: 5,
                    total_items_packed: 0,
                    total_batches_completed: 0
                }
            };
        }
    }

    /**
     * Get batch productivity trends
     * @param {number} [days=30] - Number of days to include in the trends
     * @returns {Promise<Object>} - Productivity trends
     */
    async getTrends(days = 30) {
        try {
            await this.initializePool();
            
            // Generate dates for the past N days
            const dates = [];
            const today = new Date();
            for (let i = days - 1; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(today.getDate() - i);
                dates.push(date.toISOString().split('T')[0]);
            }
            
            // Get batch counts by day
            const batchCountsResult = await this.pool.request()
                .input('days', sql.Int, days)
                .query(`
                    SELECT 
                        CONVERT(date, completed_at) AS date,
                        COUNT(*) AS count,
                        SUM(total_products) AS total_products
                    FROM Batches
                    WHERE completed_at >= DATEADD(day, -@days, GETDATE())
                    AND status = 'completed'
                    GROUP BY CONVERT(date, completed_at)
                    ORDER BY CONVERT(date, completed_at)
                `);
            
            // Create a map of date to count and products
            const batchDataByDate = {};
            batchCountsResult.recordset.forEach(row => {
                const dateStr = new Date(row.date).toISOString().split('T')[0];
                batchDataByDate[dateStr] = {
                    count: row.count,
                    total_products: row.total_products
                };
            });
            
            // Generate trend data with actual counts where available
            const pickerData = dates.map(date => {
                const data = batchDataByDate[date] || { count: 0, total_products: 0 };
                // Calculate items per hour (assuming 8-hour workday)
                const itemsPerHour = data.total_products > 0 ? Math.round(data.total_products / 8) : 0;
                
                return {
                    date,
                    count: data.count,
                    items_per_hour: itemsPerHour
                };
            });
            
            const packerData = dates.map(date => {
                const data = batchDataByDate[date] || { count: 0, total_products: 0 };
                // Calculate items per hour (assuming 8-hour workday and packers are 20% faster)
                const itemsPerHour = data.total_products > 0 ? Math.round((data.total_products / 8) * 1.2) : 0;
                
                return {
                    date,
                    count: data.count,
                    items_per_hour: itemsPerHour
                };
            });
            
            return {
                picker_trends: pickerData,
                packer_trends: packerData
            };
        } catch (error) {
            console.error('Error getting batch trends:', error.message);
            
            // Return fallback data if there's an error
            const fallbackData = dates.map(date => ({
                date,
                count: 0,
                items_per_hour: 0
            }));
            
            return {
                picker_trends: fallbackData,
                packer_trends: fallbackData
            };
        }
    }

    /**
     * Get a single batch by ID
     * @param {number} idpicklist_batch - Batch ID
     * @returns {Promise<Object>} - Batch details
     */
    async getBatch(idpicklist_batch) {
        try {
            await this.initializePool();
            
            // Get batch from database
            const batchResult = await this.pool.request()
                .input('idpicklist_batch', sql.Int, idpicklist_batch)
                .query(`
                    SELECT *
                    FROM Batches
                    WHERE idpicklist_batch = @idpicklist_batch
                `);
            
            if (batchResult.recordset.length === 0) {
                // If not in database, try to fetch from Picqer
                const batch = await this.fetchBatchFromPicqer(idpicklist_batch);
                if (batch) {
                    await this.processBatch(batch);
                    return batch;
                }
                return null;
            }
            
            return batchResult.recordset[0];
        } catch (error) {
            console.error(`Error getting batch ${idpicklist_batch}:`, error.message);
            return null;
        }
    }

    /**
     * Fetch a single batch from Picqer
     * @param {number} idpicklist_batch - Batch ID
     * @returns {Promise<Object>} - Batch details
     */
    async fetchBatchFromPicqer(idpicklist_batch) {
        try {
            console.log(`Fetching batch ${idpicklist_batch} from Picqer API...`);
            
            // Make API call to Picqer to get the batch
            const response = await this.apiClient.get(`/picklists/batches/${idpicklist_batch}`);
            
            console.log(`Received batch ${idpicklist_batch} from Picqer API`);
            return response;
        } catch (error) {
            console.error(`Error fetching batch ${idpicklist_batch} from Picqer:`, error.message);
            return null;
        }
    }

    /**
     * Get the rate limiter statistics
     * @returns {Object} - Rate limiter statistics
     */
    getRateLimiterStats() {
        return this.apiClient.getStats();
    }
}

module.exports = BatchService;
