/**
 * Enhanced Index.js with Robust Error Handling for Service Initialization
 * 
 * This version includes additional error handling to diagnose and recover from
 * module loading issues, particularly for the WarehouseService.
 */

// Import required modules
const express = require('express');
const path = require('path');
const cors = require('cors');
const sql = require('mssql');
const fs = require('fs');
require('dotenv').config();

// Create Express app
const app = express();

// Configure middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database configuration
const dbConfig = {
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    connectionTimeout: 30000  // Increase to 30 seconds
  }
};

// Picqer API configuration
const apiKey = process.env.PICQER_API_KEY;
const baseUrl = process.env.PICQER_BASE_URL;

// Diagnostic function to check file existence and content
function checkServiceFile(filename) {
  try {
    if (fs.existsSync(filename)) {
      console.log(`✅ File ${filename} exists`);
      
      // Read first few lines to verify content
      const content = fs.readFileSync(filename, 'utf8').slice(0, 500);
      console.log(`File content preview: ${content.substring(0, 100)}...`);
      
      // Check if it contains class definition
      if (content.includes('class ') && content.includes('constructor')) {
        console.log(`✅ File ${filename} contains a class definition`);
      } else {
        console.log(`❌ File ${filename} does not contain a class definition`);
      }
      
      return true;
    } else {
      console.log(`❌ File ${filename} does not exist`);
      return false;
    }
  } catch (error) {
    console.error(`Error checking file ${filename}:`, error.message);
    return false;
  }
}

// Import service classes with error handling
let PicqerService, PicklistService, WarehouseService, UserService, SupplierService;
let apiAdapter = { router: express.Router() };
let initializeServices = () => {};

try {
  console.log('Importing PicqerService...');
  PicqerService = require('./picqer-service');
} catch (error) {
  console.error('Error importing PicqerService:', error.message);
  checkServiceFile('./picqer-service.js');
  // Fallback implementation
  PicqerService = class {
    constructor(apiKey, baseUrl, sqlConfig) {
      this.apiKey = apiKey;
      this.baseUrl = baseUrl;
      this.sqlConfig = sqlConfig;
      console.log('Using fallback PicqerService');
    }
    async initializeDatabase() {
      console.log('Using fallback initializeDatabase method');
      return true;
    }
  };
}

try {
  console.log('Importing PicklistService...');
  PicklistService = require('./picklist-service');
} catch (error) {
  console.error('Error importing PicklistService:', error.message);
  checkServiceFile('./picklist-service.js');
  // Fallback implementation
  PicklistService = class {
    constructor(apiKey, baseUrl, sqlConfig) {
      this.apiKey = apiKey;
      this.baseUrl = baseUrl;
      this.sqlConfig = sqlConfig;
      console.log('Using fallback PicklistService');
    }
    async initializePicklistsDatabase() {
      console.log('Using fallback initializePicklistsDatabase method');
      return true;
    }
  };
}

try {
  console.log('Importing WarehouseService...');
  // Try multiple possible filenames
  const possibleFiles = [
    './warehouse_service.js',
    './warehouse-service.js',
    './warehouseService.js',
    './WarehouseService.js'
  ];
  
  let loaded = false;
  for (const file of possibleFiles) {
    try {
      if (checkServiceFile(file)) {
        console.log(`Attempting to load from ${file}...`);
        WarehouseService = require(file.replace('.js', ''));
        if (typeof WarehouseService === 'function') {
          console.log(`✅ Successfully loaded WarehouseService from ${file}`);
          loaded = true;
          break;
        } else {
          console.log(`❌ File ${file} does not export a constructor function`);
        }
      }
    } catch (innerError) {
      console.error(`Error loading from ${file}:`, innerError.message);
    }
  }
  
  if (!loaded) {
    throw new Error('Could not load WarehouseService from any expected location');
  }
} catch (error) {
  console.error('Error importing WarehouseService:', error.message);
  
  // Define inline class as fallback
  console.log('Creating fallback WarehouseService class');
  WarehouseService = class {
    constructor(apiKey, baseUrl, sqlConfig) {
      this.apiKey = apiKey;
      this.baseUrl = baseUrl;
      this.sqlConfig = sqlConfig;
      console.log('Using fallback WarehouseService');
    }
    
    async initializeWarehousesDatabase() {
      console.log('Using fallback initializeWarehousesDatabase method');
      return true;
    }
    
    async getAllWarehouses() {
      return [];
    }
    
    async syncWarehouses() {
      return { success: true, savedCount: 0, errorCount: 0 };
    }
    
    async addUniqueConstraintToWarehousesTable() {
      return true;
    }
    
    async syncAllWarehouses() {
      return { success: true, warehouses: 0, saved: 0, errors: 0 };
    }
  };
}

