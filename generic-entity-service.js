/**
 * Enhanced Generic Entity Service with Identity Column Handling
 * 
 * This service handles synchronization between Picqer and SQL database.
 * It dynamically maps all fields from Picqer to SQL columns, creating columns if they don't exist.
 * It uses a two-step process for tables with identity columns: insert without ID, then update with picqer_id.
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
      
      // Ensure picqer_id column exists for identity column handling
      await this.ensurePicqerIdColumnExists();
      
      console.log(`[${this.entityType}] Service schema (table and base columns) initialized successfully`);
      return true;
    } catch (error) {
      console.error(`[${this.entityType}] Error initializing service schema:`, error.message, error.stack);
      return false;
    }
  }

  async ensurePicqerIdColumnExists() {
    try {
      // Check if the table has an identity column for 'id'
      const schema = await this.dbManager.getTableSchema(this.tableName);
      const idColumn = schema.find(col => col.name.toLowerCase() === "id");
      
      if (idColumn && idColumn.isIdentity) {
        console.log(`[${this.entityType}] Table ${this.tableName} has identity column 'id'. Ensuring 'picqer_id' column exists...`);
        
        // Check if picqer_id column already exists
        const picqerIdExists = schema.some(col => col.name.toLowerCase() === "picqer_id");
        
        if (!picqerIdExists) {
          console.log(`[${this.entityType}] Adding 'picqer_id' column to ${this.tableName} for identity column handling.`);
          await this.dbManager.addColumn(this.tableName, "picqer_id", "sample_id_123", false); // Not nullable
          
          // Add a unique index on picqer_id to ensure data integrity
          await this.dbManager.pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_${this.tableName}_picqer_id' AND object_id = OBJECT_ID('${this.tableName}'))
            BEGIN
              CREATE UNIQUE INDEX IX_${this.tableName}_picqer_id ON ${this.tableName}(picqer_id);
            END
          `);
          
          console.log(`[${this.entityType}] Added 'picqer_id' column and unique index to ${this.tableName}.`);
        } else {
          console.log(`[${this.entityType}] 'picqer_id' column already exists in ${this.tableName}.`);
        }
      } else {
        console.log(`[${this.entityType}] Table ${this.tableName} does not have an identity column for 'id' or the table doesn't exist yet.`);
      }
    } catch (error) {
      console.error(`[${this.entityType}] Error ensuring picqer_id column:`, error.message, error.stack);
      throw error;
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
  transformPicqerEntityForDb(picqerEntity) {
    const dbObject = {};
    if (!picqerEntity || typeof picqerEntity !== "object") {
      console.warn(`[${this.entityType}] Received empty or invalid Picqer entity for transformation.`);
      return dbObject;
    }

    // Get the Picqer ID value
    const picqerIdValue = picqerEntity[this.picqerIdField];
    if (picqerIdValue === undefined || picqerIdValue === null) {
        console.error(`[${this.entityType}] CRITICAL: Picqer ID field '${this.picqerIdField}' not found or is null in entity:`, JSON.stringify(picqerEntity).substring(0, 500));
        // Cannot proceed without an ID
        return null; 
    }
    
    // Store the Picqer ID separately - we'll use it for picqer_id column
    dbObject["picqer_id"] = String(picqerIdValue);

    for (const key in picqerEntity) {
      if (Object.prototype.hasOwnProperty.call(picqerEntity, key)) {
        const sanitizedKey = this.sanitizeKeyForSql(key);
        let value = picqerEntity[key];

        // Convert complex objects/arrays to JSON strings
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
    if (!dbData || !dbData.picqer_id) {
      console.error(`[${this.entityType}] Failed to transform Picqer entity or missing picqer_id for Picqer ID ${originalPicqerId}. Skipping save.`);
      return false;
    }
    const picqerId = dbData.picqer_id;

    try {
      if (!this.dbManager.pool) await this.dbManager.connect();
      
      // Ensure all columns for the current entity's fields exist in the DB table
      // This check is done once per table per application run to optimize
      if (!this.dbManager.entitySchemasChecked[this.tableName]) {
        console.log(`[${this.entityType}] First encounter with table ${this.tableName} this session, ensuring all columns exist based on current entity...`);
        await this.dbManager.ensureColumnsExist(this.tableName, dbData);
      }

      // Check if the table has an identity column for 'id'
      const schema = await this.dbManager.getTableSchema(this.tableName);
      const idColumn = schema.find(col => col.name.toLowerCase() === "id");
      const hasIdentityColumn = idColumn && idColumn.isIdentity;
      
      if (hasIdentityColumn) {
        // For tables with identity columns, use the two-step process
        return await this.saveEntityWithIdentityColumn(dbData, picqerId);
      } else {
        // For tables without identity columns, use the direct process
        return await this.saveEntityWithoutIdentityColumn(dbData, picqerId);
      }
    } catch (error) {
      console.error(`[${this.entityType}] Error in saveEntity for Picqer ID ${originalPicqerId}:`, error.message, error.stack);
      return false;
    }
  }

  async saveEntityWithIdentityColumn(dbData, picqerId) {
    console.log(`[${this.entityType}] Using two-step process for table with identity column. Picqer ID: ${picqerId}`);
    
    try {
      // First, check if an entity with this picqer_id already exists
      const existingResult = await this.dbManager.pool.request()
        .input("picqerId", sql.NVarChar, picqerId)
        .query(`SELECT id FROM ${this.tableName} WHERE picqer_id = @picqerId`);
      
      const entityExists = existingResult.recordset.length > 0;
      
      if (entityExists) {
        // Entity exists, update it
        const existingId = existingResult.recordset[0].id;
        console.log(`[${this.entityType}] Entity with picqer_id ${picqerId} exists with ID ${existingId}. Updating...`);
        
        // Prepare update query
        const columnsForSql = Object.keys(dbData).filter(col => col !== "id"); // Exclude 'id' column
        const setClauses = columnsForSql
          .filter(col => col !== "picqer_id") // Don't include picqer_id in SET clause
          .map(col => `${col} = @${col}`)
          .join(", ");
        
        if (!setClauses) {
          console.log(`[${this.entityType}] No columns to update for picqer_id ${picqerId}. Skipping update.`);
          return true;
        }
        
        // Create a transaction for the update
        const transaction = new sql.Transaction(this.dbManager.pool);
        await transaction.begin();
        
        try {
          const request = new sql.Request(transaction);
          
          // Add parameters to the request
          request.input("id", sql.Int, existingId); // For the WHERE clause
          for (const col of columnsForSql) {
            if (col !== "id") {
              request.input(col, this.dbManager.getSqlTypeFromJs(dbData[col], col), dbData[col]);
            }
          }
          
          console.log(`[${this.entityType}] Executing UPDATE for picqer_id ${picqerId} (ID ${existingId}).`);
          await request.query(`UPDATE ${this.tableName} SET ${setClauses} WHERE id = @id`);
          
          await transaction.commit();
          console.log(`[${this.entityType}] Successfully updated entity with picqer_id ${picqerId} (ID ${existingId}).`);
          return true;
        } catch (error) {
          await transaction.rollback();
          console.error(`[${this.entityType}] Error updating entity with picqer_id ${picqerId}:`, error.message, error.stack);
          throw error;
        }
      } else {
        // Entity doesn't exist, insert it
        console.log(`[${this.entityType}] Entity with picqer_id ${picqerId} doesn't exist. Inserting...`);
        
        // Prepare insert query
        const columnsForSql = Object.keys(dbData).filter(col => col !== "id"); // Exclude 'id' column
        const columnNames = columnsForSql.join(", ");
        const paramNames = columnsForSql.map(col => `@${col}`).join(", ");
        
        // Create a transaction for the insert
        const transaction = new sql.Transaction(this.dbManager.pool);
        await transaction.begin();
        
        try {
          const request = new sql.Request(transaction);
          
          // Add parameters to the request
          for (const col of columnsForSql) {
            request.input(col, this.dbManager.getSqlTypeFromJs(dbData[col], col), dbData[col]);
          }
          
          console.log(`[${this.entityType}] Executing INSERT for picqer_id ${picqerId}.`);
          await request.query(`INSERT INTO ${this.tableName} (${columnNames}) VALUES (${paramNames})`);
          
          await transaction.commit();
          console.log(`[${this.entityType}] Successfully inserted entity with picqer_id ${picqerId}.`);
          return true;
        } catch (error) {
          await transaction.rollback();
          console.error(`[${this.entityType}] Error inserting entity with picqer_id ${picqerId}:`, error.message, error.stack);
          throw error;
        }
      }
    } catch (error) {
      console.error(`[${this.entityType}] Error in saveEntityWithIdentityColumn for picqer_id ${picqerId}:`, error.message, error.stack);
      return false;
    }
  }

  async saveEntityWithoutIdentityColumn(dbData, picqerId) {
    console.log(`[${this.entityType}] Using direct process for table without identity column. Picqer ID: ${picqerId}`);
    
    try {
      // For tables without identity columns, we can use the picqer_id as the id
      dbData.id = picqerId;
      
      // Check if entity exists
      const existingResult = await this.dbManager.pool.request()
        .input("id", sql.NVarChar, picqerId)
        .query(`SELECT id FROM ${this.tableName} WHERE id = @id`);
      
      const entityExists = existingResult.recordset.length > 0;
      
      // Create a transaction
      const transaction = new sql.Transaction(this.dbManager.pool);
      await transaction.begin();
      
      try {
        const request = new sql.Request(transaction);
        
        if (entityExists) {
          // Entity exists, update it
          console.log(`[${this.entityType}] Entity with ID ${picqerId} exists. Updating...`);
          
          // Prepare update query
          const columnsForSql = Object.keys(dbData);
          const setClauses = columnsForSql
            .filter(col => col !== "id") // Don't include id in SET clause
            .map(col => `${col} = @${col}`)
            .join(", ");
          
          if (!setClauses) {
            console.log(`[${this.entityType}] No columns to update for ID ${picqerId}. Skipping update.`);
            await transaction.commit();
            return true;
          }
          
          // Add parameters to the request
          request.input("id", sql.NVarChar, picqerId); // For the WHERE clause
          for (const col of columnsForSql) {
            if (col !== "id") {
              request.input(col, this.dbManager.getSqlTypeFromJs(dbData[col], col), dbData[col]);
            }
          }
          
          console.log(`[${this.entityType}] Executing UPDATE for ID ${picqerId}.`);
          await request.query(`UPDATE ${this.tableName} SET ${setClauses} WHERE id = @id`);
        } else {
          // Entity doesn't exist, insert it
          console.log(`[${this.entityType}] Entity with ID ${picqerId} doesn't exist. Inserting...`);
          
          // Prepare insert query
          const columnsForSql = Object.keys(dbData);
          const columnNames = columnsForSql.join(", ");
          const paramNames = columnsForSql.map(col => `@${col}`).join(", ");
          
          // Add parameters to the request
          for (const col of columnsForSql) {
            request.input(col, this.dbManager.getSqlTypeFromJs(dbData[col], col), dbData[col]);
          }
          
          console.log(`[${this.entityType}] Executing INSERT for ID ${picqerId}.`);
          await request.query(`INSERT INTO ${this.tableName} (${columnNames}) VALUES (${paramNames})`);
        }
        
        await transaction.commit();
        console.log(`[${this.entityType}] Successfully saved entity with ID ${picqerId}.`);
        return true;
      } catch (error) {
        await transaction.rollback();
        console.error(`[${this.entityType}] Error saving entity with ID ${picqerId}:`, error.message, error.stack);
        throw error;
      }
    } catch (error) {
      console.error(`[${this.entityType}] Error in saveEntityWithoutIdentityColumn for ID ${picqerId}:`, error.message, error.stack);
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
