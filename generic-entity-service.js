/**
 * Generic Entity Service with Dynamic Schema and Field Mapping
 * 
 * This service handles synchronization between Picqer and SQL database.
 * It dynamically maps all fields from Picqer to SQL columns, creating columns if they don't exist.
 * It also handles IDENTITY_INSERT for tables with identity primary keys.
 */
const sql = require("mssql");
// entity-attributes.js will now primarily define the Picqer ID field and a default name field.
// All other fields will be dynamically mapped.
const entityAttributeHints = require("./entity-attributes"); 

class GenericEntityService {
  constructor(entityConfig, apiClient, dbManager) {
    this.entityConfig = entityConfig;
    this.entityType = entityConfig.entityType;
    this.tableName = entityConfig.tableName;
    this.apiEndpoint = entityConfig.apiEndpoint;
    this.apiClient = apiClient;
    this.dbManager = dbManager;

    // Get hints for Picqer's primary ID field and a potential name field from entity-attributes.js
    const hints = entityAttributeHints[this.entityType] || [];
    const idHint = hints.find(h => h.dbColumn === "id" && h.required);
    this.picqerIdField = idHint ? idHint.apiField : "id"; // Default to "id" if not specified
    
    const nameHint = hints.find(h => h.dbColumn === "name");
    this.picqerNameField = nameHint ? nameHint.apiField : "name"; // Default to "name"

    console.log(`[${this.entityType}] Service initialized. Picqer ID field: '${this.picqerIdField}', Name field: '${this.picqerNameField}'. All other fields will be dynamic.`);
  }

