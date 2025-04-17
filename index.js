const express = require('express');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();

// Import all services
const ProductService = require('./optimized_product_service');
const PicklistService = require('./picklist-service');
const WarehouseService = require('./warehouse_service');
const UserService = require('./user_service');
const SupplierService = require('./supplier_service');

// Initialize Express app
const app = express();
const port = process.env.PORT || 8080;

// Configure middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'dashboard')));

// Database configuration
const dbConfig = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

// Picqer API configuration
const apiKey = process.env.PICQER_API_KEY;
const baseUrl = process.env.PICQER_API_URL;

// Create service instances
const productService = new ProductService(apiKey, baseUrl, dbConfig);
const picklistService = new PicklistService(apiKey, baseUrl, dbConfig);
const warehouseService = new WarehouseService(apiKey, baseUrl, dbConfig);
const userService = new UserService(apiKey, baseUrl, dbConfig);
const supplierService = new SupplierService(apiKey, baseUrl, dbConfig);

// Initialize database
async function initializeDatabase() {
  try {
    console.log('Initializing database...');
    
    // Initialize all entity databases
    await productService.initializeProductsDatabase();
    await picklistService.initializePicklistsDatabase();
    await warehouseService.initializeWarehousesDatabase();
    await userService.initializeUsersDatabase();
    await supplierService.initializeSuppliersDatabase();
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error.message);
  }
}

// Initialize database on startup
initializeDatabase();

// API Routes
app.get('/api/test', async (req, res) => {
  try {
    const result = await productService.testConnection();
    res.json({ success: true, message: 'API connection successful', data: result });
  } catch (error) {
    res.json({ success: false, message: `API connection failed: ${error.message}` });
  }
});

// Generic sync endpoint
app.get('/api/sync', async (req, res) => {
  try {
    const fullSync = req.query.full === 'true';
    const results = {};
    
    if (fullSync) {
      console.log('Starting full sync of all entities...');
      results.products = await productService.performFullSync();
      results.picklists = await picklistService.performFullSync();
      results.warehouses = await warehouseService.performFullSync();
      results.users = await userService.performFullSync();
      results.suppliers = await supplierService.performFullSync();
    } else {
      console.log('Starting incremental sync of all entities...');
      results.products = await productService.performIncrementalSync();
      results.picklists = await picklistService.performIncrementalSync();
      results.warehouses = await warehouseService.performIncrementalSync();
      results.users = await userService.performIncrementalSync();
      results.suppliers = await supplierService.performIncrementalSync();
    }
    
    res.json({ 
      success: true, 
      message: `${fullSync ? 'Full' : 'Incremental'} sync completed successfully`,
      results 
    });
  } catch (error) {
    res.json({ success: false, message: `Sync failed: ${error.message}` });
  }
});

// Entity-specific sync endpoints
app.get('/api/sync/:entity', async (req, res) => {
  const entity = req.params.entity;
  const fullSync = req.query.full === 'true';
  
  try {
    let result;
    
    switch (entity) {
      case 'products':
        result = fullSync 
          ? await productService.performFullSync()
          : await productService.performIncrementalSync();
        break;
      case 'picklists':
        result = fullSync 
          ? await picklistService.performFullSync()
          : await picklistService.performIncrementalSync();
        break;
      case 'warehouses':
        result = fullSync 
          ? await warehouseService.performFullSync()
          : await warehouseService.performIncrementalSync();
        break;
      case 'users':
        result = fullSync 
          ? await userService.performFullSync()
          : await userService.performIncrementalSync();
        break;
      case 'suppliers':
        result = fullSync 
          ? await supplierService.performFullSync()
          : await supplierService.performIncrementalSync();
        break;
      default:
        return res.status(400).json({ 
          success: false, 
          message: `Unknown entity type: ${entity}` 
        });
    }
    
    res.json({ 
      success: true, 
      message: `${fullSync ? 'Full' : 'Incremental'} sync of ${entity} completed successfully`,
      result 
    });
  } catch (error) {
    res.json({ 
      success: false, 
      message: `Sync of ${entity} failed: ${error.message}` 
    });
  }
});

