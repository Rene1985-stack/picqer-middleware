/**
 * Service Methods Extension
 * 
 * This file adds the missing methods to service classes that are required by the data sync API adapter.
 * These methods include getLastSync, getLastSyncDate, getCountFromDatabase methods, and performIncrementalSync.
 */

const sql = require('mssql');

/**
 * Adds missing methods to all service classes
 * @param {Object} services - Object containing service instances
 * @returns {Object} - The services object with added methods
 */
function addMissingServiceMethods(services) {
  console.log('Adding missing methods to service classes...');
  
  // Add methods to each service
  Object.keys(services).forEach(serviceKey => {
    const service = services[serviceKey];
    const entityType = serviceKey.replace('Service', '').toLowerCase();
    
    // Add getLastSync method
    if (!service.getLastSync) {
      service.getLastSync = async function() {
        try {
          console.log(`Getting last sync date for ${entityType}...`);
          
          // Ensure pool is initialized
          if (!this.pool) {
            console.log(`Initializing pool for getLastSync() in ${entityType}Service...`);
            this.pool = await this.initializePool();
          }
          
          const result = await this.pool.request()
            .input('entityType', sql.VarChar, entityType)
            .query(`
              SELECT TOP 1 last_sync_date
              FROM SyncStatus
              WHERE entity_type = @entityType
              ORDER BY last_sync_date DESC
            `);
          
          if (result.recordset.length > 0) {
            return new Date(result.recordset[0].last_sync_date);
          } else {
            console.log(`No last sync date found for ${entityType}, using default`);
            return new Date(0); // Default to epoch time if no sync has been performed
          }
        } catch (error) {
          console.error(`Error in getLastSync for ${entityType}:`, error.message);
          return new Date(0); // Default to epoch time on error
        }
      };
      console.log(`Added getLastSync method to ${serviceKey}`);
    }
    
    // Add getLastSyncDate method (alias for getLastSync)
    if (!service.getLastSyncDate) {
      service.getLastSyncDate = service.getLastSync;
      console.log(`Added getLastSyncDate method to ${serviceKey}`);
    }
    
    // Add getCountFromDatabase method
    const countMethodName = `get${entityType.charAt(0).toUpperCase() + entityType.slice(1)}CountFromDatabase`;
    if (!service[countMethodName]) {
      service[countMethodName] = async function() {
        try {
          console.log(`Getting ${entityType} count from database...`);
          
          // Ensure pool is initialized
          if (!this.pool) {
            console.log(`Initializing pool for ${countMethodName}() in ${entityType}Service...`);
            this.pool = await this.initializePool();
          }
          
          // Determine table name based on entity type
          let tableName;
          switch (entityType.toLowerCase()) {
            case 'batch':
              tableName = 'Batches';
              break;
            case 'picklist':
              tableName = 'Picklists';
              break;
            case 'warehouse':
              tableName = 'Warehouses';
              break;
            case 'user':
              tableName = 'Users';
              break;
            case 'supplier':
              tableName = 'Suppliers';
              break;
            case 'product':
              tableName = 'Products';
              break;
            default:
              tableName = `${entityType.charAt(0).toUpperCase() + entityType.slice(1)}s`;
          }
          
          const result = await this.pool.request()
            .query(`
              SELECT COUNT(*) AS count
              FROM ${tableName}
            `);
          
          return result.recordset[0].count;
        } catch (error) {
          console.error(`Error in ${countMethodName} for ${entityType}:`, error.message);
          return 0; // Default to 0 on error
        }
      };
      console.log(`Added ${countMethodName} method to ${serviceKey}`);
    }
    
    // Add performIncrementalSync method
    if (!service.performIncrementalSync) {
      service.performIncrementalSync = async function(fullSync = false) {
        try {
          console.log(`Performing ${fullSync ? 'full' : 'incremental'} sync for ${entityType}...`);
          
          // Use the entity-specific sync method if available
          const syncMethodName = `sync${entityType.charAt(0).toUpperCase() + entityType.slice(1)}s`;
          if (typeof this[syncMethodName] === 'function') {
            return await this[syncMethodName](fullSync);
          } else if (typeof this.sync === 'function') {
            return await this.sync(fullSync);
          } else {
            console.error(`No sync method found for ${entityType}`);
            return {
              success: false,
              message: `No sync method found for ${entityType}`
            };
          }
        } catch (error) {
          console.error(`Error in performIncrementalSync for ${entityType}:`, error.message);
          return {
            success: false,
            message: `Error syncing ${entityType}: ${error.message}`,
            error: error.message
          };
        }
      };
      console.log(`Added performIncrementalSync method to ${serviceKey}`);
    }
  });
  
  console.log('All missing methods added to service classes');
  return services;
}

module.exports = {
  addMissingServiceMethods
};