try {
  console.log('Importing UserService...');
  UserService = require('./user_service');
} catch (error) {
  console.error('Error importing UserService:', error.message);
  checkServiceFile('./user_service.js');
  // Fallback implementation
  UserService = class {
    constructor(apiKey, baseUrl, sqlConfig) {
      this.apiKey = apiKey;
      this.baseUrl = baseUrl;
      this.sqlConfig = sqlConfig;
      console.log('Using fallback UserService');
    }
    async initializeUsersDatabase() {
      console.log('Using fallback initializeUsersDatabase method');
      return true;
    }
  };
}

try {
  console.log('Importing SupplierService...');
  SupplierService = require('./supplier_service');
} catch (error) {
  console.error('Error importing SupplierService:', error.message);
  checkServiceFile('./supplier_service.js');
  // Fallback implementation
  SupplierService = class {
    constructor(apiKey, baseUrl, sqlConfig) {
      this.apiKey = apiKey;
      this.baseUrl = baseUrl;
      this.sqlConfig = sqlConfig;
      console.log('Using fallback SupplierService');
    }
    async initializeSuppliersDatabase() {
      console.log('Using fallback initializeSuppliersDatabase method');
      return true;
    }
  };
}

try {
  console.log('Importing API adapter...');
  const adapterModule = require('./data_sync_api_adapter');
  apiAdapter = adapterModule.router;
  initializeServices = adapterModule.initializeServices;
} catch (error) {
  console.error('Error importing API adapter:', error.message);
  checkServiceFile('./data_sync_api_adapter.js');
  // Fallback implementation
  apiAdapter = express.Router();
  apiAdapter.get('/status', (req, res) => {
    res.json({ status: 'API adapter fallback active', error: 'Original module failed to load' });
  });
  initializeServices = () => console.log('Using fallback initializeServices function');
}

// Initialize services with proper error handling
console.log('Initializing services...');
let picqerService, picklistService, warehouseService, userService, supplierService;

try {
  console.log('Creating PicqerService instance...');
  picqerService = new PicqerService(apiKey, baseUrl, dbConfig);
} catch (error) {
  console.error('Error creating PicqerService instance:', error.message);
}

try {
  console.log('Creating PicklistService instance...');
  picklistService = new PicklistService(apiKey, baseUrl, dbConfig);
} catch (error) {
  console.error('Error creating PicklistService instance:', error.message);
}

try {
  console.log('Creating WarehouseService instance...');
  console.log('WarehouseService type:', typeof WarehouseService);
  console.log('WarehouseService constructor?', typeof WarehouseService === 'function');
  
  if (typeof WarehouseService === 'function') {
    warehouseService = new WarehouseService(apiKey, baseUrl, dbConfig);
  } else {
    console.error('WarehouseService is not a constructor function');
    
    // Try to adapt to whatever was exported
    if (typeof WarehouseService === 'object' && WarehouseService !== null) {
      console.log('WarehouseService is an object, creating wrapper...');
      
      // Create a wrapper class that delegates to the exported object
      const WarehouseServiceWrapper = class {
        constructor(apiKey, baseUrl, sqlConfig) {
          this.apiKey = apiKey;
          this.baseUrl = baseUrl;
          this.sqlConfig = sqlConfig;
          console.log('Using WarehouseService wrapper');
        }
      };
      
      // Add methods from the exported object to the wrapper
      for (const key of Object.keys(WarehouseService)) {
        if (typeof WarehouseService[key] === 'function') {
          WarehouseServiceWrapper.prototype[key] = function(...args) {
            return WarehouseService[key](...args);
          };
        }
      }
      
      warehouseService = new WarehouseServiceWrapper(apiKey, baseUrl, dbConfig);
    } else {
      throw new Error('Cannot adapt WarehouseService to a usable form');
    }
  }
} catch (error) {
  console.error('Error creating WarehouseService instance:', error.message);
  
  // Create a minimal implementation
  warehouseService = {
    initializeWarehousesDatabase: async () => {
      console.log('Using minimal initializeWarehousesDatabase implementation');
      return true;
    }
  };
}

try {
  console.log('Creating UserService instance...');
  userService = new UserService(apiKey, baseUrl, dbConfig);
} catch (error) {
  console.error('Error creating UserService instance:', error.message);
}

