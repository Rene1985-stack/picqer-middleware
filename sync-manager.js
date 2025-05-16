/**
 * Sync Manager for Picqer to SQL Synchronization
 * 
 * This manager orchestrates the synchronization of entities between Picqer and SQL.
 * It provides a clean API for triggering syncs and checking sync status.
 */
const GenericEntityService = require('./generic-entity-service');
const entityConfigs = require('./entity-configs');

class SyncManager {
  constructor(apiClient, dbManager) {
    this.apiClient = apiClient;
    this.dbManager = dbManager;
    this.entityServices = {};
    
    // Initialize entity services
    for (const [entityType, config] of Object.entries(entityConfigs)) {
      this.entityServices[entityType] = new GenericEntityService(
        config, 
        this.apiClient, 
        this.dbManager
      );
    }
    
    console.log('[SyncManager] Initialized with entity types:', Object.keys(this.entityServices).join(', '));
  }

  /**
   * Sync a specific entity type
   * @param {string} entityType - Type of entity to sync
   * @returns {Promise<Object>} - Sync result
   */
  async syncEntity(entityType) {
    console.log(`[SyncManager] Starting sync for entity type: ${entityType}`);
    
    if (!this.entityServices[entityType]) {
      const errorMsg = `Entity type '${entityType}' not configured`;
      console.error(`[SyncManager] ${errorMsg}`);
      return { 
        success: false, 
        message: errorMsg,
        entityType
      };
    }
    
    try {
      const result = await this.entityServices[entityType].syncEntities();
      console.log(`[SyncManager] Completed sync for ${entityType}:`, result);
      return {
        ...result,
        entityType
      };
    } catch (error) {
      console.error(`[SyncManager] Error syncing ${entityType}:`, error.message, error.stack);
      return {
        success: false,
        message: `Error syncing ${entityType}: ${error.message}`,
        error: error.message,
        entityType
      };
    }
  }

  /**
   * Sync all configured entity types
   * @returns {Promise<Object>} - Sync results for all entities
   */
  async syncAll() {
    console.log('[SyncManager] Starting sync for all entity types');
    
    const results = {};
    const entityTypes = Object.keys(this.entityServices);
    
    for (const entityType of entityTypes) {
      console.log(`[SyncManager] Syncing ${entityType} (${entityTypes.indexOf(entityType) + 1}/${entityTypes.length})`);
      results[entityType] = await this.syncEntity(entityType);
    }
    
    console.log('[SyncManager] Completed sync for all entity types');
    return {
      success: Object.values(results).every(r => r.success),
      results
    };
  }

  /**
   * Get sync status for all entity types
   * @returns {Promise<Object>} - Status for all entities
   */
  async getSyncStatus() {
    console.log('[SyncManager] Getting sync status for all entity types');
    
    const status = {};
    const entityTypes = Object.keys(this.entityServices);
    
    for (const entityType of entityTypes) {
      try {
        // Get last sync date from SyncProgress table
        const lastSync = await this.dbManager.getLastSyncDate(entityType);
        
        // Get count of records in entity table
        const count = await this.entityServices[entityType].getCount();
        
        status[entityType] = {
          lastSync: lastSync ? lastSync.toISOString() : null,
          count
        };
      } catch (error) {
        console.error(`[SyncManager] Error getting status for ${entityType}:`, error.message);
        status[entityType] = { error: error.message };
      }
    }
    
    console.log('[SyncManager] Completed getting sync status');
    return status;
  }

  /**
   * Get available entity types
   * @returns {Array<string>} - List of entity types
   */
  getEntityTypes() {
    return Object.keys(this.entityServices);
  }
}

module.exports = SyncManager;
