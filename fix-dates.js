/**
 * Date Fixer Utility
 * 
 * This utility fixes incorrect dates in the database, particularly addressing
 * the issue where dates are showing as "01/01/1970" (Unix epoch) in the dashboard.
 * 
 * Features:
 * 1. Automatically updates null or epoch dates in the SyncStatus table
 * 2. Provides utility functions for safe date handling throughout the application
 * 3. Includes methods to format dates properly for display
 */

const sql = require('mssql');

class DateFixer {
  /**
   * Create a new DateFixer instance
   * @param {Object} dbConfig - Database configuration
   */
  constructor(dbConfig) {
    this.dbConfig = dbConfig;
    this.pool = null;
    console.log('DateFixer utility initialized');
  }

  /**
   * Initialize the database connection pool
   * @returns {Promise<sql.ConnectionPool>} - SQL connection pool
   */
  async initializePool() {
    if (!this.pool) {
      try {
        this.pool = await new sql.ConnectionPool(this.dbConfig).connect();
        console.log('DateFixer database connection pool initialized');
      } catch (error) {
        console.error('Error initializing DateFixer database connection pool:', error.message);
        throw error;
      }
    }
    return this.pool;
  }

  /**
   * Fix incorrect dates in the SyncStatus table
   * @returns {Promise<Object>} - Result of the operation
   */
  async fixDates() {
    try {
      console.log('Starting date fix operation...');
      const pool = await this.initializePool();
      
      // Check for null or epoch dates in SyncStatus table
      const checkResult = await pool.request().query(`
        SELECT COUNT(*) AS invalid_count
        FROM SyncStatus
        WHERE last_sync_date IS NULL 
           OR last_sync_date < '1975-01-01'
      `);
      
      const invalidCount = checkResult.recordset[0].invalid_count;
      
      if (invalidCount > 0) {
        console.log(`Found ${invalidCount} invalid dates in SyncStatus table, fixing...`);
        
        // Update all invalid dates to current date
        await pool.request().query(`
          UPDATE SyncStatus
          SET last_sync_date = GETDATE()
          WHERE last_sync_date IS NULL 
             OR last_sync_date < '1975-01-01'
        `);
        
        console.log(`✅ Fixed ${invalidCount} invalid dates in SyncStatus table`);
        
        return {
          success: true,
          message: `Fixed ${invalidCount} invalid dates in SyncStatus table`,
          fixed_count: invalidCount
        };
      } else {
        console.log('All dates verified - no invalid dates remaining');
        
        return {
          success: true,
          message: 'All dates verified - no invalid dates remaining',
          fixed_count: 0
        };
      }
    } catch (error) {
      console.error('Error fixing dates:', error.message);
      
      return {
        success: false,
        message: `Error fixing dates: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Get a safe date value, replacing null or epoch dates with current date
   * @param {Date|string|null} date - Date to check
   * @returns {Date} - Safe date value
   */
  getSafeDate(date) {
    if (!date) {
      return new Date();
    }
    
    const dateObj = new Date(date);
    
    // Check if date is valid and not epoch (or close to it)
    if (isNaN(dateObj) || dateObj < new Date('1975-01-01')) {
      return new Date();
    }
    
    return dateObj;
  }

  /**
   * Format a date for display, with fallback to current date
   * @param {Date|string|null} date - Date to format
   * @param {string} format - Format string ('short', 'long', 'datetime', 'time')
   * @returns {string} - Formatted date string
   */
  formatDate(date, format = 'short') {
    const safeDate = this.getSafeDate(date);
    
    const options = {
      short: { day: '2-digit', month: '2-digit', year: 'numeric' },
      long: { day: '2-digit', month: 'long', year: 'numeric' },
      datetime: { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' },
      time: { hour: '2-digit', minute: '2-digit', second: '2-digit' }
    };
    
    return safeDate.toLocaleDateString('en-GB', options[format] || options.short);
  }

  /**
   * Check if a date is valid and not epoch
   * @param {Date|string|null} date - Date to check
   * @returns {boolean} - Whether the date is valid
   */
  isValidDate(date) {
    if (!date) {
      return false;
    }
    
    const dateObj = new Date(date);
    
    // Check if date is valid and not epoch (or close to it)
    return !isNaN(dateObj) && dateObj > new Date('1975-01-01');
  }

  /**
   * Fix all dates in a specific table and column
   * @param {string} tableName - Name of the table
   * @param {string} columnName - Name of the date column
   * @returns {Promise<Object>} - Result of the operation
   */
  async fixTableDates(tableName, columnName) {
    try {
      console.log(`Starting date fix operation for ${tableName}.${columnName}...`);
      const pool = await this.initializePool();
      
      // Check for null or epoch dates in the specified table
      const checkResult = await pool.request()
        .input('tableName', sql.NVarChar, tableName)
        .input('columnName', sql.NVarChar, columnName)
        .query(`
          SELECT COUNT(*) AS invalid_count
          FROM ${tableName}
          WHERE ${columnName} IS NULL 
             OR ${columnName} < '1975-01-01'
        `);
      
      const invalidCount = checkResult.recordset[0].invalid_count;
      
      if (invalidCount > 0) {
        console.log(`Found ${invalidCount} invalid dates in ${tableName}.${columnName}, fixing...`);
        
        // Update all invalid dates to current date
        await pool.request()
          .input('tableName', sql.NVarChar, tableName)
          .input('columnName', sql.NVarChar, columnName)
          .query(`
            UPDATE ${tableName}
            SET ${columnName} = GETDATE()
            WHERE ${columnName} IS NULL 
               OR ${columnName} < '1975-01-01'
          `);
        
        console.log(`✅ Fixed ${invalidCount} invalid dates in ${tableName}.${columnName}`);
        
        return {
          success: true,
          message: `Fixed ${invalidCount} invalid dates in ${tableName}.${columnName}`,
          fixed_count: invalidCount
        };
      } else {
        console.log(`All dates verified in ${tableName}.${columnName} - no invalid dates remaining`);
        
        return {
          success: true,
          message: `All dates verified in ${tableName}.${columnName} - no invalid dates remaining`,
          fixed_count: 0
        };
      }
    } catch (error) {
      console.error(`Error fixing dates in ${tableName}.${columnName}:`, error.message);
      
      return {
        success: false,
        message: `Error fixing dates in ${tableName}.${columnName}: ${error.message}`,
        error: error.message
      };
    }
  }
}

module.exports = DateFixer;
