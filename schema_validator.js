/**
 * Schema validation utility for ensuring all required columns exist
 * This script checks and adds missing last_sync_date columns to all entity tables
 */
const sql = require('mssql');

class SchemaValidator {
  constructor(sqlConfig) {
    this.sqlConfig = sqlConfig;
  }

  /**
   * Validate all entity tables have required columns
   * @returns {Promise<Object>} Validation results
   */
  async validateAllEntityTables() {
    try {
      console.log('Validating all entity tables for required columns...');
      
      const results = {
        success: true,
        validatedTables: [],
        errors: []
      };
      
      // List of all entity tables to validate
      const entityTables = [
        'Products', 
        'Picklists', 
        'PicklistProducts', 
        'PicklistProductLocations',
        'Warehouses', 
        'WarehouseStock',
        'Users', 
        'UserRights',
        'Suppliers', 
        'SupplierProducts',
        'SyncStatus',
        'SyncProgress'
      ];
      
      // Connect to database
      const pool = await sql.connect(this.sqlConfig);
      
      // Check each table for last_sync_date column
      for (const tableName of entityTables) {
        try {
          // Check if table exists
          const tableExists = await this.tableExists(tableName);
          
          if (!tableExists) {
            results.errors.push(`Table ${tableName} does not exist`);
            results.success = false;
            continue;
          }
          
          // Check if last_sync_date column exists
          const hasLastSyncDate = await this.columnExists(tableName, 'last_sync_date');
          
          if (!hasLastSyncDate) {
            // Add last_sync_date column if missing
            await this.addLastSyncDateColumn(tableName);
            results.validatedTables.push(`${tableName} (added last_sync_date)`);
          } else {
            results.validatedTables.push(`${tableName} (verified)`);
          }
        } catch (tableError) {
          results.errors.push(`Error validating table ${tableName}: ${tableError.message}`);
          results.success = false;
        }
      }
      
      // Validate SyncProgress table has all required columns
      try {
        if (await this.tableExists('SyncProgress')) {
          const requiredColumns = [
            'entity_type', 'sync_id', 'current_offset', 'batch_number',
            'items_processed', 'status', 'started_at', 'last_updated'
          ];
          
          for (const columnName of requiredColumns) {
            const columnExists = await this.columnExists('SyncProgress', columnName);
            if (!columnExists) {
              results.errors.push(`SyncProgress table is missing required column: ${columnName}`);
              results.success = false;
            }
          }
        }
      } catch (syncProgressError) {
        results.errors.push(`Error validating SyncProgress table: ${syncProgressError.message}`);
        results.success = false;
      }
      
      console.log('Schema validation complete');
      return results;
    } catch (error) {
      console.error('❌ Error validating entity tables:', error.message);
      return {
        success: false,
        validatedTables: [],
        errors: [`General validation error: ${error.message}`]
      };
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
      throw error;
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
      throw error;
    }
  }

  /**
   * Add last_sync_date column to a table
   * @param {string} tableName Table name
   * @returns {Promise<boolean>} Success status
   */
  async addLastSyncDateColumn(tableName) {
    try {
      console.log(`Adding last_sync_date column to ${tableName}...`);
      
      const pool = await sql.connect(this.sqlConfig);
      await pool.request().query(`
        ALTER TABLE ${tableName} 
        ADD last_sync_date DATETIME NOT NULL DEFAULT GETDATE()
      `);
      
      console.log(`✅ Added last_sync_date column to ${tableName}`);
      return true;
    } catch (error) {
      console.error(`Error adding last_sync_date column to ${tableName}:`, error.message);
      throw error;
    }
  }
}

module.exports = SchemaValidator;