// Retry sync endpoint
app.post('/api/sync/retry/:syncId', async (req, res) => {
  const syncId = req.params.syncId;
  
  try {
    // Determine entity type from syncId
    const syncInfo = await getSyncInfo(syncId);
    
    if (!syncInfo) {
      return res.status(404).json({
        success: false,
        message: `Sync with ID ${syncId} not found`
      });
    }
    
    let result;
    
    switch (syncInfo.entityType) {
      case 'products':
        result = await productService.retrySync(syncId);
        break;
      case 'picklists':
        result = await picklistService.retrySync(syncId);
        break;
      case 'warehouses':
        result = await warehouseService.retrySync(syncId);
        break;
      case 'users':
        result = await userService.retrySync(syncId);
        break;
      case 'suppliers':
        result = await supplierService.retrySync(syncId);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: `Unknown entity type: ${syncInfo.entityType}`
        });
    }
    
    res.json({
      success: true,
      message: `Retry of ${syncInfo.entityType} sync started successfully`,
      result
    });
  } catch (error) {
    res.json({
      success: false,
      message: `Retry failed: ${error.message}`
    });
  }
});

// Helper function to get sync info from syncId
async function getSyncInfo(syncId) {
  // This would typically query the database to get sync info
  // For now, we'll parse the syncId to determine entity type
  // Format: entity_timestamp (e.g., products_1650123456789)
  
  const parts = syncId.split('_');
  if (parts.length < 2) return null;
  
  return {
    entityType: parts[0],
    timestamp: parts[1]
  };
}

// Stats endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const stats = {
      products: {
        totalCount: await productService.getProductCountFromDatabase(),
        lastSyncDate: await productService.getLastProductsSyncDate()
      },
      picklists: {
        totalCount: await picklistService.getPicklistCountFromDatabase(),
        lastSyncDate: await picklistService.getLastPicklistsSyncDate()
      },
      warehouses: {
        totalCount: await warehouseService.getWarehouseCountFromDatabase(),
        lastSyncDate: await warehouseService.getLastWarehousesSyncDate()
      },
      users: {
        totalCount: await userService.getUserCountFromDatabase(),
        lastSyncDate: await userService.getLastUsersSyncDate()
      },
      suppliers: {
        totalCount: await supplierService.getSupplierCountFromDatabase(),
        lastSyncDate: await supplierService.getLastSuppliersSyncDate()
      }
    };
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.json({ success: false, message: `Error getting stats: ${error.message}` });
  }
});

// Metrics endpoints
app.get('/api/metrics', async (req, res) => {
  try {
    // Get overall metrics
    const totalSyncs = await getTotalSyncCount();
    const successRate = await getOverallSuccessRate();
    const avgSyncTime = await getAverageSyncTime();
    const totalErrors = await getTotalErrorCount();
    
    res.json({
      totalSyncs,
      successRate,
      avgSyncTime,
      totalErrors
    });
  } catch (error) {
    res.status(500).json({ error: `Error fetching metrics: ${error.message}` });
  }
});

app.get('/api/metrics/:entity', async (req, res) => {
  const entity = req.params.entity;
  
  try {
    // Get entity-specific metrics
    const metrics = await getEntityMetrics(entity);
    
    if (!metrics) {
      return res.status(400).json({ error: `Unknown entity type: ${entity}` });
    }
    
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: `Error fetching ${entity} metrics: ${error.message}` });
  }
});

// Error endpoints
app.get('/api/errors', async (req, res) => {
  try {
    // Get all errors
    const errors = await getAllErrors();
    const errorCounts = await getErrorCountsByEntity();
    
    res.json({
      errors,
      errorCounts
    });
  } catch (error) {
    res.status(500).json({ error: `Error fetching errors: ${error.message}` });
  }
});

app.get('/api/errors/:entity', async (req, res) => {
  const entity = req.params.entity;
  
  try {
    // Get entity-specific errors
    const errors = await getErrorsByEntity(entity);
    
    res.json({ errors });
  } catch (error) {
    res.status(500).json({ error: `Error fetching ${entity} errors: ${error.message}` });
  }
});

