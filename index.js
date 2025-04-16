// Picqer to Azure SQL Middleware with Dashboard
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const sql = require('mssql');
const path = require('path');
const nodemailer = require('nodemailer');

// Import dashboard components
const dashboard = require('./dashboard-api');

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the dashboard directory
app.use('/dashboard/static', express.static(path.join(__dirname, 'dashboard')));

// Mount dashboard routes
app.use('/dashboard', dashboard.router);

// SQL Configuration
const sqlConfig = {
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DATABASE,
    server: process.env.SQL_SERVER,
    options: {
        encrypt: true
    }
};

// Global variables
let syncInProgress = false;
let lastSyncTime = null;
let nextSyncTime = null;

// Schedule next sync
function scheduleNextSync() {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1);
    nextHour.setMinutes(0);
    nextHour.setSeconds(0);
    nextHour.setMilliseconds(0);
    
    const timeUntilNextSync = nextHour.getTime() - now.getTime();
    nextSyncTime = nextHour;
    
    console.log(`Next sync scheduled at: ${nextHour.toLocaleTimeString()}`);
    dashboard.addLog('info', `Next sync scheduled at: ${nextHour.toLocaleTimeString()}`);
    
    setTimeout(() => {
        syncProducts();
        scheduleNextSync();
    }, timeUntilNextSync);
}

