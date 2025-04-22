const sql = require('mssql');

class WarehouseMetaService {
  constructor(sqlConfig) {
    this.sqlConfig = sqlConfig;
  }

  async initializeWarehousesDatabase() {
    const pool = await sql.connect(this.sqlConfig);
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT * FROM sys.columns 
        WHERE Name = N'email' AND Object_ID = Object_ID(N'Warehouses')
      ) BEGIN
        ALTER TABLE Warehouses ADD email NVARCHAR(255);
      END;
      
      IF NOT EXISTS (
        SELECT * FROM sys.columns 
        WHERE Name = N'last_sync_date' AND Object_ID = Object_ID(N'Warehouses')
      ) BEGIN
        ALTER TABLE Warehouses ADD last_sync_date DATETIME;
      END;

      IF NOT EXISTS (
        SELECT * FROM SyncStatus WHERE entity_name = 'warehouses'
      ) BEGIN
        INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date, last_sync_count, total_count)
        VALUES ('warehouses', 'warehouses', NULL, 0, 0);
      END;
    `);
    console.log('✅ Warehouses table and SyncStatus initialized');
  }

  async getLastSyncDate() {
    const pool = await sql.connect(this.sqlConfig);
    const result = await pool.request().query(`
      SELECT last_sync_date FROM SyncStatus WHERE entity_name = 'warehouses'
    `);
    return result.recordset[0]?.last_sync_date || null;
  }

  async getCount() {
    const pool = await sql.connect(this.sqlConfig);
    const result = await pool.request().query(`SELECT COUNT(*) AS count FROM Warehouses`);
    return result.recordset[0]?.count || 0;
  }
}

module.exports = WarehouseMetaService;
