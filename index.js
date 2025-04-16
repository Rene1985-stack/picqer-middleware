const express = require('express');
const path = require('path');
const PicqerService = require('./picqer-service');
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

// Initialize database
async function initializeDatabase() {
  try {
    await picqerService.initializeDatabase();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error.message);
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

app.get('/api/sync', async (req, res) => {
  try {
    const fullSync = req.query.full === 'true';
    dashboard.addLog('info', `Starting ${fullSync ? 'full' : 'incremental'} sync...`);
    
    let result;
    if (fullSync) {
      result = await picqerService.performFullSync();
    } else {
      result = await picqerService.performIncrementalSync();
    }
    
    // Add sync record to dashboard
    dashboard.addSyncRecord(result.success, result.savedCount, result.message);
    
    // Add log entry
    if (result.success) {
      dashboard.addLog('success', `${fullSync ? 'Full' : 'Incremental'} sync completed: ${result.message}`);
    } else {
      dashboard.addLog('error', `${fullSync ? 'Full' : 'Incremental'} sync failed: ${result.message}`);
    }
    
    res.json(result);
  } catch (error) {
    dashboard.addLog('error', `Sync failed: ${error.message}`);
    res.json({ success: false, message: `Sync failed: ${error.message}` });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const totalProducts = await picqerService.getProductCountFromDatabase();
    const lastSyncDate = await picqerService.getLastSyncDate('products');
    
    res.json({
      success: true,
      stats: {
        totalProducts,
        lastSyncDate
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

// Schedule hourly sync
cron.schedule('0 * * * *', async () => {
  console.log('Running scheduled sync...');
  dashboard.addLog('info', 'Running scheduled sync...');
  try {
    const result = await picqerService.performIncrementalSync();
    if (result.success) {
      console.log('Scheduled sync completed successfully');
      dashboard.addLog('success', `Scheduled sync completed: ${result.savedCount} products synchronized`);
      dashboard.addSyncRecord(true, result.savedCount, 'Scheduled sync completed successfully');
    } else {
      console.error('Scheduled sync failed:', result.message);
      dashboard.addLog('error', `Scheduled sync failed: ${result.message}`);
      dashboard.addSyncRecord(false, 0, result.message);
    }
  } catch (error) {
    console.error('Scheduled sync failed:', error.message);
    dashboard.addLog('error', `Scheduled sync failed: ${error.message}`);
    dashboard.addSyncRecord(false, 0, error.message);
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  dashboard.addLog('info', `Server started on port ${port}`);
});