try {
  console.log('Creating SupplierService instance...');
  supplierService = new SupplierService(apiKey, baseUrl, dbConfig);
} catch (error) {
  console.error('Error creating SupplierService instance:', error.message);
}

// Initialize API adapter with service instances
try {
  console.log('Initializing API adapter...');
  initializeServices({
    ProductService: picqerService,
    PicklistService: picklistService,
    WarehouseService: warehouseService,
    UserService: userService,
    SupplierService: supplierService
  });
} catch (error) {
  console.error('Error initializing API adapter:', error.message);
}

// API routes
app.use('/api', apiAdapter);

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard/dashboard.html'));
});

// Serve static files from dashboard directory
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

// Diagnostic endpoint
app.get('/diagnostic', (req, res) => {
  const diagnostic = {
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      env: {
        NODE_ENV: process.env.NODE_ENV
      }
    },
    services: {
      picqerService: {
        type: typeof picqerService,
        isInstance: picqerService instanceof PicqerService,
        methods: Object.getOwnPropertyNames(Object.getPrototypeOf(picqerService))
      },
      picklistService: {
        type: typeof picklistService,
        isInstance: picklistService instanceof PicklistService,
        methods: Object.getOwnPropertyNames(Object.getPrototypeOf(picklistService))
      },
      warehouseService: {
        type: typeof warehouseService,
        isInstance: warehouseService instanceof WarehouseService,
        methods: warehouseService ? Object.getOwnPropertyNames(Object.getPrototypeOf(warehouseService)) : []
      },
      userService: {
        type: typeof userService,
        isInstance: userService instanceof UserService,
        methods: Object.getOwnPropertyNames(Object.getPrototypeOf(userService))
      },
      supplierService: {
        type: typeof supplierService,
        isInstance: supplierService instanceof SupplierService,
        methods: Object.getOwnPropertyNames(Object.getPrototypeOf(supplierService))
      }
    },
    files: {
      picqerService: fs.existsSync('./picqer-service.js'),
      picklistService: fs.existsSync('./picklist-service.js'),
      warehouseService: fs.existsSync('./warehouse_service.js'),
      warehouseServiceHyphen: fs.existsSync('./warehouse-service.js'),
      warehouseServiceCamel: fs.existsSync('./warehouseService.js'),
      warehouseServicePascal: fs.existsSync('./WarehouseService.js'),
      userService: fs.existsSync('./user_service.js'),
      supplierService: fs.existsSync('./supplier_service.js'),
      apiAdapter: fs.existsSync('./data_sync_api_adapter.js')
    }
  };
  
  res.json(diagnostic);
});

// Initialize database
async function initializeDatabase() {
  try {
    console.log('Initializing database...');
    
    // Initialize product schema
    if (picqerService && typeof picqerService.initializeDatabase === 'function') {
      await picqerService.initializeDatabase();
    } else {
      console.log('Skipping product schema initialization - method not available');
    }
    
    // Initialize picklists schema
    if (picklistService && typeof picklistService.initializePicklistsDatabase === 'function') {
      await picklistService.initializePicklistsDatabase();
    } else {
      console.log('Skipping picklists schema initialization - method not available');
    }
    
    // Initialize warehouses schema
    if (warehouseService && typeof warehouseService.initializeWarehousesDatabase === 'function') {
      await warehouseService.initializeWarehousesDatabase();
    } else {
      console.log('Skipping warehouses schema initialization - method not available');
    }
    
    // Initialize users schema
    if (userService && typeof userService.initializeUsersDatabase === 'function') {
      await userService.initializeUsersDatabase();
    } else {
      console.log('Skipping users schema initialization - method not available');
    }
    
    // Initialize suppliers schema
    if (supplierService && typeof supplierService.initializeSuppliersDatabase === 'function') {
      await supplierService.initializeSuppliersDatabase();
    } else {
      console.log('Skipping suppliers schema initialization - method not available');
    }
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error.message);
  }
}

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => {
  console.log(`Picqer middleware server running on port ${PORT}`);
  
  // Initialize database after server starts
  await initializeDatabase();
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Close database connection
  try {
    await sql.close();
    console.log('Database connection closed');
  } catch (err) {
    console.error('Error closing database connection:', err.message);
  }
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  
  // Close database connection
  try {
    await sql.close();
    console.log('Database connection closed');
  } catch (err) {
    console.error('Error closing database connection:', err.message);
  }
  
  process.exit(0);
});

module.exports = app;
