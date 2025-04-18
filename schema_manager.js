// updated_schema_manager.js
const sql = require('mssql');

/**
 * Schema Manager class for handling database schema operations
 * Enhanced version that supports both connection pool and config approaches
 */
class SchemaManager {
    /**
     * Initialize the SchemaManager
     * @param {sql.ConnectionPool|Object} poolOrConfig - SQL connection pool or configuration
     */
    constructor(poolOrConfig) {
        if (poolOrConfig.request && typeof poolOrConfig.request === 'function') {
            // It's a pool
            this.pool = poolOrConfig;
            this.sqlConfig = null;
        } else {
            // It's a config
            this.pool = null;
            this.sqlConfig = poolOrConfig;
        }
    }

    /**
     * Get a connection pool
     * @returns {Promise<sql.ConnectionPool>} - SQL connection pool
     * @private
     */
    async _getPool() {
        if (this.pool) {
            return this.pool;
        }
        
        // Create a new pool if we only have config
        return await sql.connect(this.sqlConfig);
    }

    /**
     * Initialize the schema manager
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            console.log('Initializing schema manager...');
            
            // Create SyncStatus table if it doesn't exist
            await this.ensureTableExists('SyncStatus', {
                id: { type: 'INT', primaryKey: true, identity: true },
                entity_name: { type: 'NVARCHAR(50)', nullable: false },
                entity_type: { type: 'NVARCHAR(50)', nullable: false },
                last_sync_date: { type: 'DATETIME', nullable: false, defaultValue: 'GETDATE()' },
                last_sync_count: { type: 'INT', nullable: false, defaultValue: '0' },
                total_count: { type: 'INT', nullable: false, defaultValue: '0' }
            });
            
            console.log('✅ Schema manager initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Error initializing schema manager:', error.message);
            return false;
        }
    }

    /**
     * Check if a table exists in the database
     * @param {string} tableName - Name of the table to check
     * @returns {Promise<boolean>} - True if table exists, false otherwise
     */
    async tableExists(tableName) {
        try {
            const pool = await this._getPool();
            const result = await pool.request()
                .input('tableName', sql.NVarChar, tableName)
                .query(`
                    SELECT CASE WHEN EXISTS (
                        SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
                        WHERE TABLE_NAME = @tableName
                    ) THEN 1 ELSE 0 END AS table_exists
                `);
            
            return result.recordset[0].table_exists === 1;
        } catch (error) {
            console.error(`Error checking if table ${tableName} exists:`, error);
            throw error;
        }
    }

    /**
     * Check if a column exists in a table
     * @param {string} tableName - Name of the table
     * @param {string} columnName - Name of the column to check
     * @returns {Promise<boolean>} - True if column exists, false otherwise
     */
    async columnExists(tableName, columnName) {
        try {
            const pool = await this._getPool();
            const result = await pool.request()
                .input('tableName', sql.NVarChar, tableName)
                .input('columnName', sql.NVarChar, columnName)
                .query(`
                    SELECT CASE WHEN EXISTS (
                        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
                        WHERE TABLE_NAME = @tableName AND COLUMN_NAME = @columnName
                    ) THEN 1 ELSE 0 END AS column_exists
                `);
            
            return result.recordset[0].column_exists === 1;
        } catch (error) {
            console.error(`Error checking if column ${columnName} exists in table ${tableName}:`, error);
            throw error;
        }
    }

    /**
     * Get SQL type definition string from column definition
     * @param {string} columnName - Name of the column
     * @param {Object} columnDef - Column definition object
     * @returns {string} - SQL type definition string
     * @private
     */
    _getSqlTypeDefinition(columnName, columnDef) {
        let definition = `${columnName} ${columnDef.type}`;
        
        if (columnDef.primaryKey) {
            definition += ' PRIMARY KEY';
        }
        
        if (columnDef.identity) {
            definition += ' IDENTITY(1,1)';
        }
        
        if (columnDef.nullable === false) {
            definition += ' NOT NULL';
        }
        
        if (columnDef.defaultValue) {
            definition += ` DEFAULT ${columnDef.defaultValue}`;
        }
        
        return definition;
    }

    /**
     * Create a table if it doesn't exist
     * @param {string} tableName - Name of the table to create
     * @param {Object} columnDefinitions - Object with column definitions
     * @returns {Promise<boolean>} - True if table was created, false if it already existed
     */
    async createTableIfNotExists(tableName, columnDefinitions) {
        try {
            const tableExists = await this.tableExists(tableName);
            
            if (!tableExists) {
                console.log(`Creating table ${tableName}...`);
                
                // Build column definitions
                const columnDefs = Object.entries(columnDefinitions)
                    .map(([columnName, columnDef]) => this._getSqlTypeDefinition(columnName, columnDef))
                    .join(', ');
                
                // Create table
                const pool = await this._getPool();
                await pool.request()
                    .query(`CREATE TABLE ${tableName} (${columnDefs})`);
                
                console.log(`Table ${tableName} created successfully.`);
                return true;
            }
            
            console.log(`Table ${tableName} already exists.`);
            return false;
        } catch (error) {
            console.error(`Error creating table ${tableName}:`, error);
            throw error;
        }
    }

