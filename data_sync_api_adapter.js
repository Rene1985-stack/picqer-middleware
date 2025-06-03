/**
 * Data Sync API Adapter
 * Provides API endpoints for syncing data from Picqer to the database
 */

const express = require('express');
const sql = require('mssql');
const router = express.Router();

// Service instances will be initialized from index.js
let services = {};

/**
 * Initialize services from index.js
 * @param {Object} serviceInstances - Object containing all service instances
 */
function initializeServices(serviceInstances) {
  services = serviceInstances;
  console.log('Data sync API adapter initialized with services:', Object.keys(services));
}

// Database configuration (will be set from environment variables)
let sqlConfig = null;

/**
 * Set SQL configuration
 * @param {Object} config - SQL configuration object
 */
function setSqlConfig(config) {
  sqlConfig = config;
}

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: Object.keys(services),
    message: 'Data sync API adapter is running'
  });
});

// GET endpoint to sync purchase orders
router.get('/sync/purchaseorders', async (req, res) => {
  try {
    if (!services.PurchaseOrderService) {
      return res.status(500).json({
        success: false,
        message: 'PurchaseOrderService not available'
      });
    }

    const fullSync = req.query.full === 'true';
    const days = req.query.days ? parseInt(req.query.days) : null;
    
    console.log(`Received request to ${fullSync ? 'fully' : 'incrementally'} sync purchase orders${days ? ` for the last ${days} days` : ''}`);
    
    const result = await services.PurchaseOrderService.syncPurchaseOrders(fullSync, days);
    
    res.json({
      success: true,
      message: `Purchase orders sync ${result.success ? 'completed' : 'failed'}`,
      details: result
    });
  } catch (error) {
    console.error('Error syncing purchase orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing purchase orders',
      error: error.message
    });
  }
});

// GET endpoint to get purchase orders
router.get('/purchaseorders', async (req, res) => {
  try {
    if (!sqlConfig) {
      return res.status(500).json({
        success: false,
        message: 'Database configuration not available'
      });
    }

    const pool = await sql.connect(sqlConfig);
    const result = await pool.request().query(`
      SELECT po.*, 
        (SELECT COUNT(*) FROM PurchaseOrderProducts WHERE idpurchaseorder = po.idpurchaseorder) AS product_count,
        (SELECT COUNT(*) FROM PurchaseOrderComments WHERE idpurchaseorder = po.idpurchaseorder) AS comment_count
      FROM PurchaseOrders po
      ORDER BY po.updated DESC
    `);
    
    res.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length
    });
  } catch (error) {
    console.error('Error getting purchase orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting purchase orders',
      error: error.message
    });
  }
});

// GET endpoint to get a specific purchase order with its products and comments
router.get('/purchaseorders/:id', async (req, res) => {
  try {
    if (!sqlConfig) {
      return res.status(500).json({
        success: false,
        message: 'Database configuration not available'
      });
    }

    const { id } = req.params;
    const pool = await sql.connect(sqlConfig);
    
    // Get purchase order
    const purchaseOrderResult = await pool.request()
      .input('idpurchaseorder', sql.Int, id)
      .query('SELECT * FROM PurchaseOrders WHERE idpurchaseorder = @idpurchaseorder');
    
    if (purchaseOrderResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Purchase order with ID ${id} not found`
      });
    }
    
    const purchaseOrder = purchaseOrderResult.recordset[0];
    
    // Get purchase order products
    const productsResult = await pool.request()
      .input('idpurchaseorder', sql.Int, id)
      .query('SELECT * FROM PurchaseOrderProducts WHERE idpurchaseorder = @idpurchaseorder');
    
    // Get purchase order comments
    const commentsResult = await pool.request()
      .input('idpurchaseorder', sql.Int, id)
      .query('SELECT * FROM PurchaseOrderComments WHERE idpurchaseorder = @idpurchaseorder ORDER BY created DESC');
    
    // Combine results
    purchaseOrder.products = productsResult.recordset;
    purchaseOrder.comments = commentsResult.recordset;
    
    res.json({
      success: true,
      data: purchaseOrder
    });
  } catch (error) {
    console.error(`Error getting purchase order ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: `Error getting purchase order ${req.params.id}`,
      error: error.message
    });
  }
});

// GET endpoint to sync products (if ProductService is available)
router.get('/sync/products', async (req, res) => {
  try {
    if (!services.ProductService) {
      return res.status(500).json({
        success: false,
        message: 'ProductService not available'
      });
    }

    const fullSync = req.query.full === 'true';
    const days = req.query.days ? parseInt(req.query.days) : null;
    
    console.log(`Received request to ${fullSync ? 'fully' : 'incrementally'} sync products${days ? ` for the last ${days} days` : ''}`);
    
    // Assuming ProductService has a similar sync method
    const result = await services.ProductService.syncProducts ? 
      await services.ProductService.syncProducts(fullSync, days) :
      { success: false, message: 'Sync method not available' };
    
    res.json({
      success: true,
      message: `Products sync ${result.success ? 'completed' : 'failed'}`,
      details: result
    });
  } catch (error) {
    console.error('Error syncing products:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing products',
      error: error.message
    });
  }
});

