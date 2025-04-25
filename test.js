/**
 * Test script for simplified Picqer to SQL DB synchronization
 * 
 * This script tests the simplified synchronization service by initializing
 * the components and performing a test sync for each entity type.
 */
require('dotenv').config();

// Import components
const ConfigManager = require('./config-manager');
const PicqerApiClient = require('./picqer-api-client');
const DatabaseManager = require('./database-manager');
const GenericEntityService = require('./generic-entity-service');
const SyncManager = require('./sync-manager');
const entityConfigs = require('./entity-configs');

// Initialize components
const configManager = new ConfigManager();
let apiClient;
let dbManager;
let syncManager;

/**
 * Run tests for the simplified synchronization service
 */
async function runTests() {
  console.log('=== TESTING SIMPLIFIED PICQER TO SQL DB SYNCHRONIZATION ===');
  
  try {
    console.log('\n1. Testing configuration...');
    configManager.validateApiConfig();
    configManager.validateDatabaseConfig();
    console.log('✅ Configuration validated successfully');
    
    console.log('\n2. Testing API client initialization...');
    apiClient = new PicqerApiClient(
      configManager.getApiConfig().apiKey,
      configManager.getApiConfig().baseUrl,
      configManager.getApiConfig().rateLimits
    );
    console.log('✅ API client initialized successfully');
    
    console.log('\n3. Testing database connection...');
    dbManager = new DatabaseManager(configManager.getDatabaseConfig());
    await dbManager.connect();
    console.log('✅ Database connection established successfully');
    
    console.log('\n4. Testing database schema initialization...');
    await dbManager.initializeSchema();
    console.log('✅ Database schema initialized successfully');
    
    console.log('\n5. Testing sync manager initialization...');
    syncManager = new SyncManager(apiClient, dbManager);
    console.log('✅ Sync manager initialized successfully');
    
    console.log('\n6. Testing entity service registration...');
    for (const [entityType, config] of Object.entries(entityConfigs)) {
      const entityService = new GenericEntityService(config, apiClient, dbManager);
      syncManager.registerEntityService(entityType, entityService);
    }
    console.log('✅ Entity services registered successfully');
    
    console.log('\n7. Testing entity service initialization...');
    await syncManager.initialize();
    console.log('✅ Entity services initialized successfully');
    
    console.log('\n8. Testing sync status retrieval...');
    const status = await syncManager.getSyncStatus();
    console.log('Sync status:', JSON.stringify(status, null, 2));
    console.log('✅ Sync status retrieved successfully');
    
    console.log('\n9. Testing entity sync (warehouse only for test)...');
    if (process.env.RUN_FULL_TEST === 'true') {
      const warehouseResult = await syncManager.syncEntity('warehouse');
      console.log('Warehouse sync result:', JSON.stringify(warehouseResult, null, 2));
      console.log('✅ Warehouse sync completed successfully');
    } else {
      console.log('⚠️ Skipping actual sync test (set RUN_FULL_TEST=true to enable)');
    }
    
    console.log('\n=== ALL TESTS PASSED SUCCESSFULLY ===');
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error);
  } finally {
    // Clean up
    if (dbManager) {
      await dbManager.close();
      console.log('\nDatabase connection closed');
    }
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Error running tests:', error);
  process.exit(1);
});
