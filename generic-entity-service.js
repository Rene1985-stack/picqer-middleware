/**
 * Enhanced Generic Entity Service with Entity-Specific Attributes
 * 
 * This service handles synchronization between Picqer and SQL database
 * with support for entity-specific attributes, pagination, and rate limiting.
 */
const sql = require('mssql');
const entityAttributes = require('./entity-attributes');

class EnhancedGenericEntityService {
  /**
   * Create a new enhanced generic entity service
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
    
    // Get entity-specific attributes
    this.attributes = entityAttributes[this.entityType] || [];
    
    // Validate attributes
    if (!this.attributes || this.attributes.length === 0) {
      console.warn(`No specific attributes defined for entity type ${this.entityType}, using minimal schema`);
      this.attributes = [
        { apiField: this.idField, dbColumn: 'id', type: 'string', required: true },
        { apiField: this.nameField, dbColumn: 'name', type: 'string', required: true }
      ];
    }
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
      
      // Handle different response formats
      let processedEntities = [];
      if (Array.isArray(entities)) {
        processedEntities = entities;
      } else if (entities && entities.data && Array.isArray(entities.data)) {
        processedEntities = entities.data;
      } else if (entities && typeof entities === 'object') {
        processedEntities = [entities];
      }
      
      // Log the total number of entities fetched
      console.log(`Fetched ${processedEntities.length} ${this.entityType} entities from Picqer API`);
      
      return processedEntities;
    } catch (error) {
      console.error(`Error fetching ${this.entityType} entities from Picqer:`, error.message);
      throw error;
    }
  }

  /**
   * Extract entity attributes from API response
   * @param {Object} entity - Entity object from API
   * @returns {Object} - Extracted attributes
   */
  extractEntityAttributes(entity) {
    const extractedAttributes = {};
    
    // Extract each defined attribute
    for (const attr of this.attributes) {
      const apiValue = this.getNestedValue(entity, attr.apiField);
      
      // Skip undefined required fields
      if (attr.required && apiValue === undefined) {
        console.warn(`Required field ${attr.apiField} missing in ${this.entityType} entity`);
        continue;
      }
      
      // Convert value based on type
      let dbValue = apiValue;
      if (apiValue !== undefined && apiValue !== null) {
        switch (attr.type) {
          case 'string':
            dbValue = String(apiValue);
            break;
          case 'number':
            dbValue = Number(apiValue);
            break;
          case 'boolean':
            dbValue = Boolean(apiValue);
            break;
          case 'datetime':
            dbValue = apiValue; // SQL Server can handle ISO date strings
            break;
          default:
            dbValue = apiValue;
        }
      }
      
      extractedAttributes[attr.dbColumn] = dbValue;
    }
    
    return extractedAttributes;
  }
  
  /**
   * Get nested value from object using dot notation
   * @param {Object} obj - Object to extract from
   * @param {string} path - Path to value using dot notation
   * @returns {*} - Extracted value
   */
  getNestedValue(obj, path) {
    if (!obj || !path) return undefined;
    
    const keys = path.split('.');
    let value = obj;
    
    for (const key of keys) {
      if (value === null || value === undefined) return undefined;
      value = value[key];
    }
    
    return value;
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
      
      // Extract entity attributes
      const attributes = this.extractEntityAttributes(entity);
      
      // Ensure ID is present
      if (!attributes.id) {
        console.error(`Missing ID for ${this.entityType} entity`);
        return false;
      }
      
      // Check if entity already exists
      const existingEntity = await pool.request()
        .input('entityId', sql.VarChar, attributes.id)
        .query(`
          SELECT id
          FROM ${this.tableName}
          WHERE id = @entityId
        `);
      
      if (existingEntity.recordset.length > 0) {
        // Update existing entity
        const updateColumns = Object.keys(attributes)
          .filter(key => key !== 'id') // Exclude ID from update
          .map(key => `${key} = @${key}`)
          .join(', ');
        
        if (!updateColumns) {
          console.log(`No columns to update for ${this.entityType} ${attributes.id}`);
          return true;
        }
        
        const updateRequest = pool.request()
          .input('entityId', sql.VarChar, attributes.id);
        
        // Add parameters for each attribute
        for (const [key, value] of Object.entries(attributes)) {
          if (key !== 'id') { // Skip ID in SET clause
            updateRequest.input(key, this.getSqlType(value), value);
          }
        }
        
        await updateRequest.query(`
          UPDATE ${this.tableName}
          SET ${updateColumns}
          WHERE id = @entityId
        `);
        
        console.log(`Updated ${this.entityType} ${attributes.id} in database`);
      } else {
        // Insert new entity
        const columns = Object.keys(attributes).join(', ');
        const paramNames = Object.keys(attributes).map(key => `@${key}`).join(', ');
        
        const insertRequest = pool.request();
        
        // Add parameters for each attribute
        for (const [key, value] of Object.entries(attributes)) {
          insertRequest.input(key, this.getSqlType(value), value);
        }
        
        await insertRequest.query(`
          INSERT INTO ${this.tableName} (${columns})
          VALUES (${paramNames})
        `);
        
        console.log(`Inserted new ${this.entityType} ${attributes.id} into database`);
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving ${this.entityType} entity:`, error.message);
      throw error;
    }
  }
  
  /**
   * Get SQL type for a value
   * @param {*} value - Value to get type for
   * @returns {*} - SQL type
   */
  getSqlType(value) {
    if (value === null || value === undefined) return sql.VarChar;
    
    switch (typeof value) {
      case 'string':
        return sql.NVarChar;
      case 'number':
        return Number.isInteger(value) ? sql.Int : sql.Float;
      case 'boolean':
        return sql.Bit;
      case 'object':
        if (value instanceof Date) return sql.DateTimeOffset;
        return sql.NVarChar;
      default:
        return sql.VarChar;
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
          console.error(`Error saving ${this.entityType} entity:`, error.message);
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

module.exports = EnhancedGenericEntityService;
