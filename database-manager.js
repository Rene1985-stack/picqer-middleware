/**
 * Database Manager
 * 
 * Handles database connection and schema management for all entities.
 */
const sql = require('mssql');

class DatabaseManager {
  /**
   * Create a new database manager
   * @param {Object} config - Database configuration
   */
  constructor(config) {
    this.config = config;
    this.pool = null;
  }

  /**
   * Connect to the database with retry logic
   * @returns {Promise<sql.ConnectionPool>} - SQL connection pool
   */
  async connect() {
    if (!this.pool) {
      let retries = 3;
      let lastError = null;
      
      while (retries > 0) {
        try {
          console.log(`Attempting to connect to database (${retries} retries left)...`);
          this.pool = await new sql.ConnectionPool(this.config).connect();
          console.log('Database connection established successfully');
          return this.pool;
        } catch (error) {
          lastError = error;
          console.error(`Error connecting to database (retrying): ${error.message}`);
          retries--;
          
          if (retries > 0) {
            // Wait before retrying (exponential backoff)
            const waitTime = (4 - retries) * 1000; // 1s, 2s, 3s
            console.log(`Waiting ${waitTime}ms before retrying...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }
      
      console.error('Failed to connect to database after multiple attempts');
      throw lastError;
    }
    
    return this.pool;
  }

  /**
   * Initialize database schema for all entities
   * @returns {Promise<boolean>} - Success status
   */
  async initializeSchema() {
    try {
      console.log('Initializing database schema...');
      
      // Ensure pool is connected
      if (!this.pool) {
        await this.connect();
      }
      
      // Check if SyncProgress table exists and get its columns
      const tableResult = await this.pool.request().query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'SyncProgress'
      `);
      
      const syncTableExists = tableResult.recordset[0].tableExists > 0;
      
      if (syncTableExists) {
        // Get column information
        const columnResult = await this.pool.request().query(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'SyncProgress'
        `);
        
        const columns = columnResult.recordset.map(record => record.COLUMN_NAME);
        console.log('Existing SyncProgress columns:', columns);
        
        // Check if we need to add the count column
        if (!columns.includes('count')) {
          try {
            await this.pool.request().query(`
              ALTER TABLE SyncProgress ADD count INT DEFAULT 0
            `);
            console.log('Added count column to SyncProgress table');
          } catch (error) {
            console.error('Error adding count column:', error.message);
          }
        }
      } else {
        // Create SyncProgress table
        await this.pool.request().query(`
          CREATE TABLE SyncProgress (
            id INT IDENTITY(1,1) PRIMARY KEY,
            sync_id VARCHAR(100) NOT NULL,
            entity_type VARCHAR(50) NOT NULL,
            status VARCHAR(20) NOT NULL,
            started_at DATETIMEOFFSET NOT NULL DEFAULT GETDATE(),
            ended_at DATETIMEOFFSET NULL,
            last_updated DATETIMEOFFSET NOT NULL DEFAULT GETDATE(),
            count INT DEFAULT 0,
            error NVARCHAR(MAX) NULL
          );
          PRINT 'Created SyncProgress table';
        `);
      }
      
      // Create SyncStatus table if it doesn't exist
      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SyncStatus')
        BEGIN
          CREATE TABLE SyncStatus (
            id INT IDENTITY(1,1) PRIMARY KEY,
            entity_type VARCHAR(50) NOT NULL,
            entity_name VARCHAR(50) NOT NULL,
            last_sync_date DATETIMEOFFSET NOT NULL DEFAULT GETDATE()
          );
          PRINT 'Created SyncStatus table';
        END
        ELSE
        BEGIN
          PRINT 'SyncStatus table already exists';
        END
      `);
      
      console.log('✅ Core tables initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing database schema:', error.message);
      throw error;
    }
  }

  /**
   * Initialize entity table schema
   * @param {Object} entityConfig - Entity configuration
   * @returns {Promise<boolean>} - Success status
   */
  async initializeEntitySchema(entityConfig) {
    try {
      console.log(`Initializing schema for ${entityConfig.tableName}...`);
      
      // Ensure pool is connected
      if (!this.pool) {
        await this.connect();
      }
      
      // Create entity table if it doesn't exist
      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${entityConfig.tableName}')
        BEGIN
          CREATE TABLE ${entityConfig.tableName} (
            ${entityConfig.idField} VARCHAR(50) PRIMARY KEY,
            name NVARCHAR(255) NULL,
            created DATETIMEOFFSET NULL DEFAULT GETDATE(),
            updated DATETIMEOFFSET NULL DEFAULT GETDATE(),
            data NVARCHAR(MAX) NULL,
            last_sync_date DATETIMEOFFSET NULL DEFAULT GETDATE()
          );
          PRINT 'Created ${entityConfig.tableName} table';
        END
        ELSE
        BEGIN
          -- Check if last_sync_date column exists and add it if it doesn't
          IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${entityConfig.tableName}' AND COLUMN_NAME = 'last_sync_date')
          BEGIN
            ALTER TABLE ${entityConfig.tableName} ADD last_sync_date DATETIMEOFFSET NULL DEFAULT GETDATE();
            PRINT 'Added last_sync_date column to ${entityConfig.tableName} table';
          END
          
          PRINT '${entityConfig.tableName} table already exists';
        END
      `);
      
      // Ensure entity has a record in SyncStatus
      await this.pool.request()
        .input('entityType', sql.VarChar, entityConfig.entityType)
        .input('entityName', sql.VarChar, entityConfig.entityType)
        .input('lastSyncDate', sql.DateTimeOffset, new Date(0)) // Start with epoch time
        .query(`
          IF NOT EXISTS (SELECT * FROM SyncStatus WHERE entity_type = @entityType)
          BEGIN
            INSERT INTO SyncStatus (entity_type, entity_name, last_sync_date)
            VALUES (@entityType, @entityName, @lastSyncDate);
            PRINT 'Added initial record for ${entityConfig.entityType} in SyncStatus';
          END
          ELSE
          BEGIN
            PRINT '${entityConfig.entityType} record already exists in SyncStatus';
          END
        `);
      
      console.log(`✅ Schema for ${entityConfig.tableName} initialized successfully`);
      return true;
    } catch (error) {
      console.error(`❌ Error initializing schema for ${entityConfig.tableName}:`, error.message);
      throw error;
    }
  }

  /**
   * Get the last sync date for an entity type
   * @param {string} entityType - Entity type
   * @returns {Promise<Date>} - Last sync date
   */
  async getLastSyncDate(entityType) {
    try {
      // Ensure pool is connected
      if (!this.pool) {
        await this.connect();
      }
      
      const result = await this.pool.request()
        .input('entityType', sql.VarChar, entityType)
        .query(`
          SELECT last_sync_date 
          FROM SyncStatus 
          WHERE entity_type = @entityType
        `);
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      // Return a date 30 days ago as a fallback
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return thirtyDaysAgo;
    } catch (error) {
      console.error(`Error getting last sync date for ${entityType}:`, error.message);
      
      // Return a date 30 days ago as a fallback
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return thirtyDaysAgo;
    }
  }

  /**
   * Update sync status for an entity type
   * @param {string} entityType - Entity type
   * @returns {Promise<boolean>} - Success status
   */
  async updateSyncStatus(entityType) {
    try {
      // Ensure pool is connected
      if (!this.pool) {
        await this.connect();
      }
      
      await this.pool.request()
        .input('entityType', sql.VarChar, entityType)
        .input('lastSyncDate', sql.DateTimeOffset, new Date())
        .query(`
          UPDATE SyncStatus 
          SET last_sync_date = @lastSyncDate 
          WHERE entity_type = @entityType
        `);
      
      console.log(`Updated sync status for ${entityType}`);
      return true;
    } catch (error) {
      console.error(`Error updating sync status for ${entityType}:`, error.message);
      throw error;
    }
  }

  /**
   * Create a sync progress record
   * @param {string} syncId - Unique sync ID
   * @param {string} entityType - Entity type
   * @returns {Promise<boolean>} - Success status
   */
  async createSyncProgressRecord(syncId, entityType) {
    try {
      // Ensure pool is connected
      if (!this.pool) {
        await this.connect();
      }
      
      // Get column information to determine correct column names
      const columnResult = await this.pool.request().query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'SyncProgress'
      `);
      
      const columns = columnResult.recordset.map(record => record.COLUMN_NAME);
      
      // Determine the correct column names
      const startTimeColumn = columns.includes('started_at') ? 'started_at' : 'start_time';
      
      // Build the query dynamically based on available columns
      let query = `
        INSERT INTO SyncProgress (sync_id, entity_type, status, ${startTimeColumn}
      `;
      
      // Add last_updated if it exists
      if (columns.includes('last_updated')) {
        query += `, last_updated`;
      }
      
      query += `) VALUES (@syncId, @entityType, @status, @startTime`;
      
      // Add last_updated value if it exists
      if (columns.includes('last_updated')) {
        query += `, @lastUpdated`;
      }
      
      query += `)`;
      
      const request = this.pool.request()
        .input('syncId', sql.VarChar, syncId)
        .input('entityType', sql.VarChar, entityType)
        .input('status', sql.VarChar, 'in_progress')
        .input('startTime', sql.DateTimeOffset, new Date());
      
      // Add last_updated parameter if needed
      if (columns.includes('last_updated')) {
        request.input('lastUpdated', sql.DateTimeOffset, new Date());
      }
      
      await request.query(query);
      
      console.log(`Created sync progress record for ${entityType} with ID ${syncId}`);
      return true;
    } catch (error) {
      console.error(`Error creating sync progress record for ${entityType}:`, error.message);
      throw error;
    }
  }

  /**
   * Update a sync progress record
   * @param {string} syncId - Unique sync ID
   * @param {string} status - Sync status
   * @param {number} count - Number of entities synced
   * @param {string} error - Error message (if any)
   * @returns {Promise<boolean>} - Success status
   */
  async updateSyncProgressRecord(syncId, status, count, error = null) {
    try {
      // Ensure pool is connected
      if (!this.pool) {
        await this.connect();
      }
      
      // Get column information to determine correct column names
      const columnResult = await this.pool.request().query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'SyncProgress'
      `);
      
      const columns = columnResult.recordset.map(record => record.COLUMN_NAME);
      
      // Determine the correct column names
      const endTimeColumn = columns.includes('ended_at') ? 'ended_at' : 'end_time';
      const countColumn = columns.includes('count') ? 'count' : null;
      
      // Build the query dynamically based on available columns
      let query = `
        UPDATE SyncProgress
        SET status = @status,
            ${endTimeColumn} = @endTime
      `;
      
      // Add last_updated if it exists
      if (columns.includes('last_updated')) {
        query += `, last_updated = @lastUpdated`;
      }
      
      // Add count column if it exists
      if (countColumn) {
        query += `, ${countColumn} = @count`;
      }
      
      // Add error column if it exists
      if (columns.includes('error')) {
        query += `, error = @error`;
      }
      
      query += ` WHERE sync_id = @syncId`;
      
      const request = this.pool.request()
        .input('syncId', sql.VarChar, syncId)
        .input('status', sql.VarChar, status)
        .input('endTime', sql.DateTimeOffset, new Date())
        .input('count', sql.Int, count)
        .input('error', sql.NVarChar, error);
      
      // Add last_updated parameter if needed
      if (columns.includes('last_updated')) {
        request.input('lastUpdated', sql.DateTimeOffset, new Date());
      }
      
      await request.query(query);
      
      console.log(`Updated sync progress record ${syncId} with status ${status}`);
      return true;
    } catch (error) {
      console.error(`Error updating sync progress record ${syncId}:`, error.message);
      throw error;
    }
  }

  /**
   * Close the database connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      console.log('Database connection closed');
    }
  }
}

module.exports = DatabaseManager;
