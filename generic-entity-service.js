/**
 * Enhanced Generic Entity Service with Detailed Logging
 * 
 * This service handles synchronization between Picqer and SQL database
 * with support for entity-specific attributes, pagination, rate limiting, and detailed logging.
 */
const sql = require("mssql");
const entityAttributes = require("./entity-attributes"); // Assuming user has this file named entity-attributes.js

class GenericEntityService { // User is using this class name
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
    this.nameField = entityConfig.nameField || "name";
    this.apiClient = apiClient;
    this.dbManager = dbManager;
    
    this.attributes = entityAttributes[this.entityType] || [];
    
    if (!this.attributes || this.attributes.length === 0) {
      console.warn(`[${this.entityType}] No specific attributes defined, using minimal schema: id, name`);
      this.attributes = [
        { apiField: this.idField, dbColumn: "id", type: "string", required: true },
        { apiField: this.nameField, dbColumn: "name", type: "string", required: true }
      ];
    }
    console.log(`[${this.entityType}] Service initialized with attributes:`, JSON.stringify(this.attributes.map(a => a.apiField)));
  }

  async initialize() {
    try {
      await this.dbManager.initializeEntitySchema(this.entityConfig);
      console.log(`[${this.entityType}] Service schema initialized successfully`);
      return true;
    } catch (error) {
      console.error(`[${this.entityType}] Error initializing service schema:`, error.message, error.stack);
      return false;
    }
  }

  async fetchEntities(params = {}) {
    console.log(`[${this.entityType}] Starting fetchEntities with params:`, JSON.stringify(params));
    try {
      console.log(`[${this.entityType}] Calling API client get for endpoint: ${this.apiEndpoint}`);
      const entities = await this.apiClient.get(this.apiEndpoint, params, true); // true for pagination
      console.log(`[${this.entityType}] Raw API response received.`);
      // console.log(`[${this.entityType}] Raw API response sample (first item if array):`, Array.isArray(entities) ? JSON.stringify(entities[0]) : JSON.stringify(entities));

      let processedEntities = [];
      if (Array.isArray(entities)) {
        processedEntities = entities;
        console.log(`[${this.entityType}] API response is an array.`);
      } else if (entities && entities.data && Array.isArray(entities.data)) {
        processedEntities = entities.data;
        console.log(`[${this.entityType}] API response has a data property (array).`);
      } else if (entities && typeof entities === "object" && entities !== null) {
        processedEntities = [entities];
        console.log(`[${this.entityType}] API response is a single object, wrapped in an array.`);
      } else {
        console.warn(`[${this.entityType}] Unexpected API response format. Type: ${typeof entities}`);
      }
      
      console.log(`[${this.entityType}] Fetched ${processedEntities.length} entities from Picqer API after processing format.`);
      return processedEntities;
    } catch (error) {
      console.error(`[${this.entityType}] Error in fetchEntities:`, error.message, error.stack);
      throw error;
    }
  }

  extractEntityAttributes(entity) {
    // console.log(`[${this.entityType}] Starting extractEntityAttributes for entity:`, JSON.stringify(entity));
    const extractedAttributes = {};
    for (const attr of this.attributes) {
      const apiValue = this.getNestedValue(entity, attr.apiField);
      // console.log(`[${this.entityType}] Extracting ${attr.apiField}: value = ${apiValue}`);
      if (attr.required && apiValue === undefined) {
        console.warn(`[${this.entityType}] Required field ${attr.apiField} missing in entity:`, JSON.stringify(entity));
        // For critical ID field, we might want to throw or handle differently
        if (attr.dbColumn === "id") {
            console.error(`[${this.entityType}] CRITICAL: ID field ${attr.apiField} is missing. Entity will likely fail to save.`);
        }
        continue;
      }
      
      let dbValue = apiValue;
      if (apiValue !== undefined && apiValue !== null) {
        switch (attr.type) {
          case "string": dbValue = String(apiValue); break;
          case "number": dbValue = Number(apiValue); break;
          case "boolean": dbValue = Boolean(apiValue); break;
          case "datetime": dbValue = apiValue; break; // SQL Server handles ISO strings
          default: dbValue = apiValue;
        }
      }
      extractedAttributes[attr.dbColumn] = dbValue;
    }
    // console.log(`[${this.entityType}] Extracted attributes:`, JSON.stringify(extractedAttributes));
    return extractedAttributes;
  }
  
  getNestedValue(obj, path) {
    if (!obj || !path) return undefined;
    const keys = path.split(".");
    let value = obj;
    for (const key of keys) {
      if (value === null || value === undefined) return undefined;
      value = value[key];
    }
    return value;
  }

  async saveEntity(entity) {
    const picqerEntityId = entity[this.idField] || "UNKNOWN_ID";
    console.log(`[${this.entityType}] Starting saveEntity for Picqer ID: ${picqerEntityId}`);
    try {
      if (!this.dbManager.pool) {
        console.log(`[${this.entityType}] DBManager pool not connected, attempting to connect.`);
        await this.dbManager.connect();
        console.log(`[${this.entityType}] DBManager pool connected.`);
      }
      const pool = this.dbManager.pool;
      
      const attributes = this.extractEntityAttributes(entity);
      const entityIdForDb = attributes.id; // This is the ID mapped to dbColumn 'id'

      if (!entityIdForDb) {
        console.error(`[${this.entityType}] CRITICAL: Database ID field (mapped to 'id') is missing or undefined after extraction for Picqer entity:`, JSON.stringify(entity));
        return false;
      }
      console.log(`[${this.entityType}] Extracted attributes for DB ID ${entityIdForDb}:`, JSON.stringify(attributes));
      
      console.log(`[${this.entityType}] Checking if entity ID ${entityIdForDb} exists in table ${this.tableName}.`);
      const existingEntity = await pool.request()
        .input("entityId", sql.VarChar, String(entityIdForDb)) // Ensure ID is string for query
        .query(`SELECT id FROM ${this.tableName} WHERE id = @entityId`);
      console.log(`[${this.entityType}] Existing entity check result count: ${existingEntity.recordset.length}`);
      
      if (existingEntity.recordset.length > 0) {
        console.log(`[${this.entityType}] Entity ID ${entityIdForDb} exists. Preparing to update.`);
        const updateColumns = Object.keys(attributes)
          .filter(key => key !== "id")
          .map(key => `${key} = @${key}`)
          .join(", ");
        
        if (!updateColumns) {
          console.log(`[${this.entityType}] No columns to update for ID ${entityIdForDb}. Skipping update.`);
          return true;
        }
        console.log(`[${this.entityType}] Update SET clause: ${updateColumns}`);
        
        const updateRequest = pool.request().input("entityId", sql.VarChar, String(entityIdForDb));
        for (const [key, value] of Object.entries(attributes)) {
          if (key !== "id") {
            updateRequest.input(key, this.getSqlType(value), value);
          }
        }
        console.log(`[${this.entityType}] Executing UPDATE for ID ${entityIdForDb}.`);
        await updateRequest.query(`UPDATE ${this.tableName} SET ${updateColumns} WHERE id = @entityId`);
        console.log(`[${this.entityType}] Successfully updated ID ${entityIdForDb} in database.`);
      } else {
        console.log(`[${this.entityType}] Entity ID ${entityIdForDb} does not exist. Preparing to insert.`);
        const columns = Object.keys(attributes).join(", ");
        const paramNames = Object.keys(attributes).map(key => `@${key}`).join(", ");
        console.log(`[${this.entityType}] Insert columns: ${columns}`);
        console.log(`[${this.entityType}] Insert param names: ${paramNames}`);
        
        const insertRequest = pool.request();
        for (const [key, value] of Object.entries(attributes)) {
          insertRequest.input(key, this.getSqlType(value), value);
        }
        console.log(`[${this.entityType}] Executing INSERT for ID ${entityIdForDb}.`);
        await insertRequest.query(`INSERT INTO ${this.tableName} (${columns}) VALUES (${paramNames})`);
        console.log(`[${this.entityType}] Successfully inserted new ID ${entityIdForDb} into database.`);
      }
      return true;
    } catch (error) {
      console.error(`[${this.entityType}] Error in saveEntity for Picqer ID ${picqerEntityId} (DB ID ${this.extractEntityAttributes(entity).id}):`, error.message, error.stack);
      // Do not re-throw here if we want the sync to continue with other entities
      return false; // Indicate failure for this specific entity
    }
  }
  
  getSqlType(value) {
    if (value === null || value === undefined) return sql.NVarChar; // Default to NVarChar for NULLs to avoid type issues
    switch (typeof value) {
      case "string": return sql.NVarChar;
      case "number": return Number.isInteger(value) ? sql.Int : sql.Float;
      case "boolean": return sql.Bit;
      case "object":
        if (value instanceof Date) return sql.DateTimeOffset;
        return sql.NVarChar; // For other objects, assume string representation or handle as JSON string if needed
      default: return sql.NVarChar;
    }
  }

  async syncEntities() {
    console.log(`[${this.entityType}] Starting full syncEntities process...`);
    const overallSyncId = `${this.entityType}_${Date.now()}`;
    let savedCount = 0;
    let failedCount = 0;
    let totalFetched = 0;

    try {
      console.log(`[${this.entityType}] Attempting to get last sync date.`);
      const lastSyncDate = await this.dbManager.getLastSyncDate(this.entityType);
      console.log(`[${this.entityType}] Last sync date: ${lastSyncDate ? lastSyncDate.toISOString() : "N/A"}`);
      
      console.log(`[${this.entityType}] Creating sync progress record with ID: ${overallSyncId}`);
      await this.dbManager.createSyncProgressRecord(overallSyncId, this.entityType);
      console.log(`[${this.entityType}] Sync progress record created.`);
      
      // Add params for incremental sync if lastSyncDate is available
      const fetchParams = {};
      // Picqer API uses 'updated_since' for some endpoints, 'added_since' for others, or specific date fields.
      // This needs to be configured per entity if incremental sync is desired.
      // For now, we are doing a full sync as per previous logic.
      // if (lastSyncDate) {
      //   fetchParams.updated_since = lastSyncDate.toISOString(); 
      // }

      console.log(`[${this.entityType}] Fetching all entities from Picqer...`);
      const entities = await this.fetchEntities(fetchParams);
      totalFetched = entities.length;
      console.log(`[${this.entityType}] Total ${totalFetched} entities fetched from Picqer.`);
      
      if (totalFetched === 0) {
        console.log(`[${this.entityType}] No entities to sync.`);
      } else {
        console.log(`[${this.entityType}] Starting to save ${totalFetched} entities to database...`);
      }

      for (let i = 0; i < totalFetched; i++) {
        const entity = entities[i];
        console.log(`[${this.entityType}] Processing entity ${i + 1}/${totalFetched} (Picqer ID: ${entity[this.idField] || "N/A"})`);
        const success = await this.saveEntity(entity);
        if (success) {
          savedCount++;
        } else {
          failedCount++;
        }
        if ((i + 1) % 10 === 0 || (i + 1) === totalFetched) {
          console.log(`[${this.entityType}] Progress: Processed ${i + 1}/${totalFetched} entities. Saved: ${savedCount}, Failed: ${failedCount}`);
        }
      }
      
      console.log(`[${this.entityType}] Updating final sync status in DB.`);
      await this.dbManager.updateSyncStatus(this.entityType);
      console.log(`[${this.entityType}] Updating sync progress record ${overallSyncId} to 'completed'.`);
      await this.dbManager.updateSyncProgressRecord(overallSyncId, "completed", savedCount);
      
      const stats = this.apiClient.getStats ? this.apiClient.getStats() : {};
      console.log(`[${this.entityType}] Sync completed. Fetched: ${totalFetched}, Saved: ${savedCount}, Failed: ${failedCount}.`);
      if (stats.rateLimitHits) {
        console.log(`[${this.entityType}] Rate limit stats: ${stats.rateLimitHits} hits, ${stats.retries} retries.`);
      }
      
      return {
        success: true,
        message: `Synced ${savedCount} of ${totalFetched} ${this.entityType} entities. Failed: ${failedCount}`,
        fetched: totalFetched,
        saved: savedCount,
        failed: failedCount,
        stats
      };
    } catch (error) {
      console.error(`[${this.entityType}] CRITICAL ERROR in syncEntities process:`, error.message, error.stack);
      try {
        console.log(`[${this.entityType}] Attempting to update sync progress record ${overallSyncId} to 'failed'.`);
        await this.dbManager.updateSyncProgressRecord(overallSyncId, "failed", savedCount, error.message);
      } catch (progressError) {
        console.error(`[${this.entityType}] Error updating sync progress for failed sync:`, progressError.message, progressError.stack);
      }
      return {
        success: false,
        message: `Error syncing ${this.entityType}: ${error.message}`,
        error: error.message,
        fetched: totalFetched,
        saved: savedCount,
        failed: failedCount + (totalFetched - savedCount - failedCount) // Assume remaining are failed
      };
    }
  }

  async getCount() {
    console.log(`[${this.entityType}] Getting count from table ${this.tableName}`);
    try {
      if (!this.dbManager.pool) {
        console.log(`[${this.entityType}] DBManager pool not connected for getCount, attempting to connect.`);
        await this.dbManager.connect();
         console.log(`[${this.entityType}] DBManager pool connected for getCount.`);
      }
      const result = await this.dbManager.pool.request()
        .query(`SELECT COUNT(*) AS count FROM ${this.tableName}`);
      const count = result.recordset[0].count;
      console.log(`[${this.entityType}] Count is ${count}.`);
      return count;
    } catch (error) {
      console.error(`[${this.entityType}] Error getting count:`, error.message, error.stack);
      return 0;
    }
  }
}

module.exports = GenericEntityService;

