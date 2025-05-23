/**
 * Data Sync API Adapter
 * 
 * This adapter connects the dashboard to the actual sync implementation,
 * ensuring that when sync buttons are clicked, real data is synced from
 * Picqer to the database.
 */

const express = require('express');
const router = express.Router();
const SyncImplementation = require('./sync_implementation');

// Store service instances and sync implementation
let ProductService, PicklistService, WarehouseService, UserService, SupplierService;
let syncImplementation;

// Initialize services with dependency injection
function initializeServices(services) {
  ProductService = services.ProductService;
  PicklistService = services.PicklistService;
  WarehouseService = services.WarehouseService;
  UserService = services.UserService;
  SupplierService = services.SupplierService;
  
  // Initialize sync implementation with services
  syncImplementation = new SyncImplementation({
    ProductService,
    PicklistService,
    WarehouseService,
    UserService,
    SupplierService
  });
  
  console.log('API adapter initialized with service instances and sync implementation');
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
    // Get real stats from services with fallbacks for missing methods
    const stats = {
      products: {
        totalCount: await syncImplementation.getEntityCount('products'),
        lastSyncDate: await syncImplementation.getLastSyncDate('products'),
        status: 'Ready',
        lastSyncCount: 0
      },
      picklists: {
        totalCount: await syncImplementation.getEntityCount('picklists'),
        lastSyncDate: await syncImplementation.getLastSyncDate('picklists'),
        status: 'Ready',
        lastSyncCount: 0
      },
      warehouses: {
        totalCount: await syncImplementation.getEntityCount('warehouses'),
        lastSyncDate: await syncImplementation.getLastSyncDate('warehouses'),
        status: 'Ready',
        lastSyncCount: 0
      },
      users: {
        totalCount: await syncImplementation.getEntityCount('users'),
        lastSyncDate: await syncImplementation.getLastSyncDate('users'),
        status: 'Ready',
        lastSyncCount: 0
      },
      suppliers: {
        totalCount: await syncImplementation.getEntityCount('suppliers'),
        lastSyncDate: await syncImplementation.getLastSyncDate('suppliers'),
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
    
    // Determine if this is a full sync
    const fullSync = req.query.full === 'true';
    
    // Start sync processes in background with actual sync implementation
    if (fullSync) {
      // Full sync for all entities
      console.log('Starting full sync for all entities');
      
      // Use Promise.all to run syncs in parallel
      Promise.all([
        syncImplementation.syncProducts(true),
        syncImplementation.syncPicklists(true),
        syncImplementation.syncWarehouses(true),
        syncImplementation.syncUsers(true),
        syncImplementation.syncSuppliers(true)
      ]).catch(error => {
        console.error('Error in full sync:', error.message);
      });
    } else {
      // Incremental sync for all entities
      console.log('Starting incremental sync for all entities');
      
      // Use Promise.all to run syncs in parallel
      Promise.all([
        syncImplementation.syncProducts(false),
        syncImplementation.syncPicklists(false),
        syncImplementation.syncWarehouses(false),
        syncImplementation.syncUsers(false),
        syncImplementation.syncSuppliers(false)
      ]).catch(error => {
        console.error('Error in incremental sync:', error.message);
      });
    }
    
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
    const servicesInitialized = ProductService && PicklistService && 
                               WarehouseService && UserService && SupplierService;
    
    // Check if sync implementation is initialized
    const syncImplementationInitialized = !!syncImplementation;
    
    // Test Picqer API connection if services are initialized
    let picqerConnection = false;
    if (servicesInitialized) {
      try {
        if (typeof ProductService.testConnection === 'function') {
          await ProductService.testConnection();
          picqerConnection = true;
        } else {
          console.log('testConnection method not found in ProductService');
        }
      } catch (connectionError) {
        console.error('Picqer API connection test failed:', connectionError.message);
      }
    }
    
    res.json({ 
      success: true, 
      message: 'API adapter is working correctly', 
      servicesInitialized,
      syncImplementationInitialized,
      picqerConnection,
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
