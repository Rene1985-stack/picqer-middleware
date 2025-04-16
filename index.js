/**
 * Enhanced index.js with picklists integration
 * Integrates both product and picklist sync functionality
 * Modified to work with existing PicqerService
 */
const express = require('express');
const path = require('path');
const PicqerService = require('./picqer-service'); // Using existing picqer-service.js
const PicklistService = require('./picklist-service');
const dashboard = require('./dashboard/dashboard-api');
const cron = require('node-cron');
require('dotenv').config();

// Initialize Express app
const app = express();
const port = process.env.PORT || 8080;

// Parse JSON request bodies
app.use(express.json());

// Create PicqerService instance with corrected environment variable names
const picqerService = new PicqerService(
  process.env.PICQER_API_KEY,
  process.env.PICQER_BASE_URL, // Using PICQER_BASE_URL instead of PICQER_API_URL
  {
    server: process.env.SQL_SERVER,     // Using SQL_SERVER instead of DB_SERVER
    database: process.env.SQL_DATABASE, // Using SQL_DATABASE instead of DB_NAME
    user: process.env.SQL_USER,         // Using SQL_USER instead of DB_USER
    password: process.env.SQL_PASSWORD, // Using SQL_PASSWORD instead of DB_PASSWORD
    options: {
      encrypt: true,
      trustServerCertificate: false
    }
  }
);

// Create PicklistService instance with the same configuration
const picklistService = new PicklistService(
  process.env.PICQER_API_KEY,
  process.env.PICQER_BASE_URL,
  {
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    options: {
      encrypt: true,
      trustServerCertificate: false
    }
  }
);

// Initialize database
async function initializeDatabase() {
  try {
    // Initialize product database
    await picqerService.initializeDatabase();
    console.log('Product database initialized successfully');
    
    // Initialize picklists database
    await picklistService.initializePicklistsDatabase();
    console.log('Picklists database initialized successfully');
    
    dashboard.addLog('info', 'Database initialized successfully (products and picklists)');
  } catch (error) {
    console.error('Error initializing database:', error.message);
    dashboard.addLog('error', `Error initializing database: ${error.message}`);
  }
}

// Initialize database on startup
initializeDatabase();

// Mount dashboard API routes
app.use('/dashboard', dashboard.router);

// API Routes
app.get('/api/test', async (req, res) => {
  try {
    const result = await picqerService.testConnection();
    res.json({ success: true, message: 'API connection successful', data: result });
    dashboard.addLog('info', 'API connection test successful');
  } catch (error) {
    res.json({ success: false, message: `API connection failed: ${error.message}` });
    dashboard.addLog('error', `API connection test failed: ${error.message}`);
  }
});

// Product sync endpoints
app.get('/api/sync/products', async (req, res) => {
  try {
    const fullSync = req.query.full === 'true';
    dashboard.addLog('info', `Starting ${fullSync ? 'full' : 'incremental'} product sync...`);
    
    let result;
    if (fullSync) {
      result = await picqerService.performFullSync();
    } else {
      result = await picqerService.performIncrementalSync();
    }
    
    // Add sync record to dashboard
    dashboard.addSyncRecord(result.success, result.savedCount, `Products sync: ${result.message}`);
    
    // Add log entry
    if (result.success) {
      dashboard.addLog('success', `${fullSync ? 'Full' : 'Incremental'} product sync completed: ${result.message}`);
    } else {
      dashboard.addLog('error', `${fullSync ? 'Full' : 'Incremental'} product sync failed: ${result.message}`);
    }
    
    res.json(result);
  } catch (error) {
    dashboard.addLog('error', `Product sync failed: ${error.message}`);
    res.json({ success: false, message: `Product sync failed: ${error.message}` });
  }
});

// Picklists sync endpoints
app.get('/api/sync/picklists', async (req, res) => {
  try {
    const fullSync = req.query.full === 'true';
    dashboard.addLog('info', `Starting ${fullSync ? 'full' : 'incremental'} picklists sync...`);
    
    let result;
    if (fullSync) {
      result = await picklistService.performFullPicklistsSync();
    } else {
      result = await picklistService.performIncrementalPicklistsSync();
    }
    
    // Add sync record to dashboard
    dashboard.addSyncRecord(result.success, result.savedCount, `Picklists sync: ${result.message}`);
    
    // Add log entry
    if (result.success) {
      dashboard.addLog('success', `${fullSync ? 'Full' : 'Incremental'} picklists sync completed: ${result.message}`);
    } else {
      dashboard.addLog('error', `${fullSync ? 'Full' : 'Incremental'} picklists sync failed: ${result.message}`);
    }
    
    res.json(result);
  } catch (error) {
    dashboard.addLog('error', `Picklists sync failed: ${error.message}`);
    res.json({ success: false, message: `Picklists sync failed: ${error.message}` });
  }
});