// Initialize database
async function initializeDatabase() {
    try {
        const pool = await sql.connect(sqlConfig);
        
        // Check if Products table exists, create if not
        const result = await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Products')
            BEGIN
                CREATE TABLE Products (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    idproduct INT NOT NULL,
                    name NVARCHAR(255) NOT NULL,
                    productcode NVARCHAR(100) NOT NULL,
                    price DECIMAL(18,2),
                    stock INT,
                    created DATETIME,
                    updated DATETIME,
                    last_sync_date DATETIME NOT NULL
                )
            END
        `);
        
        console.log('✅ Database initialized');
        dashboard.addLog('success', 'Database initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Error initializing database:', error.message);
        dashboard.addLog('error', `Error initializing database: ${error.message}`);
        return false;
    }
}

// Get products from Picqer
async function getProductsFromPicqer(from = null) {
    try {
        const fromParam = from ? `?updated_since=${from}` : '';
        console.log(`Fetching products from Picqer${from ? ` updated since ${from}` : ''}`);
        dashboard.addLog('info', `Fetching products from Picqer${from ? ` updated since ${from}` : ''}`);
        
        const response = await axios.get(`${process.env.PICQER_BASE_URL}/products${fromParam}`, {
            auth: {
                username: process.env.PICQER_API_KEY,
                password: ''
            },
            headers: {
                'User-Agent': 'Skapa-Picqer-Middleware (info@skapa.nl)'
            }
        });
        
        console.log(`✅ Retrieved ${response.data.data.length} products from Picqer`);
        dashboard.addLog('success', `Retrieved ${response.data.data.length} products from Picqer`);
        return response.data.data;
    } catch (error) {
        console.error('❌ Error fetching from Picqer:', error.message);
        dashboard.addLog('error', `Error fetching from Picqer: ${error.message}`);
        throw error;
    }
}

// Save products to database
async function saveProductsToDatabase(products) {
    if (!products || products.length === 0) {
        console.log('No products to save');
        dashboard.addLog('info', 'No products to save');
        return 0;
    }
    
    try {
        const pool = await sql.connect(sqlConfig);
        let savedCount = 0;
        
        for (const product of products) {
            // Check if product exists
            const checkResult = await pool.request()
                .input('idproduct', sql.Int, product.idproduct)
                .query('SELECT id FROM Products WHERE idproduct = @idproduct');
            
            const now = new Date().toISOString();
            
            if (checkResult.recordset.length > 0) {
                // Update existing product
                await pool.request()
                    .input('idproduct', sql.Int, product.idproduct)
                    .input('name', sql.NVarChar, product.name)
                    .input('productcode', sql.NVarChar, product.productcode)
                    .input('price', sql.Decimal, product.price)
                    .input('stock', sql.Int, product.stock || 0)
                    .input('created', sql.DateTime, new Date(product.created))
                    .input('updated', sql.DateTime, product.updated ? new Date(product.updated) : null)
                    .input('last_sync_date', sql.DateTime, new Date())
                    .query(`
                        UPDATE Products 
                        SET name = @name, 
                            productcode = @productcode, 
                            price = @price, 
                            stock = @stock, 
                            created = @created, 
                            updated = @updated, 
                            last_sync_date = @last_sync_date 
                        WHERE idproduct = @idproduct
                    `);
            } else {
                // Insert new product
                await pool.request()
                    .input('idproduct', sql.Int, product.idproduct)
                    .input('name', sql.NVarChar, product.name)
                    .input('productcode', sql.NVarChar, product.productcode)
                    .input('price', sql.Decimal, product.price)
                    .input('stock', sql.Int, product.stock || 0)
                    .input('created', sql.DateTime, new Date(product.created))
                    .input('updated', sql.DateTime, product.updated ? new Date(product.updated) : null)
                    .input('last_sync_date', sql.DateTime, new Date())
                    .query(`
                        INSERT INTO Products (idproduct, name, productcode, price, stock, created, updated, last_sync_date)
                        VALUES (@idproduct, @name, @productcode, @price, @stock, @created, @updated, @last_sync_date)
                    `);
            }
            
            savedCount++;
        }
        
        console.log(`✅ Saved ${savedCount} products to database`);
        dashboard.addLog('success', `Saved ${savedCount} products to database`);
        return savedCount;
    } catch (error) {
        console.error('❌ Error saving to database:', error.message);
        dashboard.addLog('error', `Error saving to database: ${error.message}`);
        throw error;
    }
}

// Get total product count from database
async function getTotalProductCount() {
    try {
        const pool = await sql.connect(sqlConfig);
        const result = await pool.request().query('SELECT COUNT(*) as count FROM Products');
        return result.recordset[0].count;
    } catch (error) {
        console.error('Error getting product count:', error.message);
        dashboard.addLog('error', `Error getting product count: ${error.message}`);
        return 0;
    }
}

// Sync products from Picqer to database
async function syncProducts(full = false) {
    if (syncInProgress) {
        console.log('Sync already in progress, skipping');
        dashboard.addLog('warning', 'Sync already in progress, skipping');
        return { success: false, message: 'Sync already in progress' };
    }
    
    syncInProgress = true;
    
    try {
        // Initialize database if needed
        await initializeDatabase();
        
        // Get products from Picqer
        let from = null;
        if (!full) {
            // If not a full sync, get products updated since last sync or Jan 1, 2025
            from = lastSyncTime ? new Date(lastSyncTime).toISOString().split('T')[0] : '2025-01-01';
        }
        
        const products = await getProductsFromPicqer(from);
        
        // Save products to database
        const savedCount = await saveProductsToDatabase(products);
        
        // Update last sync time
        lastSyncTime = new Date().toISOString();
        
        console.log(`✅ Sync completed: ${savedCount} products synchronized`);
        dashboard.addLog('success', `Sync completed: ${savedCount} products synchronized`);
        
        // Add sync record to history
        dashboard.addSyncRecord(true, savedCount);
        
        syncInProgress = false;
        return { 
            success: true, 
            message: `Sync completed: ${savedCount} products synchronized`,
            count: savedCount
        };
    } catch (error) {
        console.error('❌ Sync failed:', error.message);
        dashboard.addLog('error', `Sync failed: ${error.message}`);
        
        // Add sync record to history
        dashboard.addSyncRecord(false, null, error.message);
        
        syncInProgress = false;
        return { 
            success: false, 
            message: `Sync failed: ${error.message}`
        };
    }
}

// API Routes

// Test connection to Picqer
app.get('/test', async (req, res) => {
    try {
        const response = await axios.get(`${process.env.PICQER_BASE_URL}/products?limit=1`, {
            auth: {
                username: process.env.PICQER_API_KEY,
                password: ''
            },
            headers: {
                'User-Agent': 'Skapa-Picqer-Middleware (info@skapa.nl)'
            }
        });
        
        res.json({
            success: true,
            message: 'Connection to Picqer API successful',
            data: response.data
        });
    } catch (error) {
        console.error('❌ Test connection failed:', error.message);
        dashboard.addLog('error', `Test connection failed: ${error.message}`);
        
        res.status(500).json({
            success: false,
            message: `Connection to Picqer API failed: ${error.message}`
        });
    }
});

// Get products from Picqer
app.get('/products', async (req, res) => {
    try {
        const from = req.query.from || null;
        const products = await getProductsFromPicqer(from);
        
        res.json({
            success: true,
            count: products.length,
            data: products
        });
    } catch (error) {
        console.error('❌ Error fetching products:', error.message);
        dashboard.addLog('error', `Error fetching products: ${error.message}`);
        
        res.status(500).json({
            success: false,
            message: `Error fetching products: ${error.message}`
        });
    }
});

// Sync products from Picqer to database
app.get('/sync', async (req, res) => {
    const full = req.query.full === 'true';
    const from = req.query.from || null;
    
    try {
        const result = await syncProducts(full);
        res.json(result);
    } catch (error) {
        console.error('❌ Sync failed:', error.message);
        dashboard.addLog('error', `Sync failed: ${error.message}`);
        
        res.status(500).json({
            success: false,
            message: `Sync failed: ${error.message}`
        });
    }
});

// Override dashboard stats endpoint to provide real data
app.get('/dashboard/stats', async (req, res) => {
    try {
        const totalProducts = await getTotalProductCount();
        
        res.json({
            totalProducts,
            lastSync: lastSyncTime,
            nextSync: nextSyncTime ? nextSyncTime.toISOString() : null,
            syncStatus: syncInProgress ? 'Running' : 'Ready'
        });
    } catch (error) {
        console.error('Error getting stats:', error.message);
        res.status(500).json({
            error: 'Failed to get stats',
            message: error.message
        });
    }
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => {
    console.log(`✅ Server running on port ${PORT}`);
    dashboard.addLog('info', `Server started on port ${PORT}`);
    
    // Initialize database
    await initializeDatabase();
    
    // Schedule first sync
    scheduleNextSync();
});
