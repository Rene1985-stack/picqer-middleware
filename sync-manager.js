/**
 * Enhanced Sync Manager with Entity-Specific Attributes
 * 
 * This manager orchestrates the synchronization of all entity types between Picqer and SQL database
 * with support for entity-specific attributes, pagination, and rate limiting.
 */
const EnhancedGenericEntityService = require('./enhanced-generic-entity-service');
const entityConfigs = require('./entity-configs-enhanced');

class EnhancedSyncManager {
  /**
   * Create a new enhanced sync manager
   * @param {Object} apiClient - Picqer API client
   * @param {Object} dbManager - Database manager
   */
  constructor(apiClient, dbManager) {
    this.apiClient = apiClient;
    this.dbManager = dbManager;
    this.entityServices = {};
    
    // Initialize entity services
    this.initializeEntityServices();
  }

  /**
   * Initialize all entity services
   */
  initializeEntityServices() {
    for (const [entityType, config] of Object.entries(entityConfigs)) {
      this.entityServices[entityType] = new EnhancedGenericEntityService(
        config,
        this.apiClient,
        this.dbManager
      );
    }
  }

  /**
   * Sync a specific entity type
   * @param {string} entityType - Entity type to sync
   * @returns {Promise<Object>} - Sync result
   */
  async syncEntity(entityType) {
    if (!this.entityServices[entityType]) {
      return {
        success: false,
        message: `Unknown entity type: ${entityType}`
      };
    }
    
    return this.entityServices[entityType].syncEntities();
  }

  /**
   * Sync all entity types
   * @returns {Promise<Object>} - Sync results
   */
  async syncAll() {
    const results = {};
    
    // Sync each entity type in sequence
    for (const entityType of Object.keys(this.entityServices)) {
      console.log(`Starting sync for ${entityType}...`);
      results[entityType] = await this.syncEntity(entityType);
    }
    
    return {
      success: true,
      message: 'All entity types synced',
      results
    };
  }

  /**
   * Get sync status for all entity types
   * @returns {Promise<Object>} - Sync status
   */
  async getSyncStatus() {
    const status = {};
    
    // Get status for each entity type
    for (const [entityType, service] of Object.entries(this.entityServices)) {
      try {
        const lastSyncDate = await this.dbManager.getLastSyncDate(entityType);
        const count = await service.getCount();
        
        status[entityType] = {
          lastSync: lastSyncDate,
          count
        };
      } catch (error) {
        status[entityType] = {
          error: error.message
        };
      }
    }
    
    return status;
  }
}

module.exports = EnhancedSyncManager;