// Combined sync endpoint (both products and picklists)
app.get('/api/sync', async (req, res) => {
  try {
    const fullSync = req.query.full === 'true';
    dashboard.addLog('info', `Starting ${fullSync ? 'full' : 'incremental'} sync for all entities...`);
    
    // Sync products
    let productResult;
    try {
      if (fullSync) {
        productResult = await picqerService.performFullSync();
      } else {
        productResult = await picqerService.performIncrementalSync();
      }
      
      if (productResult.success) {
        dashboard.addLog('success', `${fullSync ? 'Full' : 'Incremental'} product sync completed: ${productResult.message}`);
      } else {
        dashboard.addLog('error', `${fullSync ? 'Full' : 'Incremental'} product sync failed: ${productResult.message}`);
      }
    } catch (productError) {
      productResult = {
        success: false,
        message: `Product sync failed: ${productError.message}`,
        savedCount: 0
      };
      dashboard.addLog('error', `Product sync failed: ${productError.message}`);
    }
    
    // Sync picklists
    let picklistResult;
    try {
      if (fullSync) {
        picklistResult = await picklistService.performFullPicklistsSync();
      } else {
        picklistResult = await picklistService.performIncrementalPicklistsSync();
      }
      
      if (picklistResult.success) {
        dashboard.addLog('success', `${fullSync ? 'Full' : 'Incremental'} picklists sync completed: ${picklistResult.message}`);
      } else {
        dashboard.addLog('error', `${fullSync ? 'Full' : 'Incremental'} picklists sync failed: ${picklistResult.message}`);
      }
    } catch (picklistError) {
      picklistResult = {
        success: false,
        message: `Picklists sync failed: ${picklistError.message}`,
        savedCount: 0
      };
      dashboard.addLog('error', `Picklists sync failed: ${picklistError.message}`);
    }
    
    // Determine overall success
    const overallSuccess = productResult.success && picklistResult.success;
    const totalSaved = (productResult.savedCount || 0) + (picklistResult.savedCount || 0);
    
    // Add combined sync record to dashboard
    dashboard.addSyncRecord(
      overallSuccess,
      totalSaved,
      `Combined sync: ${overallSuccess ? 'Completed successfully' : 'Completed with errors'}`
    );
    
    // Return combined result
    res.json({
      success: overallSuccess,
      message: `Combined sync ${overallSuccess ? 'completed successfully' : 'completed with errors'}`,
      products: productResult,
      picklists: picklistResult,
      totalSaved
    });
  } catch (error) {
    dashboard.addLog('error', `Combined sync failed: ${error.message}`);
    res.json({ success: false, message: `Combined sync failed: ${error.message}` });
  }
});

// Get stats for dashboard
app.get('/api/stats', async (req, res) => {
  try {
    // Get product stats
    const totalProducts = await picqerService.getProductCountFromDatabase();
    const lastProductSyncDate = await picqerService.getLastSyncDate('products');
    
    // Get picklist stats
    const totalPicklists = await picklistService.getPicklistCountFromDatabase();
    const lastPicklistSyncDate = await picklistService.getLastPicklistsSyncDate();
    
    res.json({
      success: true,
      stats: {
        totalProducts,
        lastProductSyncDate,
        totalPicklists,
        lastPicklistSyncDate,
        // Use the most recent sync date as the overall last sync date
        lastSyncDate: new Date(Math.max(
          lastProductSyncDate.getTime(),
          lastPicklistSyncDate.getTime()
        ))
      }
    });
  } catch (error) {
    dashboard.addLog('error', `Error getting stats: ${error.message}`);
    res.json({ success: false, message: `Error getting stats: ${error.message}` });
  }
});

// Serve static files from dashboard directory
app.use('/dashboard/static', express.static(path.join(__dirname, 'dashboard/static')));

// Dashboard route - use enhanced dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard/enhanced-dashboard.html'));
});

// Schedule hourly sync for products and picklists
cron.schedule('0 * * * *', async () => {
  console.log('Running scheduled sync...');
  dashboard.addLog('info', 'Running scheduled sync for all entities...');
  
  // Sync products
  try {
    const productResult = await picqerService.performIncrementalSync();
    if (productResult.success) {
      console.log('Scheduled product sync completed successfully');
      dashboard.addLog('success', `Scheduled product sync completed: ${productResult.savedCount} products synchronized`);
    } else {
      console.error('Scheduled product sync failed:', productResult.message);
      dashboard.addLog('error', `Scheduled product sync failed: ${productResult.message}`);
    }
  } catch (productError) {
    console.error('Scheduled product sync failed:', productError.message);
    dashboard.addLog('error', `Scheduled product sync failed: ${productError.message}`);
  }
  
  // Sync picklists
  try {
    const picklistResult = await picklistService.performIncrementalPicklistsSync();
    if (picklistResult.success) {
      console.log('Scheduled picklists sync completed successfully');
      dashboard.addLog('success', `Scheduled picklists sync completed: ${picklistResult.savedCount} picklists synchronized`);
    } else {
      console.error('Scheduled picklists sync failed:', picklistResult.message);
      dashboard.addLog('error', `Scheduled picklists sync failed: ${picklistResult.message}`);
    }
  } catch (picklistError) {
    console.error('Scheduled picklists sync failed:', picklistError.message);
    dashboard.addLog('error', `Scheduled picklists sync failed: ${picklistError.message}`);
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  dashboard.addLog('info', `Server started on port ${port}`);
});
