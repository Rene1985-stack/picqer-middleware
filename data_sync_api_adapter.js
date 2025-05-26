/**
 * Updated Data Sync API Adapter with compatibility fixes
 * Integrates all services and exposes API endpoints for data synchronization
 */
const express = require('express');
const router = express.Router();

// Initialize services object to store service instances
let services = {};

// Initialize sync implementation
let syncImplementation = null;

/**
 * Initialize services with instances
 * @param {Object} serviceInstances - Object containing service instances
 */
function initializeServices(serviceInstances) {
  services = serviceInstances;
  console.log('API adapter initialized with service instances and sync implementation');
}

/**
 * Set sync implementation
 * @param {Object} implementation - Sync implementation instance
 */
function setSyncImplementation(implementation) {
  syncImplementation = implementation;
  console.log('Sync implementation set in API adapter');
}

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get sync status endpoint
router.get('/sync/status', async (req, res) => {
  try {
    const status = {
      products: {
        count: 0,
        last_sync: null
      },
      picklists: {
        count: 0,
        last_sync: null
      },
      warehouses: {
        count: 0,
        last_sync: null
      },
      users: {
        count: 0,
        last_sync: null
      },
      suppliers: {
        count: 0,
        last_sync: null
      },
      batches: {
        count: 0,
        last_sync: null
      }
    };
    
    // Get product count and last sync date
    try {
      if (services.ProductService && typeof services.ProductService.getProductCountFromDatabase === 'function') {
        status.products.count = await services.ProductService.getProductCountFromDatabase();
      } else {
        console.error('Error getting products count: this.ProductService.getProductCountFromDatabase is not a function');
      }
      
      if (services.ProductService && typeof services.ProductService.getLastSyncDate === 'function') {
        const lastSyncDate = await services.ProductService.getLastSyncDate();
        status.products.last_sync = lastSyncDate ? lastSyncDate.toISOString() : null;
      } else {
        console.error('Error getting last sync date for products: this.ProductService.getLastSyncDate is not a function');
      }
    } catch (error) {
      console.error('Error getting product status:', error.message);
    }
    
    // Get picklist count and last sync date
    try {
      if (services.PicklistService && typeof services.PicklistService.getPicklistCountFromDatabase === 'function') {
        status.picklists.count = await services.PicklistService.getPicklistCountFromDatabase();
      } else if (services.PicklistService && typeof services.PicklistService.getPicklistsCount === 'function') {
        status.picklists.count = await services.PicklistService.getPicklistsCount();
      }
      
      if (services.PicklistService && typeof services.PicklistService.getLastSyncDate === 'function') {
        const lastSyncDate = await services.PicklistService.getLastSyncDate();
        status.picklists.last_sync = lastSyncDate ? lastSyncDate.toISOString() : null;
      } else if (services.PicklistService && typeof services.PicklistService.getLastPicklistsSyncDate === 'function') {
        console.log('getLastSyncDate method called, using getLastPicklistsSyncDate instead');
        const lastSyncDate = await services.PicklistService.getLastPicklistsSyncDate();
        status.picklists.last_sync = lastSyncDate ? lastSyncDate.toISOString() : null;
      }
    } catch (error) {
      console.error('Error getting picklist status:', error.message);
    }
    
    // Get warehouse count and last sync date
    try {
      if (services.WarehouseService && typeof services.WarehouseService.getWarehouseCountFromDatabase === 'function') {
        status.warehouses.count = await services.WarehouseService.getWarehouseCountFromDatabase();
      } else if (services.WarehouseService && typeof services.WarehouseService.getWarehousesCount === 'function') {
        status.warehouses.count = await services.WarehouseService.getWarehousesCount();
      }
      
      if (services.WarehouseService && typeof services.WarehouseService.getLastSyncDate === 'function') {
        const lastSyncDate = await services.WarehouseService.getLastSyncDate();
        status.warehouses.last_sync = lastSyncDate ? lastSyncDate.toISOString() : null;
      } else if (services.WarehouseService && typeof services.WarehouseService.getLastWarehousesSyncDate === 'function') {
        console.log('getLastSyncDate method called, using getLastWarehousesSyncDate instead');
        const lastSyncDate = await services.WarehouseService.getLastWarehousesSyncDate();
        status.warehouses.last_sync = lastSyncDate ? lastSyncDate.toISOString() : null;
      }
    } catch (error) {
      console.error('Error getting warehouse status:', error.message);
    }
    
    // Get user count and last sync date
    try {
      if (services.UserService && typeof services.UserService.getUserCountFromDatabase === 'function') {
        status.users.count = await services.UserService.getUserCountFromDatabase();
      } else if (services.UserService && typeof services.UserService.getUsersCount === 'function') {
        status.users.count = await services.UserService.getUsersCount();
      }
      
      if (services.UserService && typeof services.UserService.getLastSyncDate === 'function') {
        const lastSyncDate = await services.UserService.getLastSyncDate();
        status.users.last_sync = lastSyncDate ? lastSyncDate.toISOString() : null;
      } else if (services.UserService && typeof services.UserService.getLastUsersSyncDate === 'function') {
        console.log('getLastSyncDate method called, using getLastUsersSyncDate instead');
        const lastSyncDate = await services.UserService.getLastUsersSyncDate();
        status.users.last_sync = lastSyncDate ? lastSyncDate.toISOString() : null;
      }
    } catch (error) {
      console.error('Error getting user status:', error.message);
    }
    
    // Get supplier count and last sync date
    try {
      if (services.SupplierService && typeof services.SupplierService.getSupplierCountFromDatabase === 'function') {
        status.suppliers.count = await services.SupplierService.getSupplierCountFromDatabase();
      } else if (services.SupplierService && typeof services.SupplierService.getSuppliersCount === 'function') {
        status.suppliers.count = await services.SupplierService.getSuppliersCount();
      }
      
      if (services.SupplierService && typeof services.SupplierService.getLastSyncDate === 'function') {
        const lastSyncDate = await services.SupplierService.getLastSyncDate();
        status.suppliers.last_sync = lastSyncDate ? lastSyncDate.toISOString() : null;
      } else if (services.SupplierService && typeof services.SupplierService.getLastSuppliersSyncDate === 'function') {
        console.log('getLastSyncDate method called, using getLastSuppliersSyncDate instead');
        const lastSyncDate = await services.SupplierService.getLastSuppliersSyncDate();
        status.suppliers.last_sync = lastSyncDate ? lastSyncDate.toISOString() : null;
      }
    } catch (error) {
      console.error('Error getting supplier status:', error.message);
    }
    
    // Get batch count and last sync date
    try {
      if (services.BatchService && typeof services.BatchService.getBatchCountFromDatabase === 'function') {
        status.batches.count = await services.BatchService.getBatchCountFromDatabase();
      }
      
      if (services.BatchService && typeof services.BatchService.getLastSyncDate === 'function') {
        const lastSyncDate = await services.BatchService.getLastSyncDate();
        status.batches.last_sync = lastSyncDate ? lastSyncDate.toISOString() : null;
      }
    } catch (error) {
      console.error('Error getting batch status:', error.message);
    }
    
    res.json(status);
  } catch (error) {
    console.error('Error getting sync status:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Sync products endpoint
router.post('/sync/products', async (req, res) => {
  try {
    const fullSync = req.query.full === 'true';
    
    if (!syncImplementation) {
      return res.status(500).json({ error: 'Sync implementation not initialized' });
    }
    
    const result = await syncImplementation.syncProducts(fullSync);
    res.json(result);
  } catch (error) {
    console.error('Error syncing products:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Sync picklists endpoint
router.post('/sync/picklists', async (req, res) => {
  try {
    const fullSync = req.query.full === 'true';
    
    if (!syncImplementation) {
      return res.status(500).json({ error: 'Sync implementation not initialized' });
    }
    
    const result = await syncImplementation.syncPicklists(fullSync);
    res.json(result);
  } catch (error) {
    console.error('Error syncing picklists:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Sync warehouses endpoint
router.post('/sync/warehouses', async (req, res) => {
  try {
    const fullSync = req.query.full === 'true';
    
    if (!syncImplementation) {
      return res.status(500).json({ error: 'Sync implementation not initialized' });
    }
    
    const result = await syncImplementation.syncWarehouses(fullSync);
    res.json(result);
  } catch (error) {
    console.error('Error syncing warehouses:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Sync users endpoint
router.post('/sync/users', async (req, res) => {
  try {
    const fullSync = req.query.full === 'true';
    
    if (!syncImplementation) {
      return res.status(500).json({ error: 'Sync implementation not initialized' });
    }
    
    const result = await syncImplementation.syncUsers(fullSync);
    res.json(result);
  } catch (error) {
    console.error('Error syncing users:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Sync suppliers endpoint
router.post('/sync/suppliers', async (req, res) => {
  try {
    const fullSync = req.query.full === 'true';
    
    if (!syncImplementation) {
      return res.status(500).json({ error: 'Sync implementation not initialized' });
    }
    
    const result = await syncImplementation.syncSuppliers(fullSync);
    res.json(result);
  } catch (error) {
    console.error('Error syncing suppliers:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Sync batches endpoint
router.post('/sync/batches', async (req, res) => {
  try {
    const fullSync = req.query.full === 'true';
    const days = req.query.days ? parseInt(req.query.days, 10) : null;
    
    if (!syncImplementation) {
      return res.status(500).json({ error: 'Sync implementation not initialized' });
    }
    
    if (!services.BatchService) {
      return res.status(500).json({ error: 'Batch service not initialized' });
    }
    
    // Use the days parameter if provided
    if (days !== null && !isNaN(days)) {
      console.log(`Syncing batches from the last ${days} days`);
      const result = await services.BatchService.syncBatches(fullSync, days);
      return res.json(result);
    }
    
    // Otherwise use the standard sync method
    const result = await syncImplementation.syncBatches(fullSync);
    res.json(result);
  } catch (error) {
    console.error('Error syncing batches:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Sync all endpoint
router.post('/sync/all', async (req, res) => {
  try {
    const fullSync = req.query.full === 'true';
    
    if (!syncImplementation) {
      return res.status(500).json({ error: 'Sync implementation not initialized' });
    }
    
    const result = await syncImplementation.syncAll(fullSync);
    res.json(result);
  } catch (error) {
    console.error('Error syncing all entities:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = {
  router,
  initializeServices,
  setSyncImplementation
};