app.get('/api/errors/details/:errorId', async (req, res) => {
  const errorId = req.params.errorId;
  
  try {
    // Get error details
    const errorDetails = await getErrorDetails(errorId);
    
    if (!errorDetails) {
      return res.status(404).json({ error: `Error with ID ${errorId} not found` });
    }
    
    res.json(errorDetails);
  } catch (error) {
    res.status(500).json({ error: `Error fetching error details: ${error.message}` });
  }
});

// Sync progress endpoint
app.get('/api/sync/stats', async (req, res) => {
  try {
    // Get sync progress for all entities
    const progress = {
      products: await productService.getSyncProgress(),
      picklists: await picklistService.getSyncProgress(),
      warehouses: await warehouseService.getSyncProgress(),
      users: await userService.getSyncProgress(),
      suppliers: await supplierService.getSyncProgress()
    };
    
    // Determine if any sync is in progress
    const anySyncInProgress = Object.values(progress).some(p => p && p.inProgress);
    
    res.json({
      anySyncInProgress,
      ...progress
    });
  } catch (error) {
    res.status(500).json({ error: `Error fetching sync stats: ${error.message}` });
  }
});

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard/enhanced-dashboard-with-entities.html'));
});

// Schedule syncs
// Products - every hour
cron.schedule('0 * * * *', async () => {
  console.log('Running scheduled product sync...');
  try {
    await productService.performIncrementalSync();
    console.log('Scheduled product sync completed successfully');
  } catch (error) {
    console.error('Scheduled product sync failed:', error.message);
  }
});

// Picklists - every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  console.log('Running scheduled picklist sync...');
  try {
    await picklistService.performIncrementalSync();
    console.log('Scheduled picklist sync completed successfully');
  } catch (error) {
    console.error('Scheduled picklist sync failed:', error.message);
  }
});

// Warehouses - once daily at 1 AM
cron.schedule('0 1 * * *', async () => {
  console.log('Running scheduled warehouse sync...');
  try {
    await warehouseService.performIncrementalSync();
    console.log('Scheduled warehouse sync completed successfully');
  } catch (error) {
    console.error('Scheduled warehouse sync failed:', error.message);
  }
});

// Users - once daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  console.log('Running scheduled user sync...');
  try {
    await userService.performIncrementalSync();
    console.log('Scheduled user sync completed successfully');
  } catch (error) {
    console.error('Scheduled user sync failed:', error.message);
  }
});

// Suppliers - once daily at 3 AM
cron.schedule('0 3 * * *', async () => {
  console.log('Running scheduled supplier sync...');
  try {
    await supplierService.performIncrementalSync();
    console.log('Scheduled supplier sync completed successfully');
  } catch (error) {
    console.error('Scheduled supplier sync failed:', error.message);
  }
});

// Full sync for all entities - once weekly on Sunday at 4 AM
cron.schedule('0 4 * * 0', async () => {
  console.log('Running weekly full sync of all entities...');
  try {
    await productService.performFullSync();
    await picklistService.performFullSync();
    await warehouseService.performFullSync();
    await userService.performFullSync();
    await supplierService.performFullSync();
    console.log('Weekly full sync completed successfully');
  } catch (error) {
    console.error('Weekly full sync failed:', error.message);
  }
});

// Helper functions for metrics and errors
// These would typically query the database
// For now, we'll return placeholder values

async function getTotalSyncCount() {
  return 1250; // Placeholder
}

async function getOverallSuccessRate() {
  return 98.5; // Placeholder percentage
}

async function getAverageSyncTime() {
  return 45000; // Placeholder milliseconds
}

async function getTotalErrorCount() {
  return 15; // Placeholder
}

