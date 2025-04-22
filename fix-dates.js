/**
 * Fix-Dates Utility
 * 
 * This file provides utility functions to fix incorrect dates in the SyncStatus table
 * and ensure proper date handling throughout the middleware.
 */

const sql = require('mssql');

class DateFixer {
  /**
   * Initialize the DateFixer
   * @param {Object} dbConfig - Database configuration
   */
  constructor(dbConfig) {
    this.dbConfig = dbConfig;
    this.pool = null;
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
   * Fix all invalid dates in the SyncStatus table
   * @returns {Promise<Object>} - Result of the operation
   */
  async fixDates() {
    try {
      console.log('Starting date fix operation...');
      
      // Initialize pool if not already initialized
      await this.initializePool();
      
      // Check if SyncStatus table exists
      const tableResult = await this.pool.request().query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'SyncStatus'
      `);
      
      const syncTableExists = tableResult.recordset[0].tableExists > 0;
      
      if (!syncTableExists) {
        console.log('SyncStatus table does not exist, nothing to fix');
        return { success: false, message: 'SyncStatus table does not exist' };
      }
      
      // Get current date in SQL format
      const currentDate = new Date().toISOString();
      
      // Update all null or epoch dates to current date
      const result = await this.pool.request()
        .input('currentDate', sql.DateTime, currentDate)
        .query(`
          UPDATE SyncStatus
          SET last_sync_date = @currentDate
          WHERE last_sync_date IS NULL 
             OR last_sync_date < '1971-01-01'
        `);
      
      console.log(`Fixed ${result.rowsAffected[0]} date entries in SyncStatus table`);
      
      // Verify the fix
      const verifyResult = await this.pool.request().query(`
        SELECT entity_name, entity_type, last_sync_date
        FROM SyncStatus
        WHERE last_sync_date < '1971-01-01'
      `);
      
      if (verifyResult.recordset.length > 0) {
        console.warn('Some dates could not be fixed:', verifyResult.recordset);
      } else {
        console.log('All dates verified - no invalid dates remaining');
      }
      
      return { 
        success: true, 
        rowsUpdated: result.rowsAffected[0],
        message: `Fixed ${result.rowsAffected[0]} date entries in SyncStatus table`
      };
    } catch (error) {
      console.error('Error fixing dates:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get a safe date string that never returns epoch
   * @param {Date|string|null} date - Input date
   * @returns {string} - Safe date string
   */
  static getSafeDate(date) {
    if (!date) {
      return new Date().toISOString();
    }
    
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    // Check if date is valid and not epoch (with some margin)
    if (isNaN(dateObj) || dateObj.getFullYear() < 1971) {
      return new Date().toISOString();
    }
    
    return dateObj.toISOString();
  }

  /**
   * Format a date for display in the dashboard
   * @param {Date|string|null} date - Input date
   * @returns {string} - Formatted date string
   */
  static formatDateForDisplay(date) {
    const safeDate = this.getSafeDate(date);
    const dateObj = new Date(safeDate);
    
    return dateObj.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
}

module.exports = DateFixer;
