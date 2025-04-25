/**
 * Comprehensive fixed index.js with robust method additions
 * 
 * This version fixes all identified issues:
 * 1. Uses the existing sync-method-integration.js to integrate sync methods
 * 2. Adds ALL missing service methods using the comprehensive approach
 * 3. Properly initializes data_sync_api_adapter with services
 * 4. Ensures dashboard routes work correctly
 * 5. Uses the db-connection-adapter for database connectivity
 * 6. Adds fallback for PICQER_API_URL and PICQER_BASE_URL
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sql = require('mssql');

// Import database connection adapter
const dbAdapter = require('./db-connection-adapter');

// Import services directly - no destructuring
const PicqerApiClient = require('./picqer-api-client');
const BatchService = require('./batch_service');
const PicklistService = require('./picklist-service');
const WarehouseService = require('./warehouse_service');
const UserService = require('./user_service');
const SupplierService = require('./supplier_service');

// Import API adapters
const apiAdapterModule = require('./api-adapter');
const dataSyncApiAdapterModule = require('./fixed-data-sync-api-adapter');
const batchDashboardApiModule = require('./batch_dashboard_api');

// Import sync method integration
const { integrateSyncMethods } = require('./sync-method-integration');

// Import comprehensive service methods extension
// Define the extension inline to ensure it's available
const addMissingServiceMethods = (services) => {
  console.log('Adding missing methods to service classes (comprehensive inline version)...');
  
  // Add methods to each service
  Object.keys(services).forEach(serviceKey => {
    const service = services[serviceKey];
    
    // Determine entity type from service key
    let entityType = serviceKey.replace('Service', '').toLowerCase();
    
    console.log(`Adding methods to ${serviceKey} for entity type ${entityType}...`);
    
    // Add getLastSync method
    if (typeof service.getLastSync !== 'function') {
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
    if (typeof service.getLastSyncDate !== 'function') {
      service.getLastSyncDate = async function() {
        return await this.getLastSync();
      };
      console.log(`Added getLastSyncDate method to ${serviceKey}`);
    }
    
    // Add entity-specific count methods
    const countMethods = [
      { entity: 'product', tableName: 'Products' },
      { entity: 'picklist', tableName: 'Picklists' },
      { entity: 'warehouse', tableName: 'Warehouses' },
      { entity: 'user', tableName: 'Users' },
      { entity: 'supplier', tableName: 'Suppliers' },
      { entity: 'batch', tableName: 'Batches' }
    ];
    
    countMethods.forEach(({ entity, tableName }) => {
      const methodName = `get${entity.charAt(0).toUpperCase() + entity.slice(1)}CountFromDatabase`;
      
      if (typeof service[methodName] !== 'function') {
        service[methodName] = async function() {
          try {
            console.log(`Getting ${entity} count from database...`);
            
            // Ensure pool is initialized
            if (!this.pool) {
              console.log(`Initializing pool for ${methodName}() in ${serviceKey}...`);
              this.pool = await this.initializePool();
            }
            
            const result = await this.pool.request()
              .query(`
                SELECT COUNT(*) AS count
                FROM ${tableName}
              `);
            
            return result.recordset[0].count;
          } catch (error) {
            console.error(`Error in ${methodName} for ${entity}:`, error.message);
            return 0; // Default to 0 on error
          }
        };
        console.log(`Added ${methodName} method to ${serviceKey}`);
      }
    });
    
    // Add performIncrementalSync method
    if (typeof service.performIncrementalSync !== 'function') {
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
    
    // Add initializePool method if it doesn't exist
    if (typeof service.initializePool !== 'function') {
      service.initializePool = async function() {
        try {
          console.log(`Initializing pool for ${serviceKey}...`);
          
          // Use the dbConfig from the service if available
          const dbConfig = this.dbConfig || this.config || {
            server: process.env.SQL_SERVER || process.env.DB_HOST,
            port: parseInt(process.env.SQL_PORT || process.env.DB_PORT || '1433', 10),
            database: process.env.SQL_DATABASE || process.env.DB_NAME,
            user: process.env.SQL_USER || process.env.DB_USER,
            password: process.env.SQL_PASSWORD || process.env.DB_PASSWORD,
            options: {
              encrypt: true,
              trustServerCertificate: false,
              enableArithAbort: true
            }
          };
          
          // Create and return the pool
          return await new sql.ConnectionPool(dbConfig).connect();
        } catch (error) {
          console.error(`Error initializing pool for ${serviceKey}:`, error.message);
          throw error;
        }
      };
      console.log(`Added initializePool method to ${serviceKey}`);
    }
  });
  
  console.log('All missing methods added to service classes (comprehensive inline version)');
  return services;
};

// Create Express app
const app = express();

// Use CORS middleware
app.use(cors());

// Use JSON middleware
app.use(express.json());

// Get port from environment variable or use default
const port = process.env.PORT || 8080;

// Environment variable consistency fix for Picqer API URL
const picqerApiUrl = process.env.PICQER_API_URL || process.env.PICQER_BASE_URL;
if (!picqerApiUrl) {
  console.error('ERROR: Neither PICQER_API_URL nor PICQER_BASE_URL environment variables are set');
  process.exit(1);
}

// Log for debugging
console.log(`Using Picqer API URL: ${picqerApiUrl}`);

// Get database configuration that works with both SQL_ and DB_ prefixed variables
const dbConfig = dbAdapter.getDatabaseConfig();

// Validate database configuration
try {
  dbAdapter.validateDatabaseConfig(dbConfig);
  console.log('Database configuration validated successfully');
} catch (error) {
  console.error('Database configuration validation failed:', error.message);
  console.error('The middleware will start, but database operations will likely fail');
}

// Create Picqer API client directly
const picqerClient = new PicqerApiClient(
  process.env.PICQER_API_KEY,
  picqerApiUrl,
  {
    requestsPerMinute: 30,
    maxRetries: 5,
    waitOnRateLimit: true,
    sleepTimeOnRateLimitHitInMs: 20000
  }
);

// Create service instances with the unified database configuration
const services = {
  BatchService: new BatchService(
    process.env.PICQER_API_KEY,
    picqerApiUrl,
    dbConfig
  ),
  PicklistService: new PicklistService(
    process.env.PICQER_API_KEY,
    picqerApiUrl,
    dbConfig
  ),
  WarehouseService: new WarehouseService(
    process.env.PICQER_API_KEY,
    picqerApiUrl,
    dbConfig
  ),
  UserService: new UserService(
    process.env.PICQER_API_KEY,
    picqerApiUrl,
    dbConfig
  ),
  SupplierService: new SupplierService(
    process.env.PICQER_API_KEY,
    picqerApiUrl,
    dbConfig
  )
};

// Add missing methods to service classes BEFORE integrating sync methods
// This ensures all required methods are available
addMissingServiceMethods(services);

// Integrate sync methods into service classes
integrateSyncMethods(services);

// Initialize services
async function initializeServices() {
  try {
    console.log('Initializing services...');
    
    // Initialize BatchService
    if (typeof services.BatchService.initialize === 'function') {
      await services.BatchService.initialize();
    }
    
    // Initialize PicklistService
    if (typeof services.PicklistService.initialize === 'function') {
      await services.PicklistService.initialize();
    }
    
    // Initialize WarehouseService
    if (typeof services.WarehouseService.initialize === 'function') {
      await services.WarehouseService.initialize();
    }
    
    // Initialize UserService
    if (typeof services.UserService.initialize === 'function') {
      await services.UserService.initialize();
    }
    
    // Initialize SupplierService
    if (typeof services.SupplierService.initialize === 'function') {
      await services.SupplierService.initialize();
    }
    
    console.log('All services initialized successfully');
  } catch (error) {
    console.error('Error initializing services:', error.message);
  }
}

// Initialize services on startup
initializeServices();

// Create basic API endpoints for dashboard functionality
const apiRouter = express.Router();

// Status endpoint
apiRouter.get('/status', (req, res) => {
  res.json({
    online: true,
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Use our API router
app.use('/api', apiRouter);

// Initialize API adapters
if (apiAdapterModule && typeof apiAdapterModule.initializeServices === 'function') {
  apiAdapterModule.initializeServices(services);
}

// Initialize data sync API adapter with services
if (dataSyncApiAdapterModule && typeof dataSyncApiAdapterModule.initializeServices === 'function') {
  dataSyncApiAdapterModule.initializeServices(services);
}

// Initialize batch dashboard API adapter
if (batchDashboardApiModule && typeof batchDashboardApiModule.initializeServices === 'function') {
  batchDashboardApiModule.initializeServices(services);
}

// Use API routers
if (apiAdapterModule && apiAdapterModule.router) {
  app.use('/api', apiAdapterModule.router);
}

// Use data sync API router
if (dataSyncApiAdapterModule && dataSyncApiAdapterModule.router) {
  app.use('/api', dataSyncApiAdapterModule.router);
}

// Use batch dashboard API router
if (batchDashboardApiModule && batchDashboardApiModule.router) {
  app.use('/api', batchDashboardApiModule.router);
}

// Create dashboard directory if it doesn't exist
const dashboardDir = path.join(__dirname, 'dashboard');
if (!fs.existsSync(dashboardDir)) {
  console.log('Creating dashboard directory');
  fs.mkdirSync(dashboardDir, { recursive: true });
}

// Serve static dashboard files
app.use(express.static(path.join(__dirname, 'dashboard')));

// Add explicit route for /dashboard/ path
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'dashboard.html'));
});

app.get('/dashboard/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'dashboard.html'));
});

// Serve dashboard at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'dashboard.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`Picqer middleware server running on port ${port}`);
  console.log(`Dashboard available at: http://localhost:${port}/dashboard/`);
  console.log(`API available at: http://localhost:${port}/api/`);
});

module.exports = app;
