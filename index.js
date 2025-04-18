/**
 * Updated index.js with simplified batch sync integration
 * 
 * This file integrates the simplified batch sync functionality
 * without any productivity tracking features.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const path = require('path');
const { initialize: initializeDataSync } = require('./data_sync_api_adapter');
const { initialize: initializeDashboardApi } = require('./dashboard-api');
const { initialize: initializeBatchSync } = require('./simplified_batch_sync');

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the dashboard directory
app.use(express.static(path.join(__dirname, 'dashboard')));

// Database configuration
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true
  }
};

// Picqer API configuration
const picqerConfig = {
  apiUrl: process.env.PICQER_API_URL,
  apiKey: process.env.PICQER_API_KEY,
  subdomain: process.env.PICQER_SUBDOMAIN
};

// Initialize database connection pool
const pool = new sql.ConnectionPool(dbConfig);

// Connect to database and start server
pool.connect()
  .then(() => {
    console.log('Connected to database');
    
    // Initialize API adapters
    const dataSyncRouter = initializeDataSync(pool, picqerConfig);
    const dashboardRouter = initializeDashboardApi(pool);
    const batchSyncRouter = initializeBatchSync(pool, picqerConfig);
    
    // Use API routers
    app.use('/api', dataSyncRouter);
    app.use('/api', dashboardRouter);
    app.use('/api', batchSyncRouter);
    
    // Serve the dashboard
    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'dashboard', 'dashboard.html'));
    });
    
    // Start the server
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });
