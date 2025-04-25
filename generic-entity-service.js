/**
 * Generic Entity Service with Pagination and Rate Limiting Support
 * 
 * A unified service for handling all entity types between Picqer and SQL database.
 * This version includes pagination support for handling large datasets.
 */
const sql = require('mssql');

class GenericEntityService {
  /**
   * Create a new generic entity service
   * @param {Object} entityConfig - Entity configuration
   * @param {Object} apiClient - Picqer API client
   * @param {Object} dbManager - Database manager
   */
  constructor(entityConfig, apiClient, dbManager) {
    this.entityConfig = entityConfig;
    this.entityType = entityConfig.entityType;
    this.tableName = entityConfig.tableName;
    this.idField = entityConfig.idField;
    this.apiEndpoint = entityConfig.apiEndpoint;
    this.nameField = entityConfig.nameField || 'name';
    this.apiClient = apiClient;
    this.dbManager = dbManager;
  }

  /**
   * Initialize the entity service
   * @returns {Promise<boolean>} - Success status
   */
  async initialize() {
    try {
      // Initialize entity schema
      await this.dbManager.initializeEntitySchema(this.entityConfig);
      console.log(`${this.entityType} service initialized successfully`);
      return true;
    } catch (error) {
      console.error(`Error initializing ${this.entityType} service:`, error.message);
      return false;
    }
  }

  /**
   * Fetch entities from Picqer API with pagination
   * @param {Object} params - Query parameters
   * @returns {Promise<Array>} - Array of entity objects
   */
  async fetchEntities(params = {}) {
    try {
      console.log(`Fetching ${this.entityType} entities from Picqer API...`);
      
      // Get entities from Picqer with automatic pagination
      const entities = await this.apiClient.get(this.apiEndpoint, params, true);
      
      // Log the total number of entities fetched
      console.log(`Fetched ${Array.isArray(entities) ? entities.length : 0} ${this.entityType} entities from Picqer API`);
      
      return Array.isArray(entities) ? entities : [];
    } catch (error) {
      console.error(`Error fetching ${this.entityType} entities from Picqer:`, error.message);
      throw error;
    }
  }

  /**
   * Save an entity to the database
   * @param {Object} entity - Entity object from Picqer
   * @returns {Promise<boolean>} - Success status
   */
  async saveEntity(entity) {
    try {
      // Ensure pool is connected
      if (!this.dbManager.pool) {
        await this.dbManager.connect();
      }
      
      const pool = this.dbManager.pool;
      const entityId = String(entity[this.idField]); // Ensure ID is a string
      const entityName = entity[this.nameField] || '';
      
      // Check if entity already exists
      const existingEntity = await pool.request()
        .input('entityId', sql.VarChar, entityId)
        .query(`
          SELECT ${this.idField}
          FROM ${this.tableName}
          WHERE ${this.idField} = @entityId
        `);
      
      if (existingEntity.recordset.length > 0) {
        // Update existing entity - MINIMAL SCHEMA VERSION
        await pool.request()
          .input('entityId', sql.VarChar, entityId)
          .input('name', sql.NVarChar, entityName)
          .query(`
            UPDATE ${this.tableName}
            SET name = @name
            WHERE ${this.idField} = @entityId
          `);
        
        console.log(`Updated ${this.entityType} ${entityId} in database`);
      } else {
        // Insert new entity - MINIMAL SCHEMA VERSION
        await pool.request()
          .input('entityId', sql.VarChar, entityId)
          .input('name', sql.NVarChar, entityName)
          .query(`
            INSERT INTO ${this.tableName} (${this.idField}, name)
            VALUES (@entityId, @name)
          `);
        
        console.log(`Inserted new ${this.entityType} ${entityId} into database`);
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving ${this.entityType} ${entity[this.idField]}:`, error.message);
      throw error;
    }
  }

  /**
   * Sync entities from Picqer to database with pagination and rate limiting
   * @returns {Promise<Object>} - Sync result
   */
  async syncEntities() {
    console.log(`Starting ${this.entityType} sync...`);
    
    try {
      // Get last sync date
      const lastSyncDate = await this.dbManager.getLastSyncDate(this.entityType);
      console.log(`Last ${this.entityType} sync date: ${lastSyncDate.toISOString()}`);
      
      // Create sync progress record
      const syncId = `${this.entityType}_${Date.now()}`;
      await this.dbManager.createSyncProgressRecord(syncId, this.entityType);
      
      // Fetch entities from Picqer with pagination
      const entities = await this.fetchEntities();
      
      // Save entities to database
      let count = 0;
      for (const entity of entities) {
        try {
          await this.saveEntity(entity);
          count++;
          
          // Update progress periodically (every 50 entities)
          if (count % 50 === 0) {
            console.log(`Progress: Synced ${count}/${entities.length} ${this.entityType} entities...`);
          }
        } catch (error) {
          console.error(`Error saving ${this.entityType} ${entity[this.idField]}:`, error.message);
        }
      }
      
      // Update sync status
      await this.dbManager.updateSyncStatus(this.entityType);
      
      // Update sync progress
      await this.dbManager.updateSyncProgressRecord(syncId, 'completed', count);
      
      // Get API client statistics
      const stats = this.apiClient.getStats ? this.apiClient.getStats() : {};
      
      console.log(`${this.entityType} sync completed. Synced ${count} entities.`);
      if (stats.rateLimitHits) {
        console.log(`Rate limit statistics: ${stats.rateLimitHits} hits, ${stats.retries} retries`);
      }
      
      return {
        success: true,
        message: `Synced ${count} ${this.entityType} entities successfully`,
        count,
        stats
      };
    } catch (error) {
      console.error(`Error syncing ${this.entityType}:`, error.message);
      
      // Update sync progress with error
      try {
        const syncId = `${this.entityType}_${Date.now()}`;
        await this.dbManager.updateSyncProgressRecord(syncId, 'failed', 0, error.message);
      } catch (progressError) {
        console.error('Error updating sync progress:', progressError.message);
      }
      
      return {
        success: false,
        message: `Error syncing ${this.entityType}: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Get the count of entities in the database
   * @returns {Promise<number>} - Entity count
   */
  async getCount() {
    try {
      // Ensure pool is connected
      if (!this.dbManager.pool) {
        await this.dbManager.connect();
      }
      
      const result = await this.dbManager.pool.request()
        .query(`SELECT COUNT(*) AS count FROM ${this.tableName}`);
      
      return result.recordset[0].count;
    } catch (error) {
      console.error(`Error getting ${this.entityType} count:`, error.message);
      return 0;
    }
  }
}

module.exports = GenericEntityService;
