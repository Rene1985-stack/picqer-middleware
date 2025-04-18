/**
 * Fixed Batch Productivity Tracker with Users Table Schema Compatibility
 * 
 * This version of the batch productivity tracker handles the missing 'name' column
 * in the Users table by using CONCAT(firstname, ' ', lastname) or other available name fields.
 */
const sql = require('mssql');
const { SchemaManager } = require('./schema_manager');

class BatchProductivityTracker {
    /**
     * Initialize the BatchProductivityTracker
     * @param {sql.ConnectionPool} pool - SQL connection pool
     */
    constructor(pool) {
        this.pool = pool;
        this.schemaManager = new SchemaManager(pool);
    }

    /**
     * Ensure the Users table has the necessary columns or computed columns
     * @returns {Promise<boolean>} - True if the table is ready
     */
    async ensureUsersTableReady() {
        try {
            console.log('Ensuring Users table is ready for productivity tracking...');
            
            // First, ensure the Users table exists with basic columns
            await this.schemaManager.ensureTableExists('Users', {
                id: { type: 'INT', primaryKey: true, identity: true },
                iduser: { type: 'INT', nullable: false },
                username: { type: 'NVARCHAR(100)', nullable: false },
                firstname: { type: 'NVARCHAR(100)', nullable: true },
                lastname: { type: 'NVARCHAR(100)', nullable: true },
                first_name: { type: 'NVARCHAR(100)', nullable: true },
                last_name: { type: 'NVARCHAR(100)', nullable: true },
                active: { type: 'BIT', nullable: false, defaultValue: '1' }
            });
            
            // Check if the name column exists
            const nameColumnExists = await this.pool.request()
                .query(`
                    IF EXISTS (
                        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
                        WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'name'
                    )
                    SELECT 1 AS column_exists
                    ELSE
                    SELECT 0 AS column_exists
                `);
            
            if (nameColumnExists.recordset[0].column_exists === 0) {
                console.log('Adding name computed column to Users table...');
                
                // Add a computed column for name that concatenates firstname and lastname
                await this.pool.request()
                    .query(`
                        ALTER TABLE Users
                        ADD name AS 
                        CASE
                            WHEN firstname IS NOT NULL AND lastname IS NOT NULL THEN CONCAT(firstname, ' ', lastname)
                            WHEN first_name IS NOT NULL AND last_name IS NOT NULL THEN CONCAT(first_name, ' ', last_name)
                            WHEN firstname IS NOT NULL THEN firstname
                            WHEN first_name IS NOT NULL THEN first_name
                            WHEN lastname IS NOT NULL THEN lastname
                            WHEN last_name IS NOT NULL THEN last_name
                            ELSE username
                        END PERSISTED;
                    `);
                
                console.log('Added name computed column to Users table.');
            } else {
                console.log('name column already exists in Users table.');
            }
            
            return true;
        } catch (error) {
            console.error('Error ensuring Users table is ready:', error);
            throw error;
        }
    }

    /**
     * Get picker productivity metrics
     * @param {Date} startDate - Start date for analysis
     * @param {Date} endDate - End date for analysis
     * @param {number} [userId] - Optional user ID to filter by specific picker
     * @returns {Promise<Array>} - Array of picker productivity metrics
     */
    async getPickerProductivity(startDate, endDate, userId = null) {
        try {
            console.log(`Getting picker productivity from ${startDate} to ${endDate}${userId ? ` for user ${userId}` : ''}...`);
            
            // Ensure the Users table has the name column
            await this.ensureUsersTableReady();
            
            const request = this.pool.request()
                .input('startDate', sql.DateTime, startDate)
                .input('endDate', sql.DateTime, endDate);
                
            if (userId) {
                request.input('userId', sql.Int, userId);
            }
            
            const query = `
                SELECT 
                    u.id AS user_id,
                    u.name AS user_name,
                    COUNT(DISTINCT b.id) AS total_batches,
                    SUM(b.total_products) AS total_products,
                    SUM(DATEDIFF(MINUTE, b.picking_started_at, b.picking_completed_at)) AS total_picking_minutes,
                    CAST(
                        CASE 
                            WHEN SUM(DATEDIFF(MINUTE, b.picking_started_at, b.picking_completed_at)) > 0 
                            THEN (SUM(b.total_products) * 60.0) / SUM(DATEDIFF(MINUTE, b.picking_started_at, b.picking_completed_at))
                            ELSE 0 
                        END AS DECIMAL(10,2)
                    ) AS products_per_hour,
                    CAST(
                        CASE 
                            WHEN SUM(DATEDIFF(MINUTE, b.picking_started_at, b.picking_completed_at)) > 0 
                            THEN (COUNT(DISTINCT b.id) * 60.0) / SUM(DATEDIFF(MINUTE, b.picking_started_at, b.picking_completed_at))
                            ELSE 0 
                        END AS DECIMAL(10,2)
                    ) AS batches_per_hour,
                    MIN(DATEDIFF(MINUTE, b.picking_started_at, b.picking_completed_at)) AS min_picking_minutes,
                    MAX(DATEDIFF(MINUTE, b.picking_started_at, b.picking_completed_at)) AS max_picking_minutes,
                    CAST(
                        AVG(DATEDIFF(MINUTE, b.picking_started_at, b.picking_completed_at)) AS DECIMAL(10,2)
                    ) AS avg_picking_minutes
                FROM Batches b
                JOIN Users u ON b.assigned_to_iduser = u.id
                WHERE 
                    b.picking_started_at IS NOT NULL 
                    AND b.picking_completed_at IS NOT NULL
                    AND b.picking_started_at >= @startDate
                    AND b.picking_completed_at <= @endDate
                    ${userId ? 'AND u.id = @userId' : ''}
                GROUP BY u.id, u.name
                ORDER BY products_per_hour DESC
            `;
            
            const result = await request.query(query);
            return result.recordset;
        } catch (error) {
            console.error('Error getting picker productivity:', error);
            throw error;
        }
    }

