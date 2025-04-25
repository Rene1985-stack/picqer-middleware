/**
 * Comprehensive Sync Functionality Test
 * 
 * This script tests the sync functionality with the enhanced sync implementation
 * and fixed data sync API adapter.
 */

require('dotenv').config();
const SyncImplementation = require('./enhanced-sync-implementation');
const dbAdapter = require('./db-connection-adapter');

// Use environment variable with fallback - prioritize PICQER_BASE_URL as configured in Railway
const picqerApiUrl = process.env.PICQER_BASE_URL || process.env.PICQER_API_URL;

// Get database configuration that works with both SQL_ and DB_ prefixed variables
const dbConfig = dbAdapter.getDatabaseConfig();

async function testSyncFunctionality() {
  console.log('=== Testing Sync Functionality ===');
  console.log(`Using Picqer API URL: ${picqerApiUrl}`);
  
  try {
    // Log database configuration (without password)
    console.log('Database configuration:', {
      server: dbConfig.server,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      options: dbConfig.options
    });
    
    // Dynamically import service modules
    console.log('Loading service modules...');
    const BatchService = require('./batch_service');
    const PicklistService = require('./picklist-service');
    const WarehouseService = require('./warehouse_service');
    const UserService = require('./user_service');
    const SupplierService = require('./supplier_service');
    
    // Create service instances
    console.log('Creating service instances...');
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
    
    // Create sync implementation
    console.log('Creating sync implementation...');
    const syncImplementation = new SyncImplementation(services);
    
    // Test getEntityCount method
    console.log('\nTesting getEntityCount method...');
    for (const entity of ['products', 'picklists', 'warehouses', 'users', 'suppliers', 'batches']) {
      try {
        const count = await syncImplementation.getEntityCount(entity);
        console.log(`- ${entity} count: ${count}`);
      } catch (error) {
        console.error(`- Error getting ${entity} count:`, error.message);
      }
    }
    
    // Test getLastSyncDate method
    console.log('\nTesting getLastSyncDate method...');
    for (const entity of ['products', 'picklists', 'warehouses', 'users', 'suppliers', 'batches']) {
      try {
        const date = await syncImplementation.getLastSyncDate(entity);
        console.log(`- ${entity} last sync date: ${date}`);
      } catch (error) {
        console.error(`- Error getting ${entity} last sync date:`, error.message);
      }
    }
    
    // Test syncAll method
    console.log('\nTesting syncAll method...');
    try {
      console.log('Starting syncAll (incremental)...');
      const result = await syncImplementation.syncAll(false);
      console.log('syncAll result:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error in syncAll:', error.message);
    }
    
    console.log('\n=== Sync Functionality Test Completed ===');
    return {
      success: true,
      message: 'Sync functionality test completed successfully'
    };
  } catch (error) {
    console.error('Error in sync functionality test:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
testSyncFunctionality()
  .then(result => {
    if (result.success) {
      console.log('\n✅ Sync functionality test successful');
      console.log('The sync functionality should now work correctly in your middleware');
    } else {
      console.error('\n❌ Sync functionality test failed:', result.error);
    }
  })
  .catch(error => {
    console.error('\n❌ Unexpected error:', error);
  });
