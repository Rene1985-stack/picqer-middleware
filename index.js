/**
 * Enhanced API Server with Entity-Specific Attributes
 * 
 * This file sets up an Express server with API endpoints for syncing entities
 * with support for entity-specific attributes, pagination, and rate limiting.
 */
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import components
const EnhancedPicqerApiClient = require('./enhanced-picqer-api-client');
const DatabaseManager = require('./database-manager');
const EnhancedSyncManager = require('./enhanced-sync-manager');

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Initialize components
const apiClient = new EnhancedPicqerApiClient({
  apiUrl: process.env.PICQER_API_URL || process.env.PICQER_BASE_URL,
  apiKey: process.env.PICQER_API_KEY,
  waitOnRateLimit: process.env.PICQER_RATE_LIMIT_WAIT === 'true',
  sleepTimeOnRateLimitHit: parseInt(process.env.PICQER_RATE_LIMIT_SLEEP_MS || '20000'),
  requestDelay: parseInt(process.env.PICQER_REQUEST_DELAY_MS || '100')
});

const dbManager = new DatabaseManager({
  server: process.env.SQL_SERVER || process.env.DB_HOST,
  database: process.env.SQL_DATABASE || process.env.DB_NAME,
  user: process.env.SQL_USER || process.env.DB_USER,
  password: process.env.SQL_PASSWORD || process.env.DB_PASSWORD,
  port: parseInt(process.env.SQL_PORT || process.env.DB_PORT || '1433'),
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
});

const syncManager = new EnhancedSyncManager(apiClient, dbManager);

// API routes
app.get('/', (req, res) => {
  res.json({
    message: 'Picqer to SQL DB Sync API',
    version: '2.0.0',
    endpoints: [
      '/api/sync/all',
      '/api/sync/:entityType',
      '/api/sync/status'
    ]
  });
});

// Sync all entities
app.post('/api/sync/all', async (req, res) => {
  try {
    console.log('Starting sync for all entities...');
    const result = await syncManager.syncAll();
    res.json(result);
  } catch (error) {
    console.error('Error syncing all entities:', error.message);
    res.status(500).json({
      success: false,
      message: `Error syncing all entities: ${error.message}`
    });
  }
});

// Sync specific entity type
app.post('/api/sync/:entityType', async (req, res) => {
  const { entityType } = req.params;
  
  try {
    console.log(`Starting sync for ${entityType}...`);
    const result = await syncManager.syncEntity(entityType);
    res.json(result);
  } catch (error) {
    console.error(`Error syncing ${entityType}:`, error.message);
    res.status(500).json({
      success: false,
      message: `Error syncing ${entityType}: ${error.message}`
    });
  }
});

// Get sync status
app.get('/api/sync/status', async (req, res) => {
  try {
    const status = await syncManager.getSyncStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting sync status:', error.message);
    res.status(500).json({
      success: false,
      message: `Error getting sync status: ${error.message}`
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Enhanced Picqer Sync API server running on port ${port}`);
});

module.exports = app;
