const express = require('express');
const path = require('path');
const PicqerService = require('./picqer-service');
const cron = require('node-cron');
require('dotenv').config();

// Initialize Express app
const app = express();
const port = process.env.PORT || 8080;

// Create PicqerService instance with corrected environment variable names
const picqerService = new PicqerService(
  process.env.PICQER_API_KEY,
  process.env.PICQER_BASE_URL, // Changed from PICQER_API_URL to PICQER_BASE_URL
  {
    server: process.env.SQL_SERVER,     // Changed from DB_SERVER to SQL_SERVER
    database: process.env.SQL_DATABASE, // Changed from DB_NAME to SQL_DATABASE
    user: process.env.SQL_USER,         // Changed from DB_USER to SQL_USER
    password: process.env.SQL_PASSWORD, // Changed from DB_PASSWORD to SQL_PASSWORD
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

// API Routes
app.get('/api/test', async (req, res) => {
  try {
    const result = await picqerService.testConnection();
    res.json({ success: true, message: 'API connection successful', data: result });
  } catch (error) {
    res.json({ success: false, message: `API connection failed: ${error.message}` });
  }
});

app.get('/api/sync', async (req, res) => {
  try {
    const fullSync = req.query.full === 'true';
    
    if (fullSync) {
      const result = await picqerService.performFullSync();
      res.json(result);
    } else {
      const result = await picqerService.performIncrementalSync();
      res.json(result);
    }
  } catch (error) {
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
    res.json({ success: false, message: `Error getting stats: ${error.message}` });
  }
});

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard/dashboard.html'));
});

// Schedule hourly sync
cron.schedule('0 * * * *', async () => {
  console.log('Running scheduled sync...');
  try {
    await picqerService.performIncrementalSync();
    console.log('Scheduled sync completed successfully');
  } catch (error) {
    console.error('Scheduled sync failed:', error.message);
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