    /**
     * Get packer productivity metrics
     * @param {Date} startDate - Start date for analysis
     * @param {Date} endDate - End date for analysis
     * @param {number} [userId] - Optional user ID to filter by specific packer
     * @returns {Promise<Array>} - Array of packer productivity metrics
     */
    async getPackerProductivity(startDate, endDate, userId = null) {
        try {
            console.log(`Getting packer productivity from ${startDate} to ${endDate}${userId ? ` for user ${userId}` : ''}...`);
            
            // Ensure the Users table has the name column
            await this.ensureUsersTableReady();
            
            const request = this.pool.request()
                .input('startDate', sql.DateTime, startDate)
                .input('endDate', sql.DateTime, endDate);
                
            if (userId) {
                request.input('userId', sql.Int, userId);
            }
            
            const query = `
                SELECT 
                    u.id AS user_id,
                    u.name AS user_name,
                    COUNT(DISTINCT b.id) AS total_batches,
                    SUM(b.total_products) AS total_products,
                    SUM(DATEDIFF(MINUTE, b.packing_started_at, b.closed_at)) AS total_packing_minutes,
                    CAST(
                        CASE 
                            WHEN SUM(DATEDIFF(MINUTE, b.packing_started_at, b.closed_at)) > 0 
                            THEN (SUM(b.total_products) * 60.0) / SUM(DATEDIFF(MINUTE, b.packing_started_at, b.closed_at))
                            ELSE 0 
                        END AS DECIMAL(10,2)
                    ) AS products_per_hour,
                    CAST(
                        CASE 
                            WHEN SUM(DATEDIFF(MINUTE, b.packing_started_at, b.closed_at)) > 0 
                            THEN (COUNT(DISTINCT b.id) * 60.0) / SUM(DATEDIFF(MINUTE, b.packing_started_at, b.closed_at))
                            ELSE 0 
                        END AS DECIMAL(10,2)
                    ) AS batches_per_hour,
                    MIN(DATEDIFF(MINUTE, b.packing_started_at, b.closed_at)) AS min_packing_minutes,
                    MAX(DATEDIFF(MINUTE, b.packing_started_at, b.closed_at)) AS max_packing_minutes,
                    CAST(
                        AVG(DATEDIFF(MINUTE, b.packing_started_at, b.closed_at)) AS DECIMAL(10,2)
                    ) AS avg_packing_minutes
                FROM Batches b
                JOIN Users u ON b.closed_by_iduser = u.id
                WHERE 
                    b.packing_started_at IS NOT NULL 
                    AND b.closed_at IS NOT NULL
                    AND b.packing_started_at >= @startDate
                    AND b.closed_at <= @endDate
                    ${userId ? 'AND u.id = @userId' : ''}
                GROUP BY u.id, u.name
                ORDER BY products_per_hour DESC
            `;
            
            const result = await request.query(query);
            return result.recordset;
        } catch (error) {
            console.error('Error getting packer productivity:', error);
            throw error;
        }
    }

