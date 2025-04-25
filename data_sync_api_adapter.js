/**
 * Fixed Data Sync API Adapter
 * 
 * This adapter connects the dashboard to the actual sync implementation,
 * ensuring that when sync buttons are clicked, real data is synced from
 * Picqer to the database.
 * 
 * FIXED:
 * 1. Properly initializes with the provided syncImplementation instance
 * 2. Handles service naming consistency (ProductService vs PicklistService)
 * 3. Removed batch-specific metrics endpoints that were causing issues
 */

const express = require('express');
const router = express.Router();

// Store service instances and sync implementation
let services = {};
let syncImplementation;

// Initialize services with dependency injection
function initializeServices(serviceInstances, syncImpl) {
  services = serviceInstances || {};
  
  // Store the provided syncImplementation instance
  syncImplementation = syncImpl;
  
  console.log('Data Sync API adapter initialized with services and sync implementation');
}

// Helper function to safely call a method if it exists
function safeMethodCall(service, methodName, fallbackValue, ...args) {
  if (service && typeof service[methodName] === 'function') {
    try {
      return service[methodName](...args);
    } catch (error) {
      console.log(`Error calling ${methodName}: ${error.message}`);
      return Promise.resolve(fallbackValue);
    }
  }
  console.log(`Method ${methodName} not found in service, using fallback value`);
  return Promise.resolve(fallbackValue);
}

