/**
 * Sync Functionality Test Script
 * 
 * This script tests the sync functionality to verify that it works correctly
 * with the updated database connection adapter.
 */

require('dotenv').config();
const SyncImplementation = require('./sync_implementation');
const BatchService = require('./batch_service');
const PicklistService = require('./picklist-service');
const WarehouseService = require('./warehouse_service');
const UserService = require('./user_service');
const SupplierService = require('./supplier_service');
const dbAdapter = require('./db-connection-adapter');

async function testSyncFunctionality() {
  console.log('Starting sync functionality test...');
  
  // Get database configuration from adapter
  const dbConfig = dbAdapter.getDatabaseConfig();
  
  try {
    // Validate configuration
    dbAdapter.validateDatabaseConfig(dbConfig);
    console.log('Database configuration is valid');
    
    // Create service instances with the unified database configuration
    const services = {
      BatchService: new BatchService(
        process.env.PICQER_API_KEY,
        process.env.PICQER_BASE_URL || process.env.PICQER_API_URL,
        dbConfig
      ),
      PicklistService: new PicklistService(
        process.env.PICQER_API_KEY,
        process.env.PICQER_BASE_URL || process.env.PICQER_API_URL,
        dbConfig
      ),
      WarehouseService: new WarehouseService(
        process.env.PICQER_API_KEY,
        process.env.PICQER_BASE_URL || process.env.PICQER_API_URL,
        dbConfig
      ),
      UserService: new UserService(
        process.env.PICQER_API_KEY,
        process.env.PICQER_BASE_URL || process.env.PICQER_API_URL,
        dbConfig
      ),
      SupplierService: new SupplierService(
        process.env.PICQER_API_KEY,
        process.env.PICQER_BASE_URL || process.env.PICQER_API_URL,
        dbConfig
      )
    };
    
    console.log('Services created successfully');
    
    // Initialize services
    console.log('Initializing services...');
    await services.BatchService.initialize();
    await services.PicklistService.initialize();
    await services.WarehouseService.initialize();
    await services.UserService.initialize();
    await services.SupplierService.initialize();
    console.log('All services initialized successfully');
    
    // Create sync implementation
    const syncImplementation = new SyncImplementation(services);
    console.log('Sync implementation created successfully');
    
    // Test sync methods
    console.log('Testing syncAll method...');
    const syncAllResult = await syncImplementation.syncAll(false);
    console.log('syncAll result:', syncAllResult);
    
    return {
      success: true,
      message: 'Sync functionality test successful',
      result: syncAllResult
    };
  } catch (error) {
    console.error('Sync functionality test failed:', error.message);
    
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
      console.log('✅ ' + result.message);
      process.exit(0);
    } else {
      console.error('❌ Test failed:', result.error);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