    /**
     * Get daily productivity trends for pickers and packers
     * @param {Date} startDate - Start date for analysis
     * @param {Date} endDate - End date for analysis
     * @returns {Promise<Object>} - Daily productivity trends
     */
    async getDailyProductivityTrends(startDate, endDate) {
        try {
            console.log(`Getting daily productivity trends from ${startDate} to ${endDate}...`);
            
            // Ensure the Users table has the name column
            await this.ensureUsersTableReady();
            
            // Get daily picker productivity
            const pickerTrends = await this.pool.request()
                .input('startDate', sql.DateTime, startDate)
                .input('endDate', sql.DateTime, endDate)
                .query(`
                    SELECT 
                        CAST(b.picking_started_at AS DATE) AS work_date,
                        COUNT(DISTINCT u.id) AS unique_pickers,
                        COUNT(DISTINCT b.id) AS total_batches,
                        SUM(b.total_products) AS total_products,
                        SUM(DATEDIFF(MINUTE, b.picking_started_at, b.picking_completed_at)) AS total_picking_minutes,
                        CAST(
                            CASE 
                                WHEN SUM(DATEDIFF(MINUTE, b.picking_started_at, b.picking_completed_at)) > 0 
                                THEN (SUM(b.total_products) * 60.0) / SUM(DATEDIFF(MINUTE, b.picking_started_at, b.picking_completed_at))
                                ELSE 0 
                            END AS DECIMAL(10,2)
                        ) AS products_per_hour
                    FROM Batches b
                    JOIN Users u ON b.assigned_to_iduser = u.id
                    WHERE 
                        b.picking_started_at IS NOT NULL 
                        AND b.picking_completed_at IS NOT NULL
                        AND b.picking_started_at >= @startDate
                        AND b.picking_completed_at <= @endDate
                    GROUP BY CAST(b.picking_started_at AS DATE)
                    ORDER BY work_date
                `);
            
            // Get daily packer productivity
            const packerTrends = await this.pool.request()
                .input('startDate', sql.DateTime, startDate)
                .input('endDate', sql.DateTime, endDate)
                .query(`
                    SELECT 
                        CAST(b.packing_started_at AS DATE) AS work_date,
                        COUNT(DISTINCT u.id) AS unique_packers,
                        COUNT(DISTINCT b.id) AS total_batches,
                        SUM(b.total_products) AS total_products,
                        SUM(DATEDIFF(MINUTE, b.packing_started_at, b.closed_at)) AS total_packing_minutes,
                        CAST(
                            CASE 
                                WHEN SUM(DATEDIFF(MINUTE, b.packing_started_at, b.closed_at)) > 0 
                                THEN (SUM(b.total_products) * 60.0) / SUM(DATEDIFF(MINUTE, b.packing_started_at, b.closed_at))
                                ELSE 0 
                            END AS DECIMAL(10,2)
                        ) AS products_per_hour
                    FROM Batches b
                    JOIN Users u ON b.closed_by_iduser = u.id
                    WHERE 
                        b.packing_started_at IS NOT NULL 
                        AND b.closed_at IS NOT NULL
                        AND b.packing_started_at >= @startDate
                        AND b.closed_at <= @endDate
                    GROUP BY CAST(b.packing_started_at AS DATE)
                    ORDER BY work_date
                `);
            
            return {
                picker_daily_trends: pickerTrends.recordset,
                packer_daily_trends: packerTrends.recordset,
                period: {
                    start_date: startDate,
                    end_date: endDate
                }
            };
        } catch (error) {
            console.error('Error getting daily productivity trends:', error);
            throw error;
        }
    }

    /**
     * Get batch processing time breakdown
     * @param {number} batchId - Batch ID to analyze
     * @returns {Promise<Object>} - Batch processing time breakdown
     */
    async getBatchProcessingTimeBreakdown(batchId) {
        try {
            console.log(`Getting processing time breakdown for batch ${batchId}...`);
            
            // Ensure the Users table has the name column
            await this.ensureUsersTableReady();
            
            const result = await this.pool.request()
                .input('batchId', sql.Int, batchId)
                .query(`
                    SELECT 
                        b.id AS batch_id,
                        b.batch_number,
                        b.total_products,
                        b.total_picklists,
                        picker.name AS picker_name,
                        packer.name AS packer_name,
                        b.created_at,
                        b.picking_started_at,
                        b.picking_completed_at,
                        b.packing_started_at,
                        b.closed_at,
                        DATEDIFF(MINUTE, b.created_at, b.picking_started_at) AS wait_time_minutes,
                        DATEDIFF(MINUTE, b.picking_started_at, b.picking_completed_at) AS picking_time_minutes,
                        DATEDIFF(MINUTE, b.picking_completed_at, b.packing_started_at) AS transition_time_minutes,
                        DATEDIFF(MINUTE, b.packing_started_at, b.closed_at) AS packing_time_minutes,
                        DATEDIFF(MINUTE, b.created_at, b.closed_at) AS total_processing_time_minutes
                    FROM Batches b
                    LEFT JOIN Users picker ON b.assigned_to_iduser = picker.id
                    LEFT JOIN Users packer ON b.closed_by_iduser = packer.id
                    WHERE b.id = @batchId
                `);
            
            if (result.recordset.length === 0) {
                throw new Error(`Batch with ID ${batchId} not found`);
            }
            
            return result.recordset[0];
        } catch (error) {
            console.error(`Error getting processing time breakdown for batch ${batchId}:`, error);
            throw error;
        }
    }