// GET endpoint to sync picklists
router.get('/sync/picklists', async (req, res) => {
  try {
    if (!services.PicklistService) {
      return res.status(500).json({
        success: false,
        message: 'PicklistService not available'
      });
    }

    const fullSync = req.query.full === 'true';
    const days = req.query.days ? parseInt(req.query.days) : null;
    
    console.log(`Received request to ${fullSync ? 'fully' : 'incrementally'} sync picklists${days ? ` for the last ${days} days` : ''}`);
    
    const result = await services.PicklistService.syncPicklists ? 
      await services.PicklistService.syncPicklists(fullSync, days) :
      { success: false, message: 'Sync method not available' };
    
    res.json({
      success: true,
      message: `Picklists sync ${result.success ? 'completed' : 'failed'}`,
      details: result
    });
  } catch (error) {
    console.error('Error syncing picklists:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing picklists',
      error: error.message
    });
  }
});

// GET endpoint to sync warehouses
router.get('/sync/warehouses', async (req, res) => {
  try {
    if (!services.WarehouseService) {
      return res.status(500).json({
        success: false,
        message: 'WarehouseService not available'
      });
    }

    const fullSync = req.query.full === 'true';
    const days = req.query.days ? parseInt(req.query.days) : null;
    
    console.log(`Received request to ${fullSync ? 'fully' : 'incrementally'} sync warehouses${days ? ` for the last ${days} days` : ''}`);
    
    const result = await services.WarehouseService.syncWarehouses ? 
      await services.WarehouseService.syncWarehouses(fullSync, days) :
      { success: false, message: 'Sync method not available' };
    
    res.json({
      success: true,
      message: `Warehouses sync ${result.success ? 'completed' : 'failed'}`,
      details: result
    });
  } catch (error) {
    console.error('Error syncing warehouses:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing warehouses',
      error: error.message
    });
  }
});

// GET endpoint to sync users
router.get('/sync/users', async (req, res) => {
  try {
    if (!services.UserService) {
      return res.status(500).json({
        success: false,
        message: 'UserService not available'
      });
    }

    const fullSync = req.query.full === 'true';
    const days = req.query.days ? parseInt(req.query.days) : null;
    
    console.log(`Received request to ${fullSync ? 'fully' : 'incrementally'} sync users${days ? ` for the last ${days} days` : ''}`);
    
    const result = await services.UserService.syncUsers ? 
      await services.UserService.syncUsers(fullSync, days) :
      { success: false, message: 'Sync method not available' };
    
    res.json({
      success: true,
      message: `Users sync ${result.success ? 'completed' : 'failed'}`,
      details: result
    });
  } catch (error) {
    console.error('Error syncing users:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing users',
      error: error.message
    });
  }
});

// GET endpoint to sync suppliers
router.get('/sync/suppliers', async (req, res) => {
  try {
    if (!services.SupplierService) {
      return res.status(500).json({
        success: false,
        message: 'SupplierService not available'
      });
    }

    const fullSync = req.query.full === 'true';
    const days = req.query.days ? parseInt(req.query.days) : null;
    
    console.log(`Received request to ${fullSync ? 'fully' : 'incrementally'} sync suppliers${days ? ` for the last ${days} days` : ''}`);
    
    const result = await services.SupplierService.syncSuppliers ? 
      await services.SupplierService.syncSuppliers(fullSync, days) :
      { success: false, message: 'Sync method not available' };
    
    res.json({
      success: true,
      message: `Suppliers sync ${result.success ? 'completed' : 'failed'}`,
      details: result
    });
  } catch (error) {
    console.error('Error syncing suppliers:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing suppliers',
      error: error.message
    });
  }
});

// GET endpoint to sync all entities
router.get('/sync/all', async (req, res) => {
  try {
    const fullSync = req.query.full === 'true';
    const days = req.query.days ? parseInt(req.query.days) : null;
    
    console.log(`Received request to ${fullSync ? 'fully' : 'incrementally'} sync all entities${days ? ` for the last ${days} days` : ''}`);
    
    const results = {};
    const entities = ['purchaseorders', 'products', 'picklists', 'warehouses', 'users', 'suppliers'];
    
    for (const entity of entities) {
      try {
        const serviceName = entity.charAt(0).toUpperCase() + entity.slice(1) + 'Service';
        if (entity === 'purchaseorders') serviceName = 'PurchaseOrderService';
        if (entity === 'products') serviceName = 'ProductService';
        
        if (services[serviceName]) {
          const syncMethod = `sync${entity.charAt(0).toUpperCase() + entity.slice(1)}`;
          if (entity === 'purchaseorders') syncMethod = 'syncPurchaseOrders';
          
          if (services[serviceName][syncMethod]) {
            results[entity] = await services[serviceName][syncMethod](fullSync, days);
          } else {
            results[entity] = { success: false, message: 'Sync method not available' };
          }
        } else {
          results[entity] = { success: false, message: 'Service not available' };
        }
      } catch (error) {
        console.error(`Error syncing ${entity}:`, error);
        results[entity] = { success: false, error: error.message };
      }
    }
    
    res.json({
      success: true,
      message: 'All entities sync completed',
      results: results
    });
  } catch (error) {
    console.error('Error syncing all entities:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing all entities',
      error: error.message
    });
  }
});

module.exports = {
  router,
  initializeServices,
  setSqlConfig
};

