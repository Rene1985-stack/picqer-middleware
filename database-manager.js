/**
 * Database Manager with Dynamic Schema Handling
 * 
 * This manager handles database connections, schema initialization,
 * dynamic column creation, and IDENTITY_INSERT for SQL Server.
 */
const sql = require("mssql");

class DatabaseManager {
  constructor(dbConfig) {
    this.dbConfig = dbConfig;
    this.pool = null;
    this.connecting = false;
    this.entitySchemasChecked = {}; // To track if schema (columns) for an entity table has been checked/created in this session
    console.log("[DBManager] Initialized with config.");
  }

  async connect() {
    if (this.pool && this.pool.connected) {
      // console.log("[DBManager] Already connected.");
      return this.pool;
    }
    if (this.connecting) {
      console.log("[DBManager] Connection attempt in progress, waiting...");
      return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
          if (!this.connecting) {
            clearInterval(interval);
            if (this.pool && this.pool.connected) {
              resolve(this.pool);
            } else {
              reject(new Error("[DBManager] Failed to connect after waiting."));
            }
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
        this.pool = null; // Reset pool on error
      });
      this.connecting = false;
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

  async getTableSchema(tableName) {
    await this.connect();
    const request = this.pool.request();
    const query = `
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMNPROPERTY(OBJECT_ID(TABLE_SCHEMA + '.' + TABLE_NAME), COLUMN_NAME, 'IsIdentity') AS IS_IDENTITY
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = @tableName;
    `;
    request.input("tableName", sql.NVarChar, tableName);
    const result = await request.query(query);
    return result.recordset.map(col => ({
      name: col.COLUMN_NAME,
      type: col.DATA_TYPE,
      isNullable: col.IS_NULLABLE === "YES",
      isIdentity: col.IS_IDENTITY === 1
    }));
  }

  async columnExists(tableName, columnName) {
    const schema = await this.getTableSchema(tableName);
    return schema.some(col => col.name.toLowerCase() === columnName.toLowerCase());
  }

  getSqlTypeFromJs(value, columnName) {
    if (columnName && (columnName.toLowerCase() === "id" || columnName.toLowerCase().endsWith("id"))) {
        // Picqer IDs can be long, ensure NVarChar for IDs
        return "NVARCHAR(255)"; 
    }
    if (value === null || value === undefined) return "NVARCHAR(MAX)"; // Default for nulls
    const jsType = typeof value;
    if (jsType === "string") {
      if (value.length > 4000) return "NVARCHAR(MAX)";
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return "DATETIMEOFFSET";
      return `NVARCHAR(${Math.max(255, value.length * 2)})`; // Dynamic length for strings
    }
    if (jsType === "number") return Number.isInteger(value) ? "BIGINT" : "FLOAT"; // Use BIGINT for integers
    if (jsType === "boolean") return "BIT";
    if (value instanceof Date) return "DATETIMEOFFSET";
    return "NVARCHAR(MAX)"; // Default for complex types or unknown
  }

  async addColumn(tableName, columnName, jsValueForTypeInference) {
    await this.connect();
    if (await this.columnExists(tableName, columnName)) {
      // console.log(`[DBManager] Column ${columnName} already exists in ${tableName}.`);
      return;
    }
    const sqlDataType = this.getSqlTypeFromJs(jsValueForTypeInference, columnName);
    const request = this.pool.request();
    const query = `ALTER TABLE ${tableName} ADD ${columnName} ${sqlDataType} NULL;`; // Add new columns as NULLable
    console.log(`[DBManager] Adding column ${columnName} (${sqlDataType}) to table ${tableName}... Query: ${query}`);
    try {
        await request.query(query);
        console.log(`[DBManager] Successfully added column ${columnName} to ${tableName}.`);
    } catch (error) {
        console.error(`[DBManager] Error adding column ${columnName} to ${tableName}:`, error.message, error.stack);
        throw error;
    }
  }
  
  async ensureColumnsExist(tableName, dataObject) {
    // console.log(`[DBManager] Ensuring columns for ${tableName} based on data:`, dataObject);
    if (!dataObject || typeof dataObject !== "object") return;
    for (const key in dataObject) {
        if (Object.prototype.hasOwnProperty.call(dataObject, key)) {
            // Sanitize column name (basic example, might need more robust sanitization)
            const columnName = key.replace(/[^a-zA-Z0-9_]/g, "_"); 
            if (columnName.length === 0) continue;

            // Check if column exists, if not, add it
            if (!await this.columnExists(tableName, columnName)) {
                await this.addColumn(tableName, columnName, dataObject[key]);
            }
        }
    }
    this.entitySchemasChecked[tableName] = true; // Mark as checked for this session
  }

  async executeWithIdentityInsert(tableName, operation) {
    await this.connect();
    const request = this.pool.request();
    let identityInsertRequired = false;
    try {
        const schema = await this.getTableSchema(tableName);
        const idColumn = schema.find(col => col.name.toLowerCase() === "id" && col.isIdentity);
        if (idColumn) {
            identityInsertRequired = true;
            console.log(`[DBManager] Identity column detected on ${tableName}. Enabling IDENTITY_INSERT.`);
            await request.query(`SET IDENTITY_INSERT ${tableName} ON;`);
        }
        const result = await operation(request); // Pass request to the operation
        return result;
    } catch (error) {
        console.error(`[DBManager] Error during executeWithIdentityInsert for ${tableName}:`, error.message, error.stack);
        throw error; // Re-throw to be caught by calling function
    } finally {
        if (identityInsertRequired) {
            try {
                console.log(`[DBManager] Disabling IDENTITY_INSERT for ${tableName}.`);
                // Use a new request for the final SET OFF, in case the original request in operation failed
                await this.pool.request().query(`SET IDENTITY_INSERT ${tableName} OFF;`);
            } catch (setOffError) {
                console.error(`[DBManager] CRITICAL: Failed to disable IDENTITY_INSERT for ${tableName}:`, setOffError.message, setOffError.stack);
                // This is a critical error, as it leaves IDENTITY_INSERT ON for the connection.
            }
        }
    }
  }

  // --- SyncProgress Table Methods (kept from previous versions for consistency) ---
  async initializeSyncProgressTable() {
    await this.connect();
    const query = `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SyncProgress]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[SyncProgress](
          [id] [int] IDENTITY(1,1) NOT NULL,
          [sync_id] [varchar](255) NOT NULL UNIQUE,
          [entity_type] [varchar](100) NOT NULL,
          [status] [varchar](50) NOT NULL,
          [start_time] [datetimeoffset](7) NULL,
          [end_time] [datetimeoffset](7) NULL,
          [records_synced] [int] NULL,
          [error_message] [nvarchar](max) NULL,
          [last_updated] [datetimeoffset](7) DEFAULT SYSDATETIMEOFFSET(),
          CONSTRAINT [PK_SyncProgress] PRIMARY KEY CLUSTERED ([id] ASC)
        );
        PRINT 'SyncProgress table created.';
      END
      ELSE
      BEGIN
        -- Ensure all columns exist, add if not (example for last_updated)
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'last_updated' AND Object_ID = Object_ID(N'SyncProgress'))
        BEGIN
            ALTER TABLE SyncProgress ADD last_updated DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET();
            PRINT 'Added last_updated to SyncProgress table.';
        END
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'start_time' AND Object_ID = Object_ID(N'SyncProgress'))
        BEGIN
            ALTER TABLE SyncProgress ADD start_time DATETIMEOFFSET NULL;
            PRINT 'Added start_time to SyncProgress table.';
        END
         IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'end_time' AND Object_ID = Object_ID(N'SyncProgress'))
        BEGIN
            ALTER TABLE SyncProgress ADD end_time DATETIMEOFFSET NULL;
            PRINT 'Added end_time to SyncProgress table.';
        END
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'records_synced' AND Object_ID = Object_ID(N'SyncProgress'))
        BEGIN
            ALTER TABLE SyncProgress ADD records_synced INT NULL;
            PRINT 'Added records_synced to SyncProgress table.';
        END
         IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'error_message' AND Object_ID = Object_ID(N'SyncProgress'))
        BEGIN
            ALTER TABLE SyncProgress ADD error_message NVARCHAR(MAX) NULL;
            PRINT 'Added error_message to SyncProgress table.';
        END
      END
    `;
    try {
      await this.pool.request().query(query);
      console.log("[DBManager] SyncProgress table initialized/verified.");
    } catch (error) {
      console.error("[DBManager] Error initializing SyncProgress table:", error.message, error.stack);
      throw error;
    }
  }

  async createSyncProgressRecord(syncId, entityType) {
    await this.connect();
    const query = `
      INSERT INTO SyncProgress (sync_id, entity_type, status, start_time, last_updated)
      VALUES (@syncId, @entityType, 'in_progress', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
    `;
    const request = this.pool.request();
    request.input("syncId", sql.VarChar, syncId);
    request.input("entityType", sql.VarChar, entityType);
    await request.query(query);
  }

  async updateSyncProgressRecord(syncId, status, recordsSynced, errorMessage = null) {
    await this.connect();
    const query = `
      UPDATE SyncProgress 
      SET status = @status, end_time = SYSDATETIMEOFFSET(), records_synced = @recordsSynced, error_message = @errorMessage, last_updated = SYSDATETIMEOFFSET()
      WHERE sync_id = @syncId;
    `;
    const request = this.pool.request();
    request.input("syncId", sql.VarChar, syncId);
    request.input("status", sql.VarChar, status);
    request.input("recordsSynced", sql.Int, recordsSynced);
    request.input("errorMessage", sql.NVarChar, errorMessage);
    await request.query(query);
  }
  
  async getLastSyncDate(entityType) {
    // This method might need adjustment if we are always doing full syncs
    // or if the definition of "last sync" changes with dynamic schema.
    // For now, it reflects the last successful completion.
    await this.connect();
    const query = `
        SELECT MAX(end_time) as lastSyncTime 
        FROM SyncProgress 
        WHERE entity_type = @entityType AND status = 'completed';
    `;
    const request = this.pool.request();
    request.input("entityType", sql.VarChar, entityType);
    const result = await request.query(query);
    return result.recordset[0] ? result.recordset[0].lastSyncTime : null;
  }

  async updateSyncStatus(entityType) { // This seems redundant if SyncProgress is the main tracker
    // console.log(`[DBManager] updateSyncStatus called for ${entityType}, but SyncProgress is primary.`);
    return Promise.resolve();
  }

  // Method to initialize entity table (basic structure, dynamic columns added later)
  async initializeEntitySchema(entityConfig) {
    await this.connect();
    const { tableName, idField, nameField } = entityConfig;
    // Ensure primary ID and a name column exist, other columns will be added dynamically
    const idColName = idField.split(".").pop().replace(/[^a-zA-Z0-9_]/g, "_") || "id";
    const nameColName = nameField.split(".").pop().replace(/[^a-zA-Z0-9_]/g, "_") || "name";

    const createTableQuery = `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[${tableName}]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[${tableName}](
          [${idColName}] NVARCHAR(255) NOT NULL PRIMARY KEY, 
          [${nameColName}] NVARCHAR(MAX) NULL
          -- Other columns will be added dynamically by ensureColumnsExist
        );
        PRINT '${tableName} table created with basic schema (id, name).';
      END
    `;
    try {
      await this.pool.request().query(createTableQuery);
      console.log(`[DBManager] Basic schema for ${tableName} initialized/verified.`);
      // Now ensure these base columns actually exist if table was already there
      if (!await this.columnExists(tableName, idColName)) {
          await this.addColumn(tableName, idColName, "string_id_example");
      }
      if (!await this.columnExists(tableName, nameColName)) {
          await this.addColumn(tableName, nameColName, "example_name");
      }

    } catch (error) {
      console.error(`[DBManager] Error initializing basic schema for ${tableName}:`, error.message, error.stack);
      throw error;
    }
  }
}

module.exports = DatabaseManager;

