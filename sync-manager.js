/**
 * Sync Manager
 * 
 * A centralized manager for orchestrating synchronization operations
 * between Picqer and SQL database.
 */
const { v4: uuidv4 } = require('uuid');

class SyncManager {
  /**
   * Create a new sync manager
   * @param {Object} apiClient - Picqer API client
   * @param {Object} dbManager - Database manager
   */
  constructor(apiClient, dbManager) {
    this.apiClient = apiClient;
    this.dbManager = dbManager;
    this.entityServices = {};
  }

  /**
   * Register an entity service for a specific entity type
   * @param {string} entityType - Entity type
   * @param {Object} entityService - Entity service instance
   */
  registerEntityService(entityType, entityService) {
    this.entityServices[entityType] = entityService;
    console.log(`Registered ${entityType} service`);
  }

  /**
   * Initialize all registered entity services
   * @returns {Promise<boolean>} - Success status
   */
  async initialize() {
    try {
      console.log('Initializing all entity services...');
      
      for (const [entityType, service] of Object.entries(this.entityServices)) {
        await service.initialize();
      }
      
      console.log('All entity services initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing entity services:', error.message);
      return false;
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
        message: `Entity type ${entityType} not registered`,
        error: 'Entity type not registered'
      };
    }
    
    try {
      return await this.entityServices[entityType].syncEntities();
    } catch (error) {
      console.error(`Error syncing ${entityType}:`, error.message);
      return {
        success: false,
        message: `Error syncing ${entityType}: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Sync all registered entity types
   * @returns {Promise<Object>} - Sync results for all entity types
   */
  async syncAll() {
    console.log('Starting sync for all entity types...');
    
    const results = {};
    const syncId = `all_${Date.now()}`;
    
    try {
      // Create sync progress record for all entities
      await this.dbManager.createSyncProgressRecord(syncId, 'all');
      
      // Sync each entity type
      for (const [entityType, service] of Object.entries(this.entityServices)) {
        console.log(`Syncing ${entityType}...`);
        results[entityType] = await this.syncEntity(entityType);
      }
      
      // Calculate total count
      const totalCount = Object.values(results).reduce((total, result) => {
        return total + (result.count || 0);
      }, 0);
      
      // Update sync progress
      await this.dbManager.updateSyncProgressRecord(syncId, 'completed', totalCount);
      
      console.log('All entity types synced successfully');
      return {
        success: true,
        message: `Synced ${totalCount} entities across all entity types`,
        results
      };
    } catch (error) {
      console.error('Error syncing all entity types:', error.message);
      
      // Update sync progress with error
      await this.dbManager.updateSyncProgressRecord(syncId, 'failed', 0, error.message);
      
      return {
        success: false,
        message: `Error syncing all entity types: ${error.message}`,
        error: error.message,
        results
      };
    }
  }

  /**
   * Get sync status for all entity types
   * @returns {Promise<Object>} - Sync status for all entity types
   */
  async getSyncStatus() {
    try {
      const status = {};
      
      // Get last sync date for each entity type
      for (const entityType of Object.keys(this.entityServices)) {
        const lastSyncDate = await this.dbManager.getLastSyncDate(entityType);
        const count = await this.entityServices[entityType].getCount();
        
        status[entityType] = {
          lastSyncDate,
          count
        };
      }
      
      return {
        success: true,
        status
      };
    } catch (error) {
      console.error('Error getting sync status:', error.message);
      return {
        success: false,
        message: `Error getting sync status: ${error.message}`,
        error: error.message
      };
    }
  }
}

module.exports = SyncManager;
