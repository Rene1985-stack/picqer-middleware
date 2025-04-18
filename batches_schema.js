// batches_schema.js
const sql = require('mssql');

/**
 * Creates the Batches table if it doesn't exist
 * @param {sql.ConnectionPool} pool - SQL connection pool
 */
async function createBatchesTableIfNotExists(pool) {
    try {
        console.log('Checking if Batches table exists...');
        
        // Check if table exists
        const tableExists = await pool.request()
            .query(`
                IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Batches')
                SELECT 1 AS table_exists
                ELSE
                SELECT 0 AS table_exists
            `);
        
        if (tableExists.recordset[0].table_exists === 0) {
            console.log('Batches table does not exist. Creating...');
            
            // Create table
            await pool.request()
                .query(`
                    CREATE TABLE Batches (
                        id INT PRIMARY KEY IDENTITY(1,1),
                        batch_number NVARCHAR(50) NOT NULL,
                        created_at DATETIME NOT NULL DEFAULT GETDATE(),
                        assigned_to_iduser INT,
                        picking_started_at DATETIME,
                        picking_completed_at DATETIME,
                        closed_by_iduser INT,
                        packing_started_at DATETIME,
                        closed_at DATETIME,
                        status NVARCHAR(50) NOT NULL DEFAULT 'open',
                        warehouse_id INT,
                        total_products INT,
                        total_picklists INT,
                        notes NVARCHAR(MAX),
                        last_sync_date DATETIME NOT NULL DEFAULT GETDATE()
                    )
                `);
            
            // Create indexes
            await pool.request()
                .query(`
                    CREATE INDEX idx_batches_batch_number ON Batches(batch_number);
                    CREATE INDEX idx_batches_assigned_to_iduser ON Batches(assigned_to_iduser);
                    CREATE INDEX idx_batches_closed_by_iduser ON Batches(closed_by_iduser);
                    CREATE INDEX idx_batches_status ON Batches(status);
                    CREATE INDEX idx_batches_warehouse_id ON Batches(warehouse_id);
                `);
            
            console.log('Batches table created successfully.');
        } else {
            console.log('Batches table already exists.');
        }
        
        // Check if we need to add a relationship column to Picklists
        const columnExists = await pool.request()
            .query(`
                IF EXISTS (
                    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = 'Picklists' AND COLUMN_NAME = 'idpicklist_batch'
                )
                SELECT 1 AS column_exists
                ELSE
                SELECT 0 AS column_exists
            `);
        
        if (columnExists.recordset[0].column_exists === 0) {
            console.log('Adding idpicklist_batch column to Picklists table...');
            
            await pool.request()
                .query(`
                    ALTER TABLE Picklists
                    ADD idpicklist_batch INT NULL;
                    
                    CREATE INDEX idx_picklists_idpicklist_batch ON Picklists(idpicklist_batch);
                `);
            
            console.log('Added idpicklist_batch column to Picklists table.');
        } else {
            console.log('idpicklist_batch column already exists in Picklists table.');
        }
        
        return true;
    } catch (error) {
        console.error('Error creating Batches table:', error);
        throw error;
    }
}

module.exports = {
    createBatchesTableIfNotExists
};
