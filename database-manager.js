/**
 * Database Manager with Dynamic Schema Handling and Robust SyncProgress Management
 * 
 * This manager handles database connections, schema initialization,
 * dynamic column creation, IDENTITY_INSERT for SQL Server, and robustly manages
 * the SyncProgress table schema.
 */
const sql = require("mssql");

class DatabaseManager {
  constructor(dbConfig) {
    this.dbConfig = dbConfig;
    this.pool = null;
    this.connecting = false;
    this.entitySchemasChecked = {}; 
    this.syncProgressSchema = null; // To cache SyncProgress schema
    console.log("[DBManager] Initialized with config.");
  }

  async connect() {
    if (this.pool && this.pool.connected) return this.pool;
    if (this.connecting) {
      console.log("[DBManager] Connection attempt in progress, waiting...");
      return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
          if (!this.connecting) {
            clearInterval(interval);
            if (this.pool && this.pool.connected) resolve(this.pool);
            else reject(new Error("[DBManager] Failed to connect after waiting."));
          }
        }, 100);
      });
    }
    this.connecting = true;
    try {
      console.log("[DBManager] Attempting to connect to SQL Server...");
      this.pool = await new sql.ConnectionPool(this.dbConfig).connect();
      console.log("[DBManager] Successfully connected to SQL Server.");
      this.pool.on("error", err => {
        console.error("[DBManager] SQL Pool Error:", err.message, err.stack);
        this.pool = null;
      });
      this.connecting = false;
      // Initialize/Verify SyncProgress table schema on first successful connect
      await this.initializeSyncProgressTable(); 
      return this.pool;
    } catch (error) {
      this.connecting = false;
      console.error("[DBManager] Error connecting to SQL Server:", error.message, error.stack);
      this.pool = null;
      throw error;
    }
  }

  async disconnect() {
    if (this.pool && this.pool.connected) {
      console.log("[DBManager] Disconnecting from SQL Server...");
      await this.pool.close();
      this.pool = null;
      console.log("[DBManager] Successfully disconnected.");
    }
  }

  async getTableSchema(tableName, forceRefresh = false) {
    if (tableName.toLowerCase() === "syncprogress" && this.syncProgressSchema && !forceRefresh) {
        return this.syncProgressSchema;
    }
    await this.connect();
    const request = this.pool.request();
    const query = `
      SELECT
        c.COLUMN_NAME,
        c.DATA_TYPE,
        c.IS_NULLABLE,
        CASE WHEN ic.object_id IS NOT NULL THEN 1 ELSE 0 END AS IS_IDENTITY
      FROM INFORMATION_SCHEMA.COLUMNS c
      LEFT JOIN sys.identity_columns ic
        ON ic.object_id = OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME)
        AND ic.name = c.COLUMN_NAME
      WHERE c.TABLE_NAME = @tableName;
    `;
    request.input("tableName", sql.NVarChar, tableName);
    const result = await request.query(query);
    const schema = result.recordset.map(col => ({
      name: col.COLUMN_NAME,
      type: col.DATA_TYPE,
      isNullable: col.IS_NULLABLE === "YES",
      isIdentity: col.IS_IDENTITY === 1
    }));
    if (tableName.toLowerCase() === "syncprogress") {
        this.syncProgressSchema = schema;
    }
    return schema;
  }

  async columnExists(tableName, columnName, schema) {
    const tableSchema = schema || await this.getTableSchema(tableName);
    return tableSchema.some(col => col.name.toLowerCase() === columnName.toLowerCase());
  }

  getSqlTypeFromJs(value, columnName) {
    if (columnName && (columnName.toLowerCase() === "id" || columnName.toLowerCase().endsWith("id"))) {
        return "NVARCHAR(255)"; 
    }
    if (value === null || value === undefined) return "NVARCHAR(MAX)";
    const jsType = typeof value;
    if (jsType === "string") {
      if (value.length > 4000) return "NVARCHAR(MAX)";
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return "DATETIMEOFFSET";
      return `NVARCHAR(${Math.max(255, value.length * 2)})`;
    }
    if (jsType === "number") return Number.isInteger(value) ? "BIGINT" : "FLOAT";
    if (jsType === "boolean") return "BIT";
    if (value instanceof Date) return "DATETIMEOFFSET";
    return "NVARCHAR(MAX)";
  }

  async addColumn(tableName, columnName, jsValueForTypeInference, isNullable = true) {
    await this.connect();
    const currentSchema = await this.getTableSchema(tableName, true); // force refresh schema
    if (await this.columnExists(tableName, columnName, currentSchema)) {
      return;
    }
    const sqlDataType = this.getSqlTypeFromJs(jsValueForTypeInference, columnName);
    const request = this.pool.request();
    const nullability = isNullable ? "NULL" : "NOT NULL";
    // For NOT NULL columns, we might need a default if adding to existing table with rows, but for sync progress, it's usually new rows or specific updates.
    const query = `ALTER TABLE ${tableName} ADD ${columnName} ${sqlDataType} ${nullability};`;
    console.log(`[DBManager] Adding column ${columnName} (${sqlDataType} ${nullability}) to table ${tableName}... Query: ${query}`);
    try {
        await request.query(query);
        console.log(`[DBManager] Successfully added column ${columnName} to ${tableName}.`);
        if (tableName.toLowerCase() === "syncprogress") await this.getTableSchema(tableName, true); // Refresh cached schema
    } catch (error) {
        console.error(`[DBManager] Error adding column ${columnName} to ${tableName}:`, error.message, error.stack);
        throw error;
    }
  }
  
  async ensureColumnsExist(tableName, dataObject) {
    if (!dataObject || typeof dataObject !== "object") return;
    const currentSchema = await this.getTableSchema(tableName);
    for (const key in dataObject) {
        if (Object.prototype.hasOwnProperty.call(dataObject, key)) {
            const columnName = key.replace(/[^a-zA-Z0-9_]/g, "_"); 
            if (columnName.length === 0) continue;
            if (!await this.columnExists(tableName, columnName, currentSchema)) {
                await this.addColumn(tableName, columnName, dataObject[key]);
            }
        }
    }
    this.entitySchemasChecked[tableName] = true;
  }

  async executeWithIdentityInsert(tableName, operation) {
    await this.connect();
    let identityInsertRequired = false;
    try {
        const schema = await this.getTableSchema(tableName);
        const idColumn = schema.find(col => col.name.toLowerCase() === "id" && col.isIdentity);
        if (idColumn) {
            identityInsertRequired = true;
            console.log(`[DBManager] Identity column detected on ${tableName}. Enabling IDENTITY_INSERT.`);
            await this.pool.request().query(`SET IDENTITY_INSERT ${tableName} ON;`);
        }
        const result = await operation(this.pool.request()); 
        return result;
    } catch (error) {
        console.error(`[DBManager] Error during executeWithIdentityInsert for ${tableName}:`, error.message, error.stack);
        throw error;
    } finally {
        if (identityInsertRequired) {
            try {
                console.log(`[DBManager] Disabling IDENTITY_INSERT for ${tableName}.`);
                await this.pool.request().query(`SET IDENTITY_INSERT ${tableName} OFF;`);
            } catch (setOffError) {
                console.error(`[DBManager] CRITICAL: Failed to disable IDENTITY_INSERT for ${tableName}:`, setOffError.message, setOffError.stack);
            }
        }
    }
  }

  async initializeSyncProgressTable() {
    await this.connect(); // Ensures pool is available
    const tableName = "SyncProgress";
    let schema = await this.getTableSchema(tableName, true); // Force refresh

    const requiredColumns = {
        id: { type: "INT IDENTITY(1,1) NOT NULL PRIMARY KEY", jsValue: 0, isPk: true },
        sync_id: { type: "VARCHAR(255) NOT NULL UNIQUE", jsValue: "sync_id_example" },
        entity_type: { type: "VARCHAR(100) NOT NULL", jsValue: "entity_example" },
        status: { type: "VARCHAR(50) NOT NULL", jsValue: "status_example" },
        start_time: { type: "DATETIMEOFFSET NULL", jsValue: new Date() }, // Preferred name
        end_time: { type: "DATETIMEOFFSET NULL", jsValue: new Date() },
        records_synced: { type: "INT NULL", jsValue: 0 },
        error_message: { type: "NVARCHAR(MAX) NULL", jsValue: "error_example" },
        last_updated: { type: "DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()", jsValue: new Date() }
    };

    const tableExists = schema.length > 0;

    if (!tableExists) {
        console.log(`[DBManager] ${tableName} table does not exist. Creating...`);
        let createTableQuery = `CREATE TABLE [dbo].[${tableName}] (`;
        createTableQuery += Object.entries(requiredColumns).map(([colName, colDef]) => `[${colName}] ${colDef.type}`).join(", ");
        createTableQuery += `);`;
        try {
            await this.pool.request().query(createTableQuery);
            console.log(`[DBManager] ${tableName} table created successfully.`);
            schema = await this.getTableSchema(tableName, true); // Refresh schema after creation
        } catch (error) {
            console.error(`[DBManager] Error creating ${tableName} table:`, error.message, error.stack);
            throw error;
        }
    } else {
        console.log(`[DBManager] ${tableName} table exists. Verifying/updating schema...`);
        for (const [colName, colDef] of Object.entries(requiredColumns)) {
            if (colDef.isPk) continue; // Skip PK, assumed to be correct if table exists
            let actualColName = colName;
            // Handle common variations like started_at vs start_time
            if (colName === "start_time" && !await this.columnExists(tableName, "start_time", schema) && await this.columnExists(tableName, "started_at", schema)) {
                actualColName = "started_at";
                console.log(`[DBManager] Found 'started_at' instead of 'start_time' in ${tableName}. Will use existing.`);
            }
            
            if (!await this.columnExists(tableName, actualColName, schema)) {
                console.log(`[DBManager] Column ${actualColName} (intended as ${colName}) missing in ${tableName}. Adding...`);
                // Use the type from requiredColumns, not jsValue for type inference here as it's predefined
                const typeForAdd = colDef.type.includes("IDENTITY") || colDef.type.includes("PRIMARY KEY") || colDef.type.includes("UNIQUE") || colDef.type.includes("DEFAULT") 
                                 ? colDef.type.split(" ")[0] // Just get base type e.g. INT, VARCHAR(255)
                                 : colDef.type;
                const addQuery = `ALTER TABLE ${tableName} ADD [${colName}] ${typeForAdd.replace(/NOT NULL|NULL/i, "").trim()} NULL;`; // Add as nullable first
                try {
                    await this.pool.request().query(addQuery);
                    console.log(`[DBManager] Added column [${colName}] to ${tableName}.`);
                    schema = await this.getTableSchema(tableName, true); // Refresh schema
                } catch (addError) {
                    console.error(`[DBManager] Error adding column [${colName}] to ${tableName}:`, addError.message);
                }
            }
            // Check nullability for specific columns we expect to write to, e.g. start_time
            const colMeta = schema.find(c => c.name.toLowerCase() === actualColName.toLowerCase());
            if (colMeta && (actualColName === "start_time" || actualColName === "started_at") && !colMeta.isNullable) {
                console.warn(`[DBManager] Column ${actualColName} in ${tableName} is NOT NULL. The code is designed to provide a value for this column during INSERT operations.`);
            }
        }
    }
    this.syncProgressSchema = schema; // Cache the (potentially updated) schema
    console.log("[DBManager] SyncProgress table initialized/verified.");
  }

  async createSyncProgressRecord(syncId, entityType) {
    await this.connect();
    // const schema = this.syncProgressSchema || await this.getTableSchema("SyncProgress"); // Not strictly needed for the hardcoded column name
    // const startTimeCol = schema.some(c => c.name.toLowerCase() === "start_time") ? "start_time" : "started_at"; // Hardcoding to 'started_at'
    const lastUpdatedCol = "last_updated"; // Standardized in initializeSyncProgressTable

    const now = new Date(); // Generate timestamp in JS

    const query = `
      INSERT INTO SyncProgress (sync_id, entity_type, status, [started_at], [${lastUpdatedCol}])
      VALUES (@syncId, @entityType, 'in_progress', @startTimeValue, @lastUpdatedValue);
    `;
    const request = this.pool.request();
    request.input("syncId", sql.VarChar, syncId);
    request.input("entityType", sql.VarChar, entityType);
    request.input("startTimeValue", sql.DateTimeOffset, now); // This value is for 'started_at'
    request.input("lastUpdatedValue", sql.DateTimeOffset, now);
    await request.query(query);
    console.log(`[DBManager] Created SyncProgress record for ${syncId} (${entityType}) using 'started_at' (hardcoded) with explicit timestamp: ${now.toISOString()}`);
  }

  async updateSyncProgressRecord(syncId, status, recordsSynced, errorMessage = null) {
    await this.connect();
    const schema = this.syncProgressSchema || await this.getTableSchema("SyncProgress");
    const endTimeCol = schema.some(c => c.name.toLowerCase() === "end_time") ? "end_time" : "ended_at"; // Assuming ended_at as alternative
    const errorCol = schema.some(c => c.name.toLowerCase() === "error_message") ? "error_message" : null;

    let query = `
      UPDATE SyncProgress 
      SET status = @status, ${endTimeCol} = SYSDATETIMEOFFSET(), records_synced = @recordsSynced, last_updated = SYSDATETIMEOFFSET()
    `;
    if (errorCol && errorMessage !== null) {
      query += `, ${errorCol} = @errorMessage`;
    }
    query += ` WHERE sync_id = @syncId;`;
    
    const request = this.pool.request();
    request.input("syncId", sql.VarChar, syncId);
    request.input("status", sql.VarChar, status);
    request.input("recordsSynced", sql.Int, recordsSynced);
    if (errorCol && errorMessage !== null) {
      request.input("errorMessage", sql.NVarChar, String(errorMessage).substring(0,4000)); // Cap error message length
    }
    await request.query(query);
    console.log(`[DBManager] Updated SyncProgress record for ${syncId} to status ${status}. Error column used: ${errorCol || 'N/A'}`);
  }
  
  async getLastSyncDate(entityType) {
    await this.connect();
    const schema = this.syncProgressSchema || await this.getTableSchema("SyncProgress");
    const endTimeCol = schema.some(c => c.name.toLowerCase() === "end_time") ? "end_time" : "ended_at";

    const query = `
        SELECT MAX(${endTimeCol}) as lastSyncTime 
        FROM SyncProgress 
        WHERE entity_type = @entityType AND status = 'completed';
    `;
    const request = this.pool.request();
    request.input("entityType", sql.VarChar, entityType);
    const result = await request.query(query);
    return result.recordset[0] ? result.recordset[0].lastSyncTime : null;
  }

  async initializeEntitySchema(entityConfig, picqerIdField, picqerNameField) {
    await this.connect();
    const { tableName } = entityConfig;
    const idColName = "id"; // Standardized DB ID column name
    const nameColName = this.sanitizeKeyForSql(picqerNameField || "name");

    const createTableQuery = `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[${tableName}]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[${tableName}](
          [${idColName}] NVARCHAR(255) NOT NULL PRIMARY KEY, 
          [${nameColName}] NVARCHAR(MAX) NULL
        );
        PRINT '${tableName} table created with basic schema (id, ${nameColName}).';
      END
    `;
    try {
      await this.pool.request().query(createTableQuery);
      console.log(`[DBManager] Basic schema for ${tableName} initialized/verified.`);
      // Ensure these base columns actually exist if table was already there
      if (!await this.columnExists(tableName, idColName)) {
          await this.addColumn(tableName, idColName, "string_id_example", false); // ID is NOT NULL
      }
      if (!await this.columnExists(tableName, nameColName)) {
          await this.addColumn(tableName, nameColName, "example_name");
      }
    } catch (error) {
      console.error(`[DBManager] Error initializing basic schema for ${tableName}:`, error.message, error.stack);
      throw error;
    }
  }
  sanitizeKeyForSql(key) { // Duplicated from generic-entity-service for standalone use if needed
    let sanitized = key.replace(/[^a-zA-Z0-9_]/g, "_");
    if (sanitized.match(/^\d/)) sanitized = "_" + sanitized;
    return sanitized.slice(0, 128);
  }
}

module.exports = DatabaseManager;

