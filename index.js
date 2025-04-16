const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const sql = require('mssql');
const PicqerService = require('./picqer-service');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

// SQL configuration
const sqlConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

// Initialize Picqer service
const picqerService = new PicqerService(
  process.env.PICQER_API_KEY,
  process.env.PICQER_BASE_URL,
  sqlConfig
);

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard/enhanced-dashboard.html'));
});

// API routes
app.get('/api/test', async (req, res) => {
  try {
    const result = await picqerService.testConnection();
    res.json({ success: true, message: 'Connection to Picqer API successful', data: result });
  } catch (error) {
    console.error('Error testing connection:', error.message);
    res.status(500).json({ success: false, message: `Error testing connection: ${error.message}` });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const products = await picqerService.getAllProducts();
    res.json({ success: true, count: products.length, products });
  } catch (error) {
    console.error('Error fetching products:', error.message);
    res.status(500).json({ success: false, message: `Error fetching products: ${error.message}` });
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
    console.error('Error during sync:', error.message);
    res.status(500).json({ success: false, message: `Error during sync: ${error.message}` });
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
        lastSyncDate: lastSyncDate.toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error.message);
    res.status(500).json({ success: false, message: `Error fetching stats: ${error.message}` });
  }
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database
    await picqerService.initializeDatabase();
    console.log('Database initialized successfully');
    
    // Start server
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
    
    // Schedule hourly sync
    setInterval(async () => {
      try {
        console.log('Starting scheduled sync...');
        await picqerService.performIncrementalSync();
      } catch (error) {
        console.error('Scheduled sync failed:', error.message);
      }
    }, 60 * 60 * 1000); // Run every hour
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
