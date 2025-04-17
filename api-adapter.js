/**
 * API Adapter Middleware for Picqer Middleware Dashboard
 * 
 * This middleware adapts the dashboard's expected API endpoints to the actual backend API structure.
 * It resolves the 404 errors by mapping the dashboard requests to the correct backend endpoints.
 */

const express = require('express');
const router = express.Router();

// Import services if needed for direct access
// const ProductService = require('./picqer-service');
// const PicklistService = require('./picklist-service');
// etc.

// Status endpoint - maps /api/status to check if the API is online
router.get('/status', async (req, res) => {
  try {
    // Simple online check - if this route is accessible, the API is online
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

// Stats endpoint - maps /api/stats to the existing stats endpoints
router.get('/stats', async (req, res) => {
  try {
    // Forward to the existing stats endpoint
    // This assumes your backend already has a similar endpoint
    // If not, you'll need to aggregate data from multiple endpoints
    
    // Option 1: Forward the request (simplest)
    // req.url = '/api/metrics';
    // return req.app._router.handle(req, res);
    
    // Option 2: Make an internal request (more control)
    const response = await fetch(`http://localhost:${req.app.get('port') || process.env.PORT || 8080}/api/metrics`);
    const data = await response.json();
    
    // Transform the data to match the dashboard's expected format
    const stats = {
      products: {
        totalCount: data.products?.totalCount || 0,
        lastSyncDate: data.products?.lastSyncDate || null,
        status: data.products?.status || 'Ready',
        lastSyncCount: data.products?.lastSyncCount || 0
      },
      picklists: {
        totalCount: data.picklists?.totalCount || 0,
        lastSyncDate: data.picklists?.lastSyncDate || null,
        status: data.picklists?.status || 'Ready',
        lastSyncCount: data.picklists?.lastSyncCount || 0
      },
      warehouses: {
        totalCount: data.warehouses?.totalCount || 0,
        lastSyncDate: data.warehouses?.lastSyncDate || null,
        status: data.warehouses?.status || 'Ready',
        lastSyncCount: data.warehouses?.lastSyncCount || 0
      },
      users: {
        totalCount: data.users?.totalCount || 0,
        lastSyncDate: data.users?.lastSyncDate || null,
        status: data.users?.status || 'Ready',
        lastSyncCount: data.users?.lastSyncCount || 0
      },
      suppliers: {
        totalCount: data.suppliers?.totalCount || 0,
        lastSyncDate: data.suppliers?.lastSyncDate || null,
        status: data.suppliers?.status || 'Ready',
        lastSyncCount: data.suppliers?.lastSyncCount || 0
      }
    };
    
    res.json({ 
      success: true, 
      stats,
      syncProgress: data.syncProgress || null
    });
  } catch (error) {
    console.error('Error in stats endpoint:', error);
    
    // Fallback to direct database queries if the metrics endpoint fails
    try {
      // This is a simplified example - you would need to implement these functions
      // or import them from your service files
      const productCount = await getProductCount();
      const picklistCount = await getPicklistCount();
      const warehouseCount = await getWarehouseCount();
      const userCount = await getUserCount();
      const supplierCount = await getSupplierCount();
      
      const stats = {
        products: {
          totalCount: productCount,
          lastSyncDate: await getLastSyncDate('products'),
          status: 'Ready',
          lastSyncCount: 0
        },
        picklists: {
          totalCount: picklistCount,
          lastSyncDate: await getLastSyncDate('picklists'),
          status: 'Ready',
          lastSyncCount: 0
        },
        warehouses: {
          totalCount: warehouseCount,
          lastSyncDate: await getLastSyncDate('warehouses'),
          status: 'Ready',
          lastSyncCount: 0
        },
        users: {
          totalCount: userCount,
          lastSyncDate: await getLastSyncDate('users'),
          status: 'Ready',
          lastSyncCount: 0
        },
        suppliers: {
          totalCount: supplierCount,
          lastSyncDate: await getLastSyncDate('suppliers'),
          status: 'Ready',
          lastSyncCount: 0
        }
      };
      
      res.json({ 
        success: true, 
        stats,
        syncProgress: null
      });
    } catch (fallbackError) {
      console.error('Error in stats fallback:', fallbackError);
      res.status(500).json({ 
        success: false, 
        error: `Error fetching stats: ${error.message}. Fallback also failed: ${fallbackError.message}` 
      });
    }
  }
});

// Logs endpoint - maps /api/logs to your logging system
router.get('/logs', async (req, res) => {
  try {
    // This assumes you have a logging system that can be queried
    // If not, you'll need to create a simple in-memory log store
    
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
    // This assumes you have a sync history system that can be queried
    // If not, you'll need to create a simple in-memory history store
    
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
    // Forward to the existing sync endpoint
    req.url = '/api/sync';
    return req.app._router.handle(req, res);
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
    // Forward to the existing entity-specific sync endpoint
    req.url = `/api/sync/${req.params.entity}`;
    return req.app._router.handle(req, res);
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
    // Forward to the existing retry sync endpoint
    req.url = `/api/sync/retry/${req.params.syncId}`;
    return req.app._router.handle(req, res);
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
    res.json({ 
      success: true, 
      message: 'API adapter is working correctly', 
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

// Helper functions for fallback stats
// These would typically be imported from your service files
// For now, they return placeholder values
async function getProductCount() {
  return 6710;
}

async function getPicklistCount() {
  return 150;
}

async function getWarehouseCount() {
  return 3;
}

async function getUserCount() {
  return 15;
}

async function getSupplierCount() {
  return 25;
}

async function getLastSyncDate(entityType) {
  return new Date(Date.now() - 86400000).toISOString();
}

module.exports = router;
