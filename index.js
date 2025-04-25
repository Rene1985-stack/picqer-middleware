/**
 * Simplified Picqer to SQL DB Synchronization
 * 
 * This is the main entry point for the simplified synchronization service
 * between Picqer and SQL database.
 */
require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const bodyParser = require('body-parser');
const cors = require('cors');

// Import components
const ConfigManager = require('./config-manager');
const PicqerApiClient = require('./picqer-api-client');
const DatabaseManager = require('./database-manager');
const GenericEntityService = require('./generic-entity-service');
const SyncManager = require('./sync-manager');
const entityConfigs = require('./entity-configs');

// Create Express app
const app = express();
app.use(bodyParser.json());
app.use(cors());

// Initialize components
const configManager = new ConfigManager();
let apiClient;
let dbManager;
let syncManager;

/**
 * Initialize the application
 * @returns {Promise<boolean>} - Success status
 */
async function initialize() {
  try {
    console.log('Initializing application...');
    
    // Validate configuration
    configManager.validateApiConfig();
    configManager.validateDatabaseConfig();
    
    // Initialize API client
    apiClient = new PicqerApiClient(
      configManager.getApiConfig().apiKey,
      configManager.getApiConfig().baseUrl,
      configManager.getApiConfig().rateLimits
    );
    
    // Initialize database manager
    dbManager = new DatabaseManager(configManager.getDatabaseConfig());
    await dbManager.connect();
    await dbManager.initializeSchema();
    
    // Initialize sync manager
    syncManager = new SyncManager(apiClient, dbManager);
    
    // Register entity services
    for (const [entityType, config] of Object.entries(entityConfigs)) {
      const entityService = new GenericEntityService(config, apiClient, dbManager);
      syncManager.registerEntityService(entityType, entityService);
    }
    
    // Initialize all entity services
    await syncManager.initialize();
    
    console.log('Application initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing application:', error.message);
    return false;
  }
}

// Set up API endpoints
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Picqer to SQL DB Synchronization Service',
    version: '2.0.0'
  });
});

// Sync all entities
app.post('/api/sync/all', async (req, res) => {
  try {
    const result = await syncManager.syncAll();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Error syncing all entities: ${error.message}`,
      error: error.message
    });
  }
});

// Sync specific entity type
app.post('/api/sync/:entityType', async (req, res) => {
  const { entityType } = req.params;
  
  if (!entityConfigs[entityType]) {
    return res.status(400).json({
      success: false,
      message: `Invalid entity type: ${entityType}`,
      error: 'Invalid entity type'
    });
  }
  
  try {
    const result = await syncManager.syncEntity(entityType);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Error syncing ${entityType}: ${error.message}`,
      error: error.message
    });
  }
});

// Get sync status
app.get('/api/sync/status', async (req, res) => {
  try {
    const status = await syncManager.getSyncStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Error getting sync status: ${error.message}`,
      error: error.message
    });
  }
});

// Start the application
async function startApp() {
  const initialized = await initialize();
  
  if (!initialized) {
    console.error('Failed to initialize application');
    process.exit(1);
  }
  
  // Start the server
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
  
  // Schedule daily sync at 1:00 AM
  cron.schedule('0 1 * * *', async () => {
    console.log('Running scheduled sync...');
    try {
      await syncManager.syncAll();
      console.log('Scheduled sync completed successfully');
    } catch (error) {
      console.error('Error in scheduled sync:', error.message);
    }
  });
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  if (dbManager) {
    await dbManager.close();
  }
  
  process.exit(0);
});

// Start the application
startApp().catch(error => {
  console.error('Error starting application:', error);
  process.exit(1);
});

module.exports = app;
