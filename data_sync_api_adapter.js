class DataSyncApiAdapter {
  constructor(sql, services) {
    this.sql = sql;
    this.services = services;
  }

  /**
   * Sync all entities
   */
  async syncAll() {
    try {
      console.log('Starting full synchronization...');
      
      const results = {
        timestamp: new Date().toISOString(),
        results: {}
      };

      // Sync each entity type
      const entityTypes = [
        'purchaseOrderService',
        'receiptService',
        'picklistService', 
        'warehouseService',
        'userService',
        'supplierService',
        'batchService'
      ];

      for (const serviceType of entityTypes) {
        const service = this.services[serviceType];
        if (service && typeof service.sync === 'function') {
          try {
            const syncMethod = this.getSyncMethod(serviceType);
            if (syncMethod && typeof service[syncMethod] === 'function') {
              results.results[serviceType] = await service[syncMethod]();
            }
          } catch (error) {
            console.error(`Error syncing ${serviceType}:`, error);
            results.results[serviceType] = {
              success: false,
              error: error.message
            };
          }
        }
      }

      console.log('Full synchronization completed');
      return results;

    } catch (error) {
      console.error('Error in full sync:', error);
      throw error;
    }
  }

  /**
   * Get the appropriate sync method name for each service
   */
  getSyncMethod(serviceType) {
    const syncMethods = {
      'purchaseOrderService': 'syncPurchaseOrders',
      'receiptService': 'syncReceipts',
      'picklistService': 'syncPicklists',
      'warehouseService': 'syncWarehouses',
      'userService': 'syncUsers',
      'supplierService': 'syncSuppliers',
      'batchService': 'syncBatches'
    };

    return syncMethods[serviceType];
  }

  /**
   * Get sync statistics
   */
  async getSyncStats() {
    try {
      const stats = {
        timestamp: new Date().toISOString(),
        entities: {}
      };

      // Get stats for each entity type
      const tables = ['PurchaseOrders', 'Receipts', 'Picklists', 'Warehouses', 'Users', 'Suppliers', 'Batches'];
      
      for (const table of tables) {
        try {
          const request = new this.sql.Request();
          const query = `
            SELECT 
              COUNT(*) as total_records,
              MAX(last_sync_date) as last_sync_date,
              MIN(created_at) as oldest_record,
              MAX(created_at) as newest_record
            FROM ${table}
          `;
          const result = await request.query(query);
          stats.entities[table] = result.recordset[0];
        } catch (error) {
          stats.entities[table] = { error: `Table ${table} not found or accessible` };
        }
      }

      return stats;

    } catch (error) {
      console.error('Error getting sync stats:', error);
      throw error;
    }
  }
}

module.exports = DataSyncApiAdapter;