async function getEntityMetrics(entity) {
  // Placeholder metrics for each entity type
  const metrics = {
    products: {
      successRate: 99.1,
      avgSyncTime: 60000,
      itemsPerMinute: 1200,
      errorRate: 0.9,
      stockAccuracy: 99.5,
      priceUpdates: 150,
      syncHistory: [
        { timestamp: '2025-04-16T12:00:00Z', success: true, count: 1200 },
        { timestamp: '2025-04-15T12:00:00Z', success: true, count: 1150 },
        { timestamp: '2025-04-14T12:00:00Z', success: false, count: 50 }
      ]
    },
    picklists: {
      successRate: 98.0,
      avgSyncTime: 45000,
      itemsPerMinute: 800,
      errorRate: 2.0,
      completedPicklists: 250,
      processingTime: 30000,
      syncHistory: [
        { timestamp: '2025-04-16T12:30:00Z', success: true, count: 300 },
        { timestamp: '2025-04-16T12:00:00Z', success: true, count: 280 },
        { timestamp: '2025-04-15T12:30:00Z', success: false, count: 20 }
      ]
    },
    warehouses: {
      successRate: 100.0,
      avgSyncTime: 15000,
      itemsPerMinute: 20,
      errorRate: 0.0,
      stockMovements: 500,
      activeWarehouses: 3,
      syncHistory: [
        { timestamp: '2025-04-16T01:00:00Z', success: true, count: 3 },
        { timestamp: '2025-04-15T01:00:00Z', success: true, count: 3 },
        { timestamp: '2025-04-14T01:00:00Z', success: true, count: 3 }
      ]
    },
    users: {
      successRate: 100.0,
      avgSyncTime: 10000,
      itemsPerMinute: 30,
      errorRate: 0.0,
      activeUsers: 15,
      userLogins: 120,
      syncHistory: [
        { timestamp: '2025-04-16T02:00:00Z', success: true, count: 15 },
        { timestamp: '2025-04-15T02:00:00Z', success: true, count: 15 },
        { timestamp: '2025-04-14T02:00:00Z', success: true, count: 14 }
      ]
    },
    suppliers: {
      successRate: 97.5,
      avgSyncTime: 30000,
      itemsPerMinute: 50,
      errorRate: 2.5,
      activeSuppliers: 25,
      productCoverage: 85.0,
      syncHistory: [
        { timestamp: '2025-04-16T03:00:00Z', success: true, count: 25 },
        { timestamp: '2025-04-15T03:00:00Z', success: false, count: 1 },
        { timestamp: '2025-04-14T03:00:00Z', success: true, count: 24 }
      ]
    }
  };
  
  return metrics[entity] || null;
}

async function getAllErrors() {
  // Placeholder errors
  return [
    {
      id: 'err_001',
      syncId: 'products_1650123456789',
      timestamp: '2025-04-15T12:15:00Z',
      type: 'api',
      message: 'API rate limit exceeded'
    },
    {
      id: 'err_002',
      syncId: 'picklists_1650123456790',
      timestamp: '2025-04-15T12:45:00Z',
      type: 'database',
      message: 'Database connection timeout'
    },
    {
      id: 'err_003',
      syncId: 'suppliers_1650123456791',
      timestamp: '2025-04-15T03:15:00Z',
      type: 'validation',
      message: 'Invalid supplier data received'
    }
  ];
}

async function getErrorCountsByEntity() {
  // Placeholder error counts
  return {
    products: 5,
    picklists: 8,
    warehouses: 0,
    users: 0,
    suppliers: 2
  };
}

async function getErrorsByEntity(entity) {
  // Filter placeholder errors by entity
  const allErrors = await getAllErrors();
  return allErrors.filter(error => error.syncId.startsWith(entity));
}

async function getErrorDetails(errorId) {
  // Placeholder error details
  const allErrors = await getAllErrors();
  const error = allErrors.find(e => e.id === errorId);
  
  if (!error) return null;
  
  // Add additional details
  return {
    ...error,
    entityType: error.syncId.split('_')[0],
    stack: 'Error: API rate limit exceeded\n    at PicqerService.makeApiRequest (/app/picqer-service.js:125:15)\n    at async PicqerService.getProducts (/app/picqer-service.js:78:20)',
    context: {
      requestUrl: 'https://skapa-global.picqer.com/api/v1/products',
      requestMethod: 'GET',
      responseStatus: 429,
      responseBody: '{"error":"Too Many Requests","message":"API rate limit exceeded"}'
    }
  };
}

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Dashboard available at http://localhost:${port}/dashboard`);
});