// Status endpoint - maps /api/status to check if the API is online
router.get('/status', async (req, res) => {
  try {
    res.json({ 
      online: true, 
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in status endpoint:', error);
    res.status(500).json({ 
      online: false, 
      error: error.message 
    });
  }
});

// Stats endpoint - maps /api/stats to fetch real stats from services
router.get('/stats', async (req, res) => {
  try {
    // Check if syncImplementation is available
    if (!syncImplementation) {
      throw new Error('Sync implementation not initialized');
    }
    
    // Get real stats from services with fallbacks for missing methods
    const stats = {
      products: {
        totalCount: await safeMethodCall(syncImplementation, 'getEntityCount', 0, 'products'),
        lastSyncDate: await safeMethodCall(syncImplementation, 'getLastSyncDate', new Date().toISOString(), 'products'),
        status: 'Ready',
        lastSyncCount: 0
      },
      picklists: {
        totalCount: await safeMethodCall(syncImplementation, 'getEntityCount', 0, 'picklists'),
        lastSyncDate: await safeMethodCall(syncImplementation, 'getLastSyncDate', new Date().toISOString(), 'picklists'),
        status: 'Ready',
        lastSyncCount: 0
      },
      warehouses: {
        totalCount: await safeMethodCall(syncImplementation, 'getEntityCount', 0, 'warehouses'),
        lastSyncDate: await safeMethodCall(syncImplementation, 'getLastSyncDate', new Date().toISOString(), 'warehouses'),
        status: 'Ready',
        lastSyncCount: 0
      },
      users: {
        totalCount: await safeMethodCall(syncImplementation, 'getEntityCount', 0, 'users'),
        lastSyncDate: await safeMethodCall(syncImplementation, 'getLastSyncDate', new Date().toISOString(), 'users'),
        status: 'Ready',
        lastSyncCount: 0
      },
      suppliers: {
        totalCount: await safeMethodCall(syncImplementation, 'getEntityCount', 0, 'suppliers'),
        lastSyncDate: await safeMethodCall(syncImplementation, 'getLastSyncDate', new Date().toISOString(), 'suppliers'),
        status: 'Ready',
        lastSyncCount: 0
      },
      batches: {
        totalCount: await safeMethodCall(syncImplementation, 'getEntityCount', 0, 'batches'),
        lastSyncDate: await safeMethodCall(syncImplementation, 'getLastSyncDate', new Date().toISOString(), 'batches'),
        status: 'Ready',
        lastSyncCount: 0
      }
    };
    
    res.json({ 
      success: true, 
      stats,
      syncProgress: null
    });
  } catch (error) {
    console.error('Error in stats endpoint:', error);
    
    // Fallback to sample data if error occurs
    const stats = {
      products: {
        totalCount: 0,
        lastSyncDate: new Date().toISOString(),
        status: 'Ready',
        lastSyncCount: 0
      },
      picklists: {
        totalCount: 0,
        lastSyncDate: new Date().toISOString(),
        status: 'Ready',
        lastSyncCount: 0
      },
      warehouses: {
        totalCount: 0,
        lastSyncDate: new Date().toISOString(),
        status: 'Ready',
        lastSyncCount: 0
      },
      users: {
        totalCount: 0,
        lastSyncDate: new Date().toISOString(),
        status: 'Ready',
        lastSyncCount: 0
      },
      suppliers: {
        totalCount: 0,
        lastSyncDate: new Date().toISOString(),
        status: 'Ready',
        lastSyncCount: 0
      },
      batches: {
        totalCount: 0,
        lastSyncDate: new Date().toISOString(),
        status: 'Ready',
        lastSyncCount: 0
      }
    };
    
    res.json({ 
      success: false, 
      error: `Error fetching stats: ${error.message}`,
      stats,
      syncProgress: null
    });
  }
});

// Logs endpoint - maps /api/logs to your logging system
router.get('/logs', async (req, res) => {
  try {
    // This would typically fetch logs from your database
    // For now, return some sample logs
    const logs = [
      { 
        level: 'info', 
        message: 'System started', 
        timestamp: new Date(Date.now() - 3600000).toISOString() 
      },
      { 
        level: 'success', 
        message: 'Product sync completed successfully', 
        timestamp: new Date(Date.now() - 1800000).toISOString() 
      },
      { 
        level: 'warning', 
        message: 'Slow database response detected', 
        timestamp: new Date(Date.now() - 900000).toISOString() 
      },
      { 
        level: 'error', 
        message: 'Error connecting to Picqer API: Rate limit exceeded', 
        timestamp: new Date(Date.now() - 300000).toISOString() 
      },
      { 
        level: 'info', 
        message: 'Dashboard accessed', 
        timestamp: new Date().toISOString() 
      }
    ];
    
    res.json({ 
      success: true, 
      logs 
    });
  } catch (error) {
    console.error('Error in logs endpoint:', error);
    res.status(500).json({ 
      success: false, 
      error: `Error fetching logs: ${error.message}` 
    });
  }
});

// Clear logs endpoint
router.post('/logs/clear', async (req, res) => {
  try {
    // This would typically clear your logging system
    // For now, just return success
    res.json({ 
      success: true, 
      message: 'Logs cleared successfully' 
    });
  } catch (error) {
    console.error('Error in clear logs endpoint:', error);
    res.status(500).json({ 
      success: false, 
      error: `Error clearing logs: ${error.message}` 
    });
  }
});

// History endpoint - maps /api/history to your sync history
router.get('/history', async (req, res) => {
  try {
    // This would typically fetch sync history from your database
    // For now, return some sample history
    const history = [
      { 
        sync_id: 'products_1650123456789', 
        entity_type: 'products', 
        timestamp: new Date(Date.now() - 86400000).toISOString(), 
        success: true, 
        count: 6710 
      },
      { 
        sync_id: 'picklists_1650123456790', 
        entity_type: 'picklists', 
        timestamp: new Date(Date.now() - 43200000).toISOString(), 
        success: true, 
        count: 150 
      },
      { 
        sync_id: 'warehouses_1650123456791', 
        entity_type: 'warehouses', 
        timestamp: new Date(Date.now() - 21600000).toISOString(), 
        success: true, 
        count: 3 
      },
      { 
        sync_id: 'users_1650123456792', 
        entity_type: 'users', 
        timestamp: new Date(Date.now() - 10800000).toISOString(), 
        success: true, 
        count: 15 
      },
      { 
        sync_id: 'suppliers_1650123456793', 
        entity_type: 'suppliers', 
        timestamp: new Date(Date.now() - 3600000).toISOString(), 
        success: false, 
        count: 0,
        error: 'API connection timeout' 
      },
      { 
        sync_id: 'batches_1650123456794', 
        entity_type: 'batches', 
        timestamp: new Date(Date.now() - 1800000).toISOString(), 
        success: true, 
        count: 25 
      }
    ];
    
    res.json({ 
      success: true, 
      history 
    });
  } catch (error) {
    console.error('Error in history endpoint:', error);
    res.status(500).json({ 
      success: false, 
      error: `Error fetching history: ${error.message}` 
    });
  }
});

// Sync endpoints - map /api/sync to your sync system
router.post('/sync', async (req, res) => {
  try {
    console.log('Sync request received - triggering actual sync for all entities');
    
    // Check if syncImplementation is available
    if (!syncImplementation) {
      throw new Error('Sync implementation not initialized');
    }
    
    // Determine if this is a full sync
    const fullSync = req.query.full === 'true';
    
    // Start sync process in background
    console.log(`Starting ${fullSync ? 'full' : 'incremental'} sync for all entities`);
    
    // Use the syncAll method of the syncImplementation
    syncImplementation.syncAll(fullSync)
      .catch(error => {
        console.error('Error in sync all:', error.message);
      });
    
    // Return success immediately since sync is running in background
    res.json({
      success: true,
      message: `${fullSync ? 'Full' : 'Incremental'} sync started for all entities`,
      background: true
    });
  } catch (error) {
    console.error('Error in sync endpoint:', error);
    res.status(500).json({ 
      success: false, 
      error: `Error triggering sync: ${error.message}` 
    });
  }
});

// Entity-specific sync endpoints
router.post('/sync/:entity', async (req, res) => {
  try {
    const entity = req.params.entity;
    console.log(`${entity} sync request received - triggering actual sync`);
    
    // Check if syncImplementation is available
    if (!syncImplementation) {
      throw new Error('Sync implementation not initialized');
    }
    
    // Determine if this is a full sync
    const fullSync = req.query.full === 'true';
    
    // Start sync process in background based on entity type
    let syncPromise;
    
    switch (entity) {
      case 'products':
        syncPromise = syncImplementation.syncProducts(fullSync);
        break;
      case 'picklists':
        syncPromise = syncImplementation.syncPicklists(fullSync);
        break;
      case 'warehouses':
        syncPromise = syncImplementation.syncWarehouses(fullSync);
        break;
      case 'users':
        syncPromise = syncImplementation.syncUsers(fullSync);
        break;
      case 'suppliers':
        syncPromise = syncImplementation.syncSuppliers(fullSync);
        break;
      case 'batches':
        syncPromise = syncImplementation.syncBatches(fullSync);
        break;
      default:
        return res.status(400).json({ 
          success: false, 
          message: `Unknown entity type: ${entity}` 
        });
    }
    
    // Run sync in background
    syncPromise.catch(error => {
      console.error(`Error in ${entity} sync:`, error.message);
    });
    
    // Return success immediately since sync is running in background
    res.json({
      success: true,
      message: `${fullSync ? 'Full' : 'Incremental'} sync started for ${entity}`,
      background: true
    });
  } catch (error) {
    console.error(`Error in ${req.params.entity} sync endpoint:`, error);
    res.status(500).json({ 
      success: false, 
      error: `Error triggering ${req.params.entity} sync: ${error.message}` 
    });
  }
});

// Retry sync endpoint
router.post('/sync/retry/:syncId', async (req, res) => {
  try {
    const syncId = req.params.syncId;
    console.log(`Retry sync request received for ${syncId}`);
    
    // Check if syncImplementation is available
    if (!syncImplementation) {
      throw new Error('Sync implementation not initialized');
    }
    
    // Use sync implementation to retry the sync
    const retryPromise = syncImplementation.retrySync(syncId);
    
    // Run retry in background
    retryPromise.catch(error => {
      console.error(`Error in retry sync for ${syncId}:`, error.message);
    });
    
    // Return success immediately since retry is running in background
    res.json({
      success: true,
      message: `Retry of sync ${syncId} started successfully`,
      background: true
    });
  } catch (error) {
    console.error(`Error in retry sync endpoint:`, error);
    res.status(500).json({ 
      success: false, 
      error: `Error retrying sync: ${error.message}` 
    });
  }
});

// Email settings endpoints
router.get('/email', async (req, res) => {
  try {
    // This would typically fetch email settings from your database
    // For now, return some sample settings
    res.json({ 
      email: 'admin@example.com', 
      notifyErrors: true, 
      notifySync: false 
    });
  } catch (error) {
    console.error('Error in email settings endpoint:', error);
    res.status(500).json({ 
      success: false, 
      error: `Error fetching email settings: ${error.message}` 
    });
  }
});

router.post('/email', async (req, res) => {
  try {
    // This would typically save email settings to your database
    // For now, just return success
    res.json({ 
      success: true, 
      message: 'Email settings saved successfully' 
    });
  } catch (error) {
    console.error('Error in save email settings endpoint:', error);
    res.status(500).json({ 
      success: false, 
      error: `Error saving email settings: ${error.message}` 
    });
  }
});

// Test endpoint - for debugging API connectivity
router.get('/test', async (req, res) => {
  try {
    // Check if services are initialized
    const servicesInitialized = Object.keys(services).length > 0;
    
    // Check if sync implementation is initialized
    const syncImplementationInitialized = !!syncImplementation;
    
    res.json({ 
      success: true, 
      message: 'API adapter is working correctly', 
      servicesInitialized,
      syncImplementationInitialized,
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Error in test endpoint:', error);
    res.status(500).json({ 
      success: false, 
      error: `Test failed: ${error.message}` 
    });
  }
});

module.exports = {
  router,
  initializeServices
};