  async initialize() {
    try {
      // InitializeEntitySchema will create the table with at least an 'id' and 'name' column if it doesn't exist.
      // Other columns are added dynamically during saveEntity.
      await this.dbManager.initializeEntitySchema(this.entityConfig, this.picqerIdField, this.picqerNameField);
      console.log(`[${this.entityType}] Service schema (table and base columns) initialized successfully`);
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

      let processedEntities = [];
      if (Array.isArray(entities)) {
        processedEntities = entities;
      } else if (entities && entities.data && Array.isArray(entities.data)) {
        processedEntities = entities.data;
      } else if (entities && typeof entities === "object" && entities !== null) {
        processedEntities = [entities];
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

  // Helper to sanitize Picqer field names to be valid SQL column names
  sanitizeKeyForSql(key) {
    let sanitized = key.replace(/[^a-zA-Z0-9_]/g, "_");
    // SQL Server column names cannot start with a number, so prefix if necessary
    if (sanitized.match(/^\d/)) {
      sanitized = "_" + sanitized;
    }
    return sanitized.slice(0, 128); // Max column name length for SQL Server is 128
  }

  // Transforms Picqer entity to a flat object with sanitized keys for SQL columns
  // and ensures the primary 'id' column is correctly mapped from picqerIdField.
  transformPicqerEntityForDb(picqerEntity) {
    const dbObject = {};
    if (!picqerEntity || typeof picqerEntity !== "object") {
      console.warn(`[${this.entityType}] Received empty or invalid Picqer entity for transformation.`);
      return dbObject;
    }

    // Ensure the primary ID from Picqer is mapped to a column named 'id'
    const picqerIdValue = picqerEntity[this.picqerIdField];
    if (picqerIdValue === undefined || picqerIdValue === null) {
        console.error(`[${this.entityType}] CRITICAL: Picqer ID field '${this.picqerIdField}' not found or is null in entity:`, JSON.stringify(picqerEntity).substring(0, 500));
        // Cannot proceed without an ID
        return null; 
    }
    dbObject["id"] = String(picqerIdValue); // Standardize DB ID column name to 'id' and ensure it's a string

    for (const key in picqerEntity) {
      if (Object.prototype.hasOwnProperty.call(picqerEntity, key)) {
        // Skip the original Picqer ID field if it's different from 'id' to avoid duplication, 
        // as we've already mapped it to dbObject["id"]
        if (key === this.picqerIdField && this.sanitizeKeyForSql(key) !== "id") {
            continue;
        }

        const sanitizedKey = this.sanitizeKeyForSql(key);
        let value = picqerEntity[key];

        // Convert complex objects/arrays to JSON strings if they are not the primary ID
        if (typeof value === "object" && value !== null && !(value instanceof Date)) {
          try {
            value = JSON.stringify(value);
          } catch (e) {
            console.warn(`[${this.entityType}] Could not stringify object for key ${key}, using null. Error: ${e.message}`);
            value = null;
          }
        }
        dbObject[sanitizedKey] = value;
      }
    }
    return dbObject;
  }

  async saveEntity(picqerEntity) {
    const originalPicqerId = picqerEntity[this.picqerIdField] || "UNKNOWN_PICQER_ID";
    console.log(`[${this.entityType}] Starting saveEntity for Picqer ID: ${originalPicqerId}`);

    const dbData = this.transformPicqerEntityForDb(picqerEntity);
    if (!dbData || !dbData.id) { // dbData.id is the standardized primary key for the DB table
      console.error(`[${this.entityType}] Failed to transform Picqer entity or missing standardized ID for Picqer ID ${originalPicqerId}. Skipping save.`);
      return false;
    }
    const dbEntityId = dbData.id;

    try {
      if (!this.dbManager.pool) await this.dbManager.connect();
      
      // Ensure all columns for the current entity's fields exist in the DB table
      // This check is done once per table per application run to optimize
      if (!this.dbManager.entitySchemasChecked[this.tableName]) {
        console.log(`[${this.entityType}] First encounter with table ${this.tableName} this session, ensuring all columns exist based on current entity...`);
        await this.dbManager.ensureColumnsExist(this.tableName, dbData);
      }

      const operation = async (request) => {
        console.log(`[${this.entityType}] Checking if entity ID ${dbEntityId} exists in table ${this.tableName}.`);
        const existingEntityResult = await request.input("entityIdParam", sql.NVarChar, dbEntityId)
                                            .query(`SELECT id FROM ${this.tableName} WHERE id = @entityIdParam`);
        const entityExists = existingEntityResult.recordset.length > 0;
        console.log(`[${this.entityType}] Entity ID ${dbEntityId} exists: ${entityExists}`);

        const columnsForSql = Object.keys(dbData);
        const requestWithInputs = this.dbManager.pool.request(); // Use a new request for inputs

        if (entityExists) {
          console.log(`[${this.entityType}] Preparing UPDATE for ID ${dbEntityId}.`);
          const setClauses = columnsForSql
            .filter(col => col !== "id") // Don't include 'id' in SET clause
            .map(col => `${col} = @${col}`)
            .join(", ");

          if (!setClauses) {
            console.log(`[${this.entityType}] No columns to update for ID ${dbEntityId} (only ID field present). Skipping update.`);
            return true;
          }
          console.log(`[${this.entityType}] Update SET clause: ${setClauses}`);
          
          requestWithInputs.input("id", sql.NVarChar, dbEntityId); // For the WHERE clause
          for (const col of columnsForSql) {
            if (col !== "id") {
              requestWithInputs.input(col, this.dbManager.getSqlTypeFromJs(dbData[col], col), dbData[col]);
            }
          }
          console.log(`[${this.entityType}] Executing UPDATE for ID ${dbEntityId}.`);
          await requestWithInputs.query(`UPDATE ${this.tableName} SET ${setClauses} WHERE id = @id`);
          console.log(`[${this.entityType}] Successfully updated ID ${dbEntityId}.`);
        } else {
          console.log(`[${this.entityType}] Preparing INSERT for new ID ${dbEntityId}.`);
          const columnNames = columnsForSql.join(", ");
          const paramNames = columnsForSql.map(col => `@${col}`).join(", ");
          console.log(`[${this.entityType}] Insert columns: ${columnNames}`);
          console.log(`[${this.entityType}] Insert param names: ${paramNames}`);

          for (const col of columnsForSql) {
            requestWithInputs.input(col, this.dbManager.getSqlTypeFromJs(dbData[col], col), dbData[col]);
          }
          console.log(`[${this.entityType}] Executing INSERT for ID ${dbEntityId}.`);
          await requestWithInputs.query(`INSERT INTO ${this.tableName} (${columnNames}) VALUES (${paramNames})`);
          console.log(`[${this.entityType}] Successfully inserted new ID ${dbEntityId}.`);
        }
        return true;
      };

      // Execute the operation, handling IDENTITY_INSERT if necessary
      return await this.dbManager.executeWithIdentityInsert(this.tableName, operation);

    } catch (error) {
      console.error(`[${this.entityType}] Error in saveEntity for Picqer ID ${originalPicqerId} (DB ID ${dbEntityId}):`, error.message, error.stack);
      return false;
    }
  }

  async syncEntities() {
    console.log(`[${this.entityType}] Starting full syncEntities process...`);
    const overallSyncId = `${this.entityType}_${Date.now()}`;
    let savedCount = 0;
    let failedCount = 0;
    let totalFetched = 0;

    try {
      await this.initialize(); // Ensure table and base columns are ready
      console.log(`[${this.entityType}] Creating sync progress record with ID: ${overallSyncId}`);
      await this.dbManager.createSyncProgressRecord(overallSyncId, this.entityType);
      
      console.log(`[${this.entityType}] Fetching all entities from Picqer...`);
      const entities = await this.fetchEntities({}); // Pass empty params for full sync
      totalFetched = entities.length;
      console.log(`[${this.entityType}] Total ${totalFetched} entities fetched.`);
      
      if (totalFetched > 0) {
        // Ensure columns for the first entity once before looping, to optimize
        // The dbManager's ensureColumnsExist has its own check to run only once per table per session
        const firstEntityTransformed = this.transformPicqerEntityForDb(entities[0]);
        if (firstEntityTransformed) {
            console.log(`[${this.entityType}] Ensuring columns based on first fetched entity before loop...`);
            await this.dbManager.ensureColumnsExist(this.tableName, firstEntityTransformed);
        } else {
            console.warn(`[${this.entityType}] First entity could not be transformed, column check might be incomplete if subsequent entities have different structures.`);
        }
      }

      for (let i = 0; i < totalFetched; i++) {
        const entity = entities[i];
        const picqerEntityId = entity[this.picqerIdField] || "N/A";
        console.log(`[${this.entityType}] Processing entity ${i + 1}/${totalFetched} (Picqer ID: ${picqerEntityId})`);
        const success = await this.saveEntity(entity);
        if (success) savedCount++; else failedCount++;
        if ((i + 1) % 10 === 0 || (i + 1) === totalFetched) {
          console.log(`[${this.entityType}] Progress: Processed ${i + 1}/${totalFetched}. Saved: ${savedCount}, Failed: ${failedCount}`);
        }
      }
      
      await this.dbManager.updateSyncProgressRecord(overallSyncId, "completed", savedCount);
      const stats = this.apiClient.getStats ? this.apiClient.getStats() : {};
      console.log(`[${this.entityType}] Sync completed. Fetched: ${totalFetched}, Saved: ${savedCount}, Failed: ${failedCount}.`);
      if (stats.rateLimitHits) console.log(`[${this.entityType}] Rate limit stats: ${stats.rateLimitHits} hits, ${stats.retries} retries.`);
      
      return { success: true, message: `Synced ${savedCount}/${totalFetched} ${this.entityType}. Failed: ${failedCount}`, fetched: totalFetched, saved: savedCount, failed: failedCount, stats };
    } catch (error) {
      console.error(`[${this.entityType}] CRITICAL ERROR in syncEntities:`, error.message, error.stack);
      await this.dbManager.updateSyncProgressRecord(overallSyncId, "failed", savedCount, error.message);
      return { success: false, message: `Error syncing ${this.entityType}: ${error.message}`, error: error.message, fetched: totalFetched, saved: savedCount, failed: failedCount + (totalFetched - savedCount - failedCount) };
    }
  }

  async getCount() {
    // ... (getCount method can remain similar, or be removed if not used by dashboard)
    console.log(`[${this.entityType}] Getting count from table ${this.tableName}`);
    try {
      if (!this.dbManager.pool) await this.dbManager.connect();
      const result = await this.dbManager.pool.request().query(`SELECT COUNT(*) AS count FROM ${this.tableName}`);
      return result.recordset[0].count;
    } catch (error) {
      console.error(`[${this.entityType}] Error getting count:`, error.message);
      return 0;
    }
  }
}

module.exports = GenericEntityService;