    /**
     * Add a column to a table if it doesn't exist
     * @param {string} tableName - Name of the table
     * @param {string} columnName - Name of the column to add
     * @param {Object} columnDef - Column definition object
     * @returns {Promise<boolean>} - True if column was added, false if it already existed
     */
    async addColumnIfNotExists(tableName, columnName, columnDef) {
        try {
            const columnExists = await this.columnExists(tableName, columnName);
            
            if (!columnExists) {
                console.log(`Adding column ${columnName} to table ${tableName}...`);
                
                // Build column definition
                const columnDefinition = this._getSqlTypeDefinition(columnName, columnDef);
                
                // Add column
                const pool = await this._getPool();
                await pool.request()
                    .query(`ALTER TABLE ${tableName} ADD ${columnDefinition}`);
                
                console.log(`Column ${columnName} added to table ${tableName} successfully.`);
                return true;
            }
            
            console.log(`Column ${columnName} already exists in table ${tableName}.`);
            return false;
        } catch (error) {
            console.error(`Error adding column ${columnName} to table ${tableName}:`, error);
            throw error;
        }
    }

    /**
     * Ensure a column exists in a table, creating it if necessary
     * @param {string} tableName - Name of the table
     * @param {string} columnName - Name of the column
     * @param {Object|string} columnDefOrType - Column definition object or SQL type string
     * @param {string} [nullability] - 'NULL' or 'NOT NULL' (only used if columnDefOrType is a string)
     * @param {string} [defaultValue] - Default value (only used if columnDefOrType is a string)
     * @returns {Promise<boolean>} - True if column was created, false if it already existed
     */
    async ensureColumnExists(tableName, columnName, columnDefOrType, nullability, defaultValue) {
        try {
            // First check if the table exists
            const tableExists = await this.tableExists(tableName);
            
            if (!tableExists) {
                throw new Error(`Table ${tableName} does not exist. Cannot add column.`);
            }
            
            // Handle both object-style and string-style column definitions
            let columnDef;
            if (typeof columnDefOrType === 'string') {
                // Convert string-style to object-style
                columnDef = {
                    type: columnDefOrType,
                    nullable: nullability !== 'NOT NULL',
                    defaultValue: defaultValue
                };
            } else {
                columnDef = columnDefOrType;
            }
            
            // Then check if the column exists
            return await this.addColumnIfNotExists(tableName, columnName, columnDef);
        } catch (error) {
            console.error(`Error ensuring column ${columnName} exists in table ${tableName}:`, error);
            throw error;
        }
    }

    /**
     * Ensure a table exists with all required columns
     * @param {string} tableName - Name of the table
     * @param {Object|string} columnDefinitionsOrCreateSQL - Object with column definitions or CREATE TABLE SQL
     * @returns {Promise<boolean>} - True if any changes were made, false otherwise
     */
    async ensureTableExists(tableName, columnDefinitionsOrCreateSQL) {
        try {
            let changesMade = false;
            
            // First check if the table exists
            const tableExists = await this.tableExists(tableName);
            
            if (!tableExists) {
                // Handle both object-style and string-style table definitions
                if (typeof columnDefinitionsOrCreateSQL === 'string') {
                    // It's a CREATE TABLE SQL statement
                    const pool = await this._getPool();
                    await pool.request().query(columnDefinitionsOrCreateSQL);
                    console.log(`Table ${tableName} created successfully.`);
                } else {
                    // It's an object with column definitions
                    await this.createTableIfNotExists(tableName, columnDefinitionsOrCreateSQL);
                }
                changesMade = true;
            } else if (typeof columnDefinitionsOrCreateSQL !== 'string') {
                // Table exists and we have column definitions, check each column
                for (const [columnName, columnDef] of Object.entries(columnDefinitionsOrCreateSQL)) {
                    const columnAdded = await this.ensureColumnExists(tableName, columnName, columnDef);
                    if (columnAdded) {
                        changesMade = true;
                    }
                }
            }
            
            return changesMade;
        } catch (error) {
            console.error(`Error ensuring table ${tableName} exists with required columns:`, error);
            throw error;
        }
    }

    /**
     * Get column information for a table
     * @param {string} tableName - Name of the table
     * @returns {Promise<Array>} - Array of column information
     */
    async getTableColumns(tableName) {
        try {
            const pool = await this._getPool();
            const result = await pool.request()
                .input('tableName', sql.NVarChar, tableName)
                .query(`
                    SELECT 
                        COLUMN_NAME, 
                        DATA_TYPE, 
                        CHARACTER_MAXIMUM_LENGTH,
                        IS_NULLABLE, 
                        COLUMN_DEFAULT
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = @tableName
                    ORDER BY ORDINAL_POSITION
                `);
            
            return result.recordset;
        } catch (error) {
            console.error(`Error getting columns for table ${tableName}:`, error);
            throw error;
        }
    }
}

// Export both as a direct module.exports and as an object property
// This ensures compatibility with both import styles
module.exports = SchemaManager;
module.exports.SchemaManager = SchemaManager;
