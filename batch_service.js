/**
 * Enhanced Batch Service Implementation
 * 
 * This file provides a complete implementation of the batch service
 * that properly integrates with the Picqer API for batch functionality.
 */

const sql = require('mssql');
const PicqerApiClient = require('./updated-picqer-api-client');

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
                syncId,
                error: error.message,
                message: `Batch sync failed: ${error.message}`
            };
        }
    }

    /**
     * Update sync progress
     * @param {string} syncId - Sync ID
     * @param {number} processedCount - Number of processed batches
     * @param {number} totalCount - Total number of batches
     * @returns {Promise<void>}
     * @private
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
     * Fetch batches from Picqer API
     * @returns {Promise<Array>} - Array of batch objects
     * @private
     */
    async fetchBatchesFromPicqer() {
        try {
            // Get all batches from Picqer API
            const response = await this.apiClient.get('/picklistbatches');
            
            if (!response || !response.data) {
                console.error('Invalid response from Picqer API');
                return [];
            }
            
            return response.data;
        } catch (error) {
            console.error('Error fetching batches from Picqer:', error.message);
            throw error;
        }
    }

    /**
     * Process a batch from Picqer
     * @param {Object} batch - Batch object from Picqer
     * @returns {Promise<void>}
     * @private
     */
    async processBatch(batch) {
        try {
            await this.initializePool();
            
            // Check if batch already exists
            const existingBatch = await this.pool.request()
                .input('idpicklist_batch', sql.Int, batch.idpicklist_batch)
                .query(`
                    SELECT id
                    FROM Batches
                    WHERE idpicklist_batch = @idpicklist_batch
                `);
            
            const now = new Date();
            
            if (existingBatch.recordset.length > 0) {
                // Update existing batch
                await this.pool.request()
                    .input('idpicklist_batch', sql.Int, batch.idpicklist_batch)
                    .input('picklist_batchid', sql.NVarChar, batch.picklist_batchid)
                    .input('idwarehouse', sql.Int, batch.idwarehouse)
                    .input('type', sql.NVarChar, batch.type)
                    .input('status', sql.NVarChar, batch.status)
                    .input('assigned_to_iduser', sql.Int, batch.assigned_to_iduser)
                    .input('assigned_to_name', sql.NVarChar, batch.assigned_to_name)
                    .input('completed_by_iduser', sql.Int, batch.completed_by_iduser)
                    .input('completed_by_name', sql.NVarChar, batch.completed_by_name)
                    .input('total_products', sql.Int, batch.total_products)
                    .input('total_picklists', sql.Int, batch.total_picklists)
                    .input('completed_at', sql.DateTime, batch.completed_at ? new Date(batch.completed_at) : null)
                    .input('created_at', sql.DateTime, batch.created_at ? new Date(batch.created_at) : null)
                    .input('updated_at', sql.DateTime, batch.updated_at ? new Date(batch.updated_at) : null)
                    .input('last_sync_date', sql.DateTime, now)
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
                    .input('assigned_to_iduser', sql.Int, batch.assigned_to_iduser)
                    .input('assigned_to_name', sql.NVarChar, batch.assigned_to_name)
                    .input('completed_by_iduser', sql.Int, batch.completed_by_iduser)
                    .input('completed_by_name', sql.NVarChar, batch.completed_by_name)
                    .input('total_products', sql.Int, batch.total_products)
                    .input('total_picklists', sql.Int, batch.total_picklists)
                    .input('completed_at', sql.DateTime, batch.completed_at ? new Date(batch.completed_at) : null)
                    .input('created_at', sql.DateTime, batch.created_at ? new Date(batch.created_at) : null)
                    .input('updated_at', sql.DateTime, batch.updated_at ? new Date(batch.updated_at) : null)
                    .input('last_sync_date', sql.DateTime, now)
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
        } catch (error) {
            console.error(`Error processing batch ${batch.idpicklist_batch}:`, error.message);
            throw error;
        }
    }

    /**
     * Get all batches with pagination
     * @param {number} [page=1] - Page number
     * @param {number} [limit=20] - Number of batches per page
     * @param {string} [sortBy='created_at'] - Field to sort by
     * @param {string} [sortOrder='desc'] - Sort order ('asc' or 'desc')
     * @param {Object} [filters={}] - Filters to apply
     * @returns {Promise<Object>} - Paginated batches
     */
    async getBatches(page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc', filters = {}) {
        try {
            await this.initializePool();
            
            // Calculate offset
            const offset = (page - 1) * limit;
            
            // Build WHERE clause for filters
            let whereClause = '';
            const filterParams = [];
            
            if (filters.status) {
                whereClause += `${whereClause ? ' AND ' : ' WHERE '} status = @status`;
                filterParams.push({ name: 'status', value: filters.status, type: sql.NVarChar });
            }
            
            if (filters.type) {
                whereClause += `${whereClause ? ' AND ' : ' WHERE '} type = @type`;
                filterParams.push({ name: 'type', value: filters.type, type: sql.NVarChar });
            }
            
            if (filters.assigned_to_iduser) {
                whereClause += `${whereClause ? ' AND ' : ' WHERE '} assigned_to_iduser = @assigned_to_iduser`;
                filterParams.push({ name: 'assigned_to_iduser', value: filters.assigned_to_iduser, type: sql.Int });
            }
            
            // Build query
            let query = `
                SELECT *
                FROM Batches
                ${whereClause}
                ORDER BY ${sortBy} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}
                OFFSET ${offset} ROWS
                FETCH NEXT ${limit} ROWS ONLY
            `;
            
            // Build count query
            let countQuery = `
                SELECT COUNT(*) AS total
                FROM Batches
                ${whereClause}
            `;
            
            // Create request
            let request = this.pool.request();
            
            // Add filter parameters
            for (const param of filterParams) {
                request.input(param.name, param.type, param.value);
            }
            
            // Execute queries
            const [batches, count] = await Promise.all([
                request.query(query),
                request.query(countQuery)
            ]);
            
            // Calculate pagination info
            const total = count.recordset[0].total;
            const totalPages = Math.ceil(total / limit);
            
            return {
                data: batches.recordset,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                }
            };
        } catch (error) {
            console.error('Error getting batches:', error.message);
            throw error;
        }
    }

    /**
     * Get a batch by ID
     * @param {number} id - Batch ID
     * @returns {Promise<Object>} - Batch object
     */
    async getBatchById(id) {
        try {
            await this.initializePool();
            
            const result = await this.pool.request()
                .input('id', sql.Int, id)
                .query(`
                    SELECT *
                    FROM Batches
                    WHERE id = @id
                `);
            
            if (result.recordset.length === 0) {
                throw new Error(`Batch with ID ${id} not found`);
            }
            
            return result.recordset[0];
        } catch (error) {
            console.error(`Error getting batch with ID ${id}:`, error.message);
            throw error;
        }
    }

    /**
     * Get batch productivity metrics
     * @returns {Promise<Object>} - Productivity metrics
     */
    async getProductivityMetrics() {
        try {
            await this.initializePool();
            
            // Get picker productivity
            const pickerResult = await this.pool.request().query(`
                SELECT 
                    assigned_to_name AS name,
                    assigned_to_iduser AS id,
                    COUNT(*) AS total_batches,
                    SUM(total_products) AS total_products,
                    SUM(total_picklists) AS total_picklists,
                    AVG(DATEDIFF(MINUTE, created_at, completed_at)) AS avg_completion_time_minutes
                FROM Batches
                WHERE 
                    assigned_to_iduser IS NOT NULL
                    AND completed_at IS NOT NULL
                    AND type = 'pick'
                GROUP BY assigned_to_name, assigned_to_iduser
                ORDER BY total_products DESC
            `);
            
            // Get packer productivity
            const packerResult = await this.pool.request().query(`
                SELECT 
                    assigned_to_name AS name,
                    assigned_to_iduser AS id,
                    COUNT(*) AS total_batches,
                    SUM(total_products) AS total_products,
                    SUM(total_picklists) AS total_picklists,
                    AVG(DATEDIFF(MINUTE, created_at, completed_at)) AS avg_completion_time_minutes
                FROM Batches
                WHERE 
                    assigned_to_iduser IS NOT NULL
                    AND completed_at IS NOT NULL
                    AND type = 'pack'
                GROUP BY assigned_to_name, assigned_to_iduser
                ORDER BY total_products DESC
            `);
            
            // Get overall metrics
            const overallResult = await this.pool.request().query(`
                SELECT 
                    COUNT(*) AS total_batches,
                    SUM(total_products) AS total_products,
                    SUM(total_picklists) AS total_picklists,
                    AVG(DATEDIFF(MINUTE, created_at, completed_at)) AS avg_completion_time_minutes
                FROM Batches
                WHERE completed_at IS NOT NULL
            `);
            
            return {
                pickers: pickerResult.recordset,
                packers: packerResult.recordset,
                overall: overallResult.recordset[0]
            };
        } catch (error) {
            console.error('Error getting productivity metrics:', error.message);
            
            // Return fallback data if there's an error
            return {
                pickers: [],
                packers: [],
                overall: {
                    total_batches: 0,
                    total_products: 0,
                    total_picklists: 0,
                    avg_completion_time_minutes: 0
                }
            };
        }
    }

    /**
     * Get productivity trends over time
     * @param {string} [period='day'] - Time period ('day', 'week', 'month')
     * @param {number} [limit=30] - Number of periods to return
     * @returns {Promise<Object>} - Productivity trends
     */
    async getProductivityTrends(period = 'day', limit = 30) {
        try {
            await this.initializePool();
            
            // Determine date format based on period
            let dateFormat;
            let dateGroup;
            
            switch (period) {
                case 'week':
                    dateFormat = 'YYYY-WW';
                    dateGroup = "FORMAT(created_at, 'yyyy-') + 'W' + FORMAT(DATEPART(week, created_at), '00')";
                    break;
                case 'month':
                    dateFormat = 'YYYY-MM';
                    dateGroup = "FORMAT(created_at, 'yyyy-MM')";
                    break;
                case 'day':
                default:
                    dateFormat = 'YYYY-MM-DD';
                    dateGroup = "FORMAT(created_at, 'yyyy-MM-dd')";
                    break;
            }
            
            // Get picker trends
            const pickerResult = await this.pool.request().query(`
                SELECT 
                    ${dateGroup} AS period,
                    COUNT(*) AS total_batches,
                    SUM(total_products) AS total_products,
                    SUM(total_picklists) AS total_picklists,
                    AVG(DATEDIFF(MINUTE, created_at, completed_at)) AS avg_completion_time_minutes
                FROM Batches
                WHERE 
                    completed_at IS NOT NULL
                    AND type = 'pick'
                    AND created_at >= DATEADD(${period}, -${limit}, GETDATE())
                GROUP BY ${dateGroup}
                ORDER BY ${dateGroup} DESC
            `);
            
            // Get packer trends
            const packerResult = await this.pool.request().query(`
                SELECT 
                    ${dateGroup} AS period,
                    COUNT(*) AS total_batches,
                    SUM(total_products) AS total_products,
                    SUM(total_picklists) AS total_picklists,
                    AVG(DATEDIFF(MINUTE, created_at, completed_at)) AS avg_completion_time_minutes
                FROM Batches
                WHERE 
                    completed_at IS NOT NULL
                    AND type = 'pack'
                    AND created_at >= DATEADD(${period}, -${limit}, GETDATE())
                GROUP BY ${dateGroup}
                ORDER BY ${dateGroup} DESC
            `);
            
            return {
                period,
                pickers: pickerResult.recordset,
                packers: packerResult.recordset
            };
        } catch (error) {
            console.error('Error getting productivity trends:', error.message);
            
            // Return fallback data if there's an error
            return {
                period,
                pickers: [],
                packers: []
            };
        }
    }
}

module.exports = BatchService;
