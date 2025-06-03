/**
 * Picqer Middleware - Main Application Entry Point
 * This file initializes the Express server and all required services
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const sql = require('mssql');

// Load environment variables FIRST
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['PICQER_API_KEY', 'PICQER_API_URL', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please check your .env file and ensure all required variables are set.');
  process.exit(1);
}

// Validate database server configuration
if (!process.env.DB_HOST && !process.env.DB_SERVER) {
  console.error('Missing database server configuration. Please set either DB_HOST or DB_SERVER.');
  process.exit(1);
}

// Configure SQL connection
const sqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  server: process.env.DB_HOST || process.env.DB_SERVER,
  port: process.env.DB_PORT || 1433,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

// Configure Picqer API connection
const apiKey = process.env.PICQER_API_KEY;
const baseUrl = process.env.PICQER_API_URL;

// Import services AFTER environment variables are loaded
const PurchaseOrderService = require('./purchase_order_service');

// Initialize services with proper configuration
const purchaseOrderService = new PurchaseOrderService(apiKey, baseUrl, sqlConfig);

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
let pool;

async function initializeDatabase() {
  try {
    console.log("Connecting to database...");
    pool = await sql.connect(sqlConfig);
    console.log("Database connected successfully");
    
    // Initialize purchase orders database if needed
    if (purchaseOrderService && typeof purchaseOrderService.initializePurchaseOrdersDatabase === 'function') {
      await purchaseOrderService.initializePurchaseOrdersDatabase();
      console.log("Purchase orders database initialized");
    }
    
    return true;
  } catch (error) {
    console.error("Database connection failed:", error);
    return false;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Purchase Orders API endpoints
app.get('/api/sync/purchaseorders', async (req, res) => {
  try {
    console.log('Starting purchase orders sync...');
    const result = await purchaseOrderService.syncPurchaseOrders();
    res.json(result);
  } catch (error) {
    console.error('Error syncing purchase orders:', error);
    res.status(500).json({ 
      error: 'Failed to sync purchase orders', 
      message: error.message 
    });
  }
});

app.get('/api/purchaseorders', async (req, res) => {
  try {
    const result = await purchaseOrderService.getAllPurchaseOrders();
    res.json(result);
  } catch (error) {
    console.error('Error getting purchase orders:', error);
    res.status(500).json({ 
      error: 'Failed to get purchase orders', 
      message: error.message 
    });
  }
});

app.get('/api/purchaseorders/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = await purchaseOrderService.getPurchaseOrderById(id);
    
    if (result) {
      res.json(result);
    } else {
      res.status(404).json({ error: 'Purchase order not found' });
    }
  } catch (error) {
    console.error('Error getting purchase order:', error);
    res.status(500).json({ 
      error: 'Failed to get purchase order', 
      message: error.message 
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: error.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  if (pool) {
    await pool.close();
    console.log('Database connection closed');
  }
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    // Initialize database connection
    const dbInitialized = await initializeDatabase();
    
    if (!dbInitialized) {
      console.error('Failed to initialize database. Server will not start.');
      process.exit(1);
    }

    // Start Express server
    app.listen(port, '0.0.0.0', () => {
      console.log(`Picqer Middleware server running on port ${port}`);
      console.log(`Health check: http://localhost:${port}/health`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
startServer();

// Export for testing
module.exports = {
  app,
  purchaseOrderService
};

