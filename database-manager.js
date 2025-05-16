/**
 * Enhanced Database Manager with Support for Identity Column Handling
 * 
 * This manager handles database connections, schema initialization,
 * dynamic column creation, and supports the two-step process for identity columns.
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
        return sql.NVarChar(255);
    }
    if (value === null || value === undefined) return sql.NVarChar(sql.MAX);

    const jsType = typeof value;
    if (jsType === "string") {
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return sql.DateTimeOffset;
      const len = value.length;
      if (len > 4000) return sql.NVarChar(sql.MAX);
      return sql.NVarChar(Math.max(255, len)); // Ensure at least 255, or actual length
    }
    if (jsType === "number") {
        if (Number.isInteger(value)) {
            if (value >= -2147483648 && value <= 2147483647) return sql.Int;
            return sql.BigInt;
        }
        return sql.Float;
    }
    if (jsType === "boolean") return sql.Bit;
    if (value instanceof Date) return sql.DateTimeOffset;

    return sql.NVarChar(sql.MAX);
  }

  async addColumn(tableName, columnName, jsValueForTypeInference, isNullable = true) {
    await this.connect();
    const currentSchema = await this.getTableSchema(tableName, true); // force refresh schema
    if (await this.columnExists(tableName, columnName, currentSchema)) {
      return;
    }
    
    // Get SQL type object from JS value
    const sqlType = this.getSqlTypeFromJs(jsValueForTypeInference, columnName);
    
    // Convert SQL type object to string representation for ALTER TABLE
    let sqlTypeStr;
    if (sqlType === sql.NVarChar(sql.MAX)) {
      sqlTypeStr = "NVARCHAR(MAX)";
    } else if (sqlType === sql.Int) {
      sqlTypeStr = "INT";
    } else if (sqlType === sql.BigInt) {
      sqlTypeStr = "BIGINT";
    } else if (sqlType === sql.Float) {
      sqlTypeStr = "FLOAT";
    } else if (sqlType === sql.Bit) {
      sqlTypeStr = "BIT";
    } else if (sqlType === sql.DateTimeOffset) {
      sqlTypeStr = "DATETIMEOFFSET";
    } else if (sqlType.type && sqlType.type.name === 'NVarChar') {
      sqlTypeStr = `NVARCHAR(${sqlType.length || 255})`;
    } else {
      sqlTypeStr = "NVARCHAR(255)"; // Default fallback
    }
    
    const nullability = isNullable ? "NULL" : "NOT NULL";
    // For NOT NULL columns, we might need a default if adding to existing table with rows, but for sync progress, it's usually new rows or specific updates.
    const query = `ALTER TABLE ${tableName} ADD ${columnName} ${sqlTypeStr} ${nullability};`;
    console.log(`[DBManager] Adding column ${columnName} (${sqlTypeStr} ${nullability}) to table ${tableName}... Query: ${query}`);
    
    try {
        await this.pool.request().query(query);
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
    // Use explicit column name and current timestamp
    const now = new Date();
    
    // Create a transaction for this operation
    const transaction = new sql.Transaction(this.pool);
    
    try {
        await transaction.begin();
        const request = new sql.Request(transaction);
        
        const query = `
          INSERT INTO SyncProgress (sync_id, entity_type, status, [started_at], [last_updated])
          VALUES (@syncId, @entityType, 'in_progress', @startTimeValue, @lastUpdatedValue);
        `;
        
        request.input("syncId", sql.VarChar, syncId);
        request.input("entityType", sql.VarChar, entityType);
        request.input("startTimeValue", sql.DateTimeOffset, now);
        request.input("lastUpdatedValue", sql.DateTimeOffset, now);
        
        await request.query(query);
        await transaction.commit();
        
        console.log(`[DBManager] Created SyncProgress record for ${syncId} (${entityType}) with explicit timestamp: ${now.toISOString()}`);
    } catch (error) {
        try {
            await transaction.rollback();
        } catch (rollbackError) {
            console.error(`[DBManager] Error rolling back transaction:`, rollbackError.message);
        }
        console.error(`[DBManager] Error creating SyncProgress record:`, error.message, error.stack);
        throw error;
    }
  }

  async updateSyncProgressRecord(syncId, status, recordsSynced, errorMessage = null) {
    await this.connect();
    const schema = this.syncProgressSchema || await this.getTableSchema("SyncProgress");
    const endTimeCol = schema.some(c => c.name.toLowerCase() === "end_time") ? "end_time" : "ended_at"; // Assuming ended_at as alternative
    const errorCol = schema.some(c => c.name.toLowerCase() === "error_message") ? "error_message" : null;

    // Create a transaction for this operation
    const transaction = new sql.Transaction(this.pool);
    
    try {
        await transaction.begin();
        const request = new sql.Request(transaction);
        
        let query = `
          UPDATE SyncProgress 
          SET status = @status, ${endTimeCol} = @endTime, records_synced = @recordsSynced, last_updated = @lastUpdated
        `;
        
        if (errorCol && errorMessage !== null) {
          query += `, ${errorCol} = @errorMessage`;
        }
        query += ` WHERE sync_id = @syncId;`;
        
        const now = new Date();
        
        request.input("syncId", sql.VarChar, syncId);
        request.input("status", sql.VarChar, status);
        request.input("endTime", sql.DateTimeOffset, now);
        request.input("recordsSynced", sql.Int, recordsSynced);
        request.input("lastUpdated", sql.DateTimeOffset, now);
        
        if (errorCol && errorMessage !== null) {
          request.input("errorMessage", sql.NVarChar, String(errorMessage).substring(0,4000)); // Cap error message length
        }
        
        await request.query(query);
        await transaction.commit();
        
        console.log(`[DBManager] Updated SyncProgress record for ${syncId} to status ${status}. Error column used: ${errorCol || 'N/A'}`);
    } catch (error) {
        try {
            await transaction.rollback();
        } catch (rollbackError) {
            console.error(`[DBManager] Error rolling back transaction:`, rollbackError.message);
        }
        console.error(`[DBManager] Error updating SyncProgress record:`, error.message, error.stack);
        throw error;
    }
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

    // Create a transaction for this operation
    const transaction = new sql.Transaction(this.pool);
    
    try {
        await transaction.begin();
        const request = new sql.Request(transaction);
        
        // Check if table exists
        const tableExistsResult = await request.query(`
            SELECT OBJECT_ID(N'[dbo].[${tableName}]') AS TableObjectId;
        `);
        
        const tableExists = tableExistsResult.recordset[0].TableObjectId !== null;
        
        if (!tableExists) {
            // Create table with schema that supports both identity and non-identity approaches
            const createTableQuery = `
                CREATE TABLE [dbo].[${tableName}](
                    [${idColName}] INT IDENTITY(1,1) PRIMARY KEY,
                    [picqer_id] NVARCHAR(255) NOT NULL UNIQUE,
                    [${nameColName}] NVARCHAR(MAX) NULL,
                    [last_sync_date] DATETIMEOFFSET NULL,
                    [data] NVARCHAR(MAX) NULL
                );
            `;
            
            await request.query(createTableQuery);
            console.log(`[DBManager] Created table ${tableName} with identity column 'id' and 'picqer_id' for Picqer IDs.`);
        } else {
            // Table exists, check if it has the necessary columns
            const schema = await this.getTableSchema(tableName);
            
            // Check if id column exists and is an identity column
            const idColumn = schema.find(col => col.name.toLowerCase() === "id");
            const hasIdentityColumn = idColumn && idColumn.isIdentity;
            
            if (hasIdentityColumn) {
                console.log(`[DBManager] Table ${tableName} has identity column 'id'.`);
                
                // Check if picqer_id column exists
                const picqerIdExists = schema.some(col => col.name.toLowerCase() === "picqer_id");
                
                if (!picqerIdExists) {
                    console.log(`[DBManager] Adding 'picqer_id' column to ${tableName} for identity column handling.`);
                    await request.query(`
                        ALTER TABLE ${tableName} ADD picqer_id NVARCHAR(255) NULL;
                        CREATE UNIQUE INDEX IX_${tableName}_picqer_id ON ${tableName}(picqer_id) WHERE picqer_id IS NOT NULL;
                    `);
                    console.log(`[DBManager] Added 'picqer_id' column and unique index to ${tableName}.`);
                }
            } else if (idColumn) {
                console.log(`[DBManager] Table ${tableName} has non-identity 'id' column.`);
            } else {
                console.log(`[DBManager] Table ${tableName} exists but doesn't have an 'id' column. This is unusual.`);
            }
        }
        
        await transaction.commit();
        console.log(`[DBManager] Initialized entity schema for ${tableName}.`);
        return true;
    } catch (error) {
        try {
            await transaction.rollback();
        } catch (rollbackError) {
            console.error(`[DBManager] Error rolling back transaction:`, rollbackError.message);
        }
        console.error(`[DBManager] Error initializing entity schema for ${tableName}:`, error.message, error.stack);
        throw error;
    }
  }

  sanitizeKeyForSql(key) {
    if (!key) return "unknown";
    let sanitized = key.replace(/[^a-zA-Z0-9_]/g, "_");
    // SQL Server column names cannot start with a number, so prefix if necessary
    if (sanitized.match(/^\d/)) {
      sanitized = "_" + sanitized;
    }
    return sanitized.slice(0, 128); // Max column name length for SQL Server is 128
  }
}

module.exports = DatabaseManager;
