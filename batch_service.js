class BatchService {
  constructor(sql, picqerService) {
    this.sql = sql;
    this.picqerService = picqerService;
    this.tableName = 'Batches';
  }

  /**
   * Sync batches from Picqer API to database
   */
  async syncBatches() {
    try {
      console.log('Starting batches sync...');
      
      // Get last sync date
      const lastSyncDate = await this.getLastSyncDate();
      
      // Fetch batches from Picqer API
      const batches = await this.picqerService.getBatches(lastSyncDate);
      
      if (!batches || batches.length === 0) {
        console.log('No new batches to sync');
        return { success: true, synced: 0, message: 'No new batches' };
      }

      // Process and save batches
      let syncedCount = 0;
      for (const batch of batches) {
        await this.saveBatch(batch);
        syncedCount++;
      }

      console.log(`Successfully synced ${syncedCount} batches`);
      return { 
        success: true, 
        synced: syncedCount, 
        message: `Synced ${syncedCount} batches` 
      };

    } catch (error) {
      console.error('Error syncing batches:', error);
      throw error;
    }
  }

  /**
   * Save or update a batch in the database
   */
  async saveBatch(batchData) {
    try {
      const request = new this.sql.Request();
      
      // Check if batch exists
      const existingQuery = `
        SELECT idbatch FROM ${this.tableName} 
        WHERE idbatch = @idbatch
      `;
      
      request.input('idbatch', this.sql.Int, batchData.idbatch);
      const existingResult = await request.query(existingQuery);

      if (existingResult.recordset.length > 0) {
        // Update existing batch
        await this.updateBatch(batchData);
      } else {
        // Insert new batch
        await this.insertBatch(batchData);
      }

    } catch (error) {
      console.error('Error saving batch:', error);
      throw error;
    }
  }

  /**
   * Insert new batch
   */
  async insertBatch(data) {
    const request = new this.sql.Request();
    
    const insertQuery = `
      INSERT INTO ${this.tableName} (
        idbatch, batch_reference, status, created_at, 
        updated_at, idproduct, quantity, last_sync_date
      ) VALUES (
        @idbatch, @batch_reference, @status, @created_at,
        @updated_at, @idproduct, @quantity, @last_sync_date
      )
    `;

    const last_sync_date = new Date();

    request.input('idbatch', this.sql.Int, data.idbatch);
    request.input('batch_reference', this.sql.NVarChar, data.batch_reference || '');
    request.input('status', this.sql.NVarChar, data.status || 'active');
    request.input('created_at', this.sql.DateTime, new Date(data.created_at || Date.now()));
    request.input('updated_at', this.sql.DateTime, new Date(data.updated_at || Date.now()));
    request.input('idproduct', this.sql.Int, data.idproduct || null);
    request.input('quantity', this.sql.Int, data.quantity || 0);
    request.input('last_sync_date', this.sql.DateTime, last_sync_date);

    await request.query(insertQuery);
  }

  /**
   * Update existing batch
   */
  async updateBatch(data) {
    const request = new this.sql.Request();
    
    const updateQuery = `
      UPDATE ${this.tableName} SET
        batch_reference = @batch_reference,
        status = @status,
        updated_at = @updated_at,
        idproduct = @idproduct,
        quantity = @quantity,
        last_sync_date = @last_sync_date
      WHERE idbatch = @idbatch
    `;

    const last_sync_date = new Date();

    request.input('idbatch', this.sql.Int, data.idbatch);
    request.input('batch_reference', this.sql.NVarChar, data.batch_reference || '');
    request.input('status', this.sql.NVarChar, data.status || 'active');
    request.input('updated_at', this.sql.DateTime, new Date(data.updated_at || Date.now()));
    request.input('idproduct', this.sql.Int, data.idproduct || null);
    request.input('quantity', this.sql.Int, data.quantity || 0);
    request.input('last_sync_date', this.sql.DateTime, last_sync_date);

    await request.query(updateQuery);
  }

  /**
   * Get last sync date for incremental sync
   */
  async getLastSyncDate() {
    try {
      const request = new this.sql.Request();
      const query = `
        SELECT MAX(last_sync_date) as last_sync_date 
        FROM ${this.tableName}
      `;
      const result = await request.query(query);
      return result.recordset[0]?.last_sync_date || null;
    } catch (error) {
      console.error('Error getting last sync date:', error);
      return null;
    }
  }
}

module.exports = BatchService;

