/**
 * Schema management utility for automatic column creation and schema maintenance
 * This utility ensures database schemas stay in sync with code requirements
 */
const sql = require('mssql');

class SchemaManager {
  constructor(sqlConfig) {
    this.sqlConfig = sqlConfig;
  }

  /**
   * Initialize the schema manager
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      console.log('Initializing schema manager...');
      
      // Create SyncStatus table if it doesn't exist
      await this.ensureTableExists('SyncStatus', `
        CREATE TABLE SyncStatus (
          id INT IDENTITY(1,1) PRIMARY KEY,
          entity_name NVARCHAR(50) NOT NULL,
          entity_type NVARCHAR(50) NOT NULL,
          last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
          last_sync_count INT NOT NULL DEFAULT 0,
          CONSTRAINT UC_SyncStatus_entity_type UNIQUE (entity_type)
        )
      `);
      
      // Ensure all required columns exist
      await this.ensureColumnExists('SyncStatus', 'total_count', 'INT', 'NOT NULL', '0');
      
      console.log('✅ Schema manager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing schema manager:', error.message);
      return false;
    }
  }

  /**
   * Check if a table exists
   * @param {string} tableName Table name
   * @returns {Promise<boolean>} Whether table exists
   */
  async tableExists(tableName) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request()
        .input('tableName', sql.NVarChar, tableName)
        .query(`
          SELECT COUNT(*) AS tableExists 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_NAME = @tableName
        `);
      
      return result.recordset[0].tableExists > 0;
    } catch (error) {
      console.error(`Error checking if table ${tableName} exists:`, error.message);
      return false;
    }
  }

  /**
   * Check if a column exists in a table
   * @param {string} tableName Table name
   * @param {string} columnName Column name
   * @returns {Promise<boolean>} Whether column exists
   */
  async columnExists(tableName, columnName) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request()
        .input('tableName', sql.NVarChar, tableName)
        .input('columnName', sql.NVarChar, columnName)
        .query(`
          SELECT COUNT(*) AS columnExists 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = @tableName AND COLUMN_NAME = @columnName
        `);
      
      return result.recordset[0].columnExists > 0;
    } catch (error) {
      console.error(`Error checking if column ${columnName} exists in table ${tableName}:`, error.message);
      return false;
    }
  }

  /**
   * Ensure a table exists, create it if it doesn't
   * @param {string} tableName Table name
   * @param {string} createTableSQL SQL to create the table
   * @returns {Promise<boolean>} Success status
   */
  async ensureTableExists(tableName, createTableSQL) {
    try {
      const exists = await this.tableExists(tableName);
      
      if (!exists) {
        console.log(`Table ${tableName} does not exist, creating it...`);
        const pool = await sql.connect(this.sqlConfig);
        await pool.request().query(createTableSQL);
        console.log(`✅ Created table ${tableName}`);
      } else {
        console.log(`Table ${tableName} already exists`);
      }
      
      return true;
    } catch (error) {
      console.error(`Error ensuring table ${tableName} exists:`, error.message);
      return false;
    }
  }

  /**
   * Ensure a column exists in a table, create it if it doesn't
   * @param {string} tableName Table name
   * @param {string} columnName Column name
   * @param {string} dataType SQL data type (e.g., 'INT', 'NVARCHAR(50)')
   * @param {string} nullability 'NULL' or 'NOT NULL'
   * @param {string} defaultValue Default value (e.g., '0', 'GETDATE()')
   * @returns {Promise<boolean>} Success status
   */
  async ensureColumnExists(tableName, columnName, dataType, nullability = 'NULL', defaultValue = null) {
    try {
      const exists = await this.columnExists(tableName, columnName);
      
      if (!exists) {
        console.log(`Column ${columnName} does not exist in table ${tableName}, creating it...`);
        
        const pool = await sql.connect(this.sqlConfig);
        
        let alterTableSQL = `ALTER TABLE ${tableName} ADD ${columnName} ${dataType} ${nullability}`;
        
        if (defaultValue !== null) {
          // For existing rows, set the default value
          alterTableSQL += ` DEFAULT ${defaultValue} WITH VALUES`;
        }
        
        await pool.request().query(alterTableSQL);
        console.log(`✅ Created column ${columnName} in table ${tableName}`);
      } else {
        console.log(`Column ${columnName} already exists in table ${tableName}`);
      }
      
      return true;
    } catch (error) {
      console.error(`Error ensuring column ${columnName} exists in table ${tableName}:`, error.message);
      return false;
    }
  }

  /**
   * Get column information for a table
   * @param {string} tableName Table name
   * @returns {Promise<Array>} Array of column information
   */
  async getTableColumns(tableName) {
    try {
      const pool = await sql.connect(this.sqlConfig);
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
      console.error(`Error getting columns for table ${tableName}:`, error.message);
      return [];
    }
  }
}

module.exports = SchemaManager;