    /**
     * Get user role distribution (picker, packer, or both)
     * @param {Date} startDate - Start date for analysis
     * @param {Date} endDate - End date for analysis
     * @returns {Promise<Array>} - User role distribution
     */
    async getUserRoleDistribution(startDate, endDate) {
        try {
            console.log(`Getting user role distribution from ${startDate} to ${endDate}...`);
            
            // Ensure the Users table has the name column
            await this.ensureUsersTableReady();
            
            const result = await this.pool.request()
                .input('startDate', sql.DateTime, startDate)
                .input('endDate', sql.DateTime, endDate)
                .query(`
                    WITH PickerStats AS (
                        SELECT 
                            u.id AS user_id,
                            u.name AS user_name,
                            COUNT(DISTINCT b.id) AS batches_picked,
                            SUM(DATEDIFF(MINUTE, b.picking_started_at, b.picking_completed_at)) AS total_picking_minutes
                        FROM Batches b
                        JOIN Users u ON b.assigned_to_iduser = u.id
                        WHERE 
                            b.picking_started_at IS NOT NULL 
                            AND b.picking_completed_at IS NOT NULL
                            AND b.picking_started_at >= @startDate
                            AND b.picking_completed_at <= @endDate
                        GROUP BY u.id, u.name
                    ),
                    PackerStats AS (
                        SELECT 
                            u.id AS user_id,
                            u.name AS user_name,
                            COUNT(DISTINCT b.id) AS batches_packed,
                            SUM(DATEDIFF(MINUTE, b.packing_started_at, b.closed_at)) AS total_packing_minutes
                        FROM Batches b
                        JOIN Users u ON b.closed_by_iduser = u.id
                        WHERE 
                            b.packing_started_at IS NOT NULL 
                            AND b.closed_at IS NOT NULL
                            AND b.packing_started_at >= @startDate
                            AND b.closed_at <= @endDate
                        GROUP BY u.id, u.name
                    )
                    SELECT 
                        COALESCE(p.user_id, pk.user_id) AS user_id,
                        COALESCE(p.user_name, pk.user_name) AS user_name,
                        COALESCE(p.batches_picked, 0) AS batches_picked,
                        COALESCE(p.total_picking_minutes, 0) AS total_picking_minutes,
                        COALESCE(pk.batches_packed, 0) AS batches_packed,
                        COALESCE(pk.total_packing_minutes, 0) AS total_packing_minutes,
                        CASE
                            WHEN p.user_id IS NOT NULL AND pk.user_id IS NOT NULL THEN 'Both'
                            WHEN p.user_id IS NOT NULL THEN 'Picker'
                            WHEN pk.user_id IS NOT NULL THEN 'Packer'
                            ELSE 'Unknown'
                        END AS primary_role,
                        CAST(
                            CASE
                                WHEN COALESCE(p.total_picking_minutes, 0) + COALESCE(pk.total_packing_minutes, 0) > 0
                                THEN COALESCE(p.total_picking_minutes, 0) * 100.0 / 
                                    (COALESCE(p.total_picking_minutes, 0) + COALESCE(pk.total_packing_minutes, 0))
                                ELSE 0
                            END AS DECIMAL(10,2)
                        ) AS picking_percentage,
                        CAST(
                            CASE
                                WHEN COALESCE(p.total_picking_minutes, 0) + COALESCE(pk.total_packing_minutes, 0) > 0
                                THEN COALESCE(pk.total_packing_minutes, 0) * 100.0 / 
                                    (COALESCE(p.total_picking_minutes, 0) + COALESCE(pk.total_packing_minutes, 0))
                                ELSE 0
                            END AS DECIMAL(10,2)
                        ) AS packing_percentage
                    FROM PickerStats p
                    FULL OUTER JOIN PackerStats pk ON p.user_id = pk.user_id
                    ORDER BY 
                        CASE
                            WHEN p.user_id IS NOT NULL AND pk.user_id IS NOT NULL THEN 1
                            WHEN p.user_id IS NOT NULL THEN 2
                            WHEN pk.user_id IS NOT NULL THEN 3
                            ELSE 4
                        END,
                        COALESCE(p.batches_picked, 0) + COALESCE(pk.batches_packed, 0) DESC
                `);
            
            return result.recordset;
        } catch (error) {
            console.error('Error getting user role distribution:', error);
            throw error;
        }
    }
}

module.exports = BatchProductivityTracker;
