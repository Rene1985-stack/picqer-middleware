// Picqer to Azure SQL Middleware with Dashboard
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const sql = require('mssql');
const path = require('path');
const nodemailer = require('nodemailer');

// Import dashboard components with correct path
const dashboard = require('./dashboard/dashboard-api');

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
let totalProductsAvailable = 0;

// Constants
const DEFAULT_SYNC_START_DATE = '2025-01-01'; // Default start date for all sync types

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
        
        // Check if SyncStatus table exists, create if not
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SyncStatus')
            BEGIN
                CREATE TABLE SyncStatus (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    entity_type NVARCHAR(50) NOT NULL,
                    last_sync_date DATETIME NOT NULL,
                    total_available INT,
                    total_synced INT,
                    CONSTRAINT UC_SyncStatus_entity_type UNIQUE (entity_type)
                );
                
                -- Insert initial records for all entity types
                INSERT INTO SyncStatus (entity_type, last_sync_date, total_available, total_synced)
                VALUES 
                    ('products', '${DEFAULT_SYNC_START_DATE}', 0, 0),
                    ('orders', '${DEFAULT_SYNC_START_DATE}', 0, 0),
                    ('picklists', '${DEFAULT_SYNC_START_DATE}', 0, 0)
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

// Get total product count from Picqer
async function getTotalProductCount() {
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
        
        // Check if response has pagination information
        if (response.data && response.data.pagination && response.data.pagination.total) {
            totalProductsAvailable = response.data.pagination.total;
            
            // Update SyncStatus table with total available
            updateSyncStatus('products', null, totalProductsAvailable);
            
            return totalProductsAvailable;
        } else {
            // If no pagination info, we'll need to count manually
            const allProducts = await getAllProductsFromPicqer();
            totalProductsAvailable = allProducts.length;
            
            // Update SyncStatus table with total available
            updateSyncStatus('products', null, totalProductsAvailable);
            
            return totalProductsAvailable;
        }
    } catch (error) {
        console.error('❌ Error getting total product count:', error.message);
        dashboard.addLog('error', `Error getting total product count: ${error.message}`);
        return 0;
    }
}

// Update sync status in database
async function updateSyncStatus(entityType, lastSyncDate = null, totalAvailable = null, totalSynced = null) {
    try {
        const pool = await sql.connect(sqlConfig);
        
        // Check if record exists
        const checkResult = await pool.request()
            .input('entityType', sql.NVarChar, entityType)
            .query('SELECT id FROM SyncStatus WHERE entity_type = @entityType');
        
        // Build update query parts
        let updateParts = [];
        let queryParams = {
            entityType: { type: sql.NVarChar, value: entityType }
        };
        
        if (lastSyncDate !== null) {
            updateParts.push('last_sync_date = @lastSyncDate');
            queryParams.lastSyncDate = { type: sql.DateTime, value: new Date(lastSyncDate) };
        }
        
        if (totalAvailable !== null) {
            updateParts.push('total_available = @totalAvailable');
            queryParams.totalAvailable = { type: sql.Int, value: totalAvailable };
        }
        
        if (totalSynced !== null) {
            updateParts.push('total_synced = @totalSynced');
            queryParams.totalSynced = { type: sql.Int, value: totalSynced };
        }
        
        // Only proceed if we have something to update
        if (updateParts.length > 0) {
            if (checkResult.recordset.length > 0) {
                // Update existing record
                const request = pool.request();
                
                // Add parameters
                for (const [key, param] of Object.entries(queryParams)) {
                    request.input(key, param.type, param.value);
                }
                
                await request.query(`
                    UPDATE SyncStatus 
                    SET ${updateParts.join(', ')}
                    WHERE entity_type = @entityType
                `);
            } else {
                // Insert new record
                const request = pool.request();
                
                // Add parameters
                for (const [key, param] of Object.entries(queryParams)) {
                    request.input(key, param.type, param.value);
                }
                
                // Default values for required fields
                if (!queryParams.lastSyncDate) {
                    request.input('lastSyncDate', sql.DateTime, new Date(DEFAULT_SYNC_START_DATE));
                }
                
                if (!queryParams.totalAvailable) {
                    request.input('totalAvailable', sql.Int, 0);
                }
                
                if (!queryParams.totalSynced) {
                    request.input('totalSynced', sql.Int, 0);
                }
                
                await request.query(`
                    INSERT INTO SyncStatus (entity_type, last_sync_date, total_available, total_synced)
                    VALUES (@entityType, @lastSyncDate, @totalAvailable, @totalSynced)
                `);
            }
        }
        
        return true;
    } catch (error) {
        console.error('❌ Error updating sync status:', error.message);
        dashboard.addLog('error', `Error updating sync status: ${error.message}`);
        return false;
    }
}

// Get sync status from database
async function getSyncStatus(entityType) {
    try {
        const pool = await sql.connect(sqlConfig);
        
        const result = await pool.request()
            .input('entityType', sql.NVarChar, entityType)
            .query('SELECT * FROM SyncStatus WHERE entity_type = @entityType');
        
        if (result.recordset.length > 0) {
            return result.recordset[0];
        } else {
            // Return default values if no record found
            return {
                entity_type: entityType,
                last_sync_date: new Date(DEFAULT_SYNC_START_DATE),
                total_available: 0,
                total_synced: 0
            };
        }
    } catch (error) {
        console.error('❌ Error getting sync status:', error.message);
        dashboard.addLog('error', `Error getting sync status: ${error.message}`);
        
        // Return default values on error
        return {
            entity_type: entityType,
            last_sync_date: new Date(DEFAULT_SYNC_START_DATE),
            total_available: 0,
            total_synced: 0
        };
    }
}

// Get all products from Picqer with pagination
async function getAllProductsFromPicqer(from = null) {
    try {
        const baseUrl = `${process.env.PICQER_BASE_URL}/products`;
        const fromParam = from ? `updated_since=${from}` : '';
        
        console.log(`Fetching all products from Picqer${from ? ` updated since ${from}` : ''}`);
        dashboard.addLog('info', `Fetching all products from Picqer${from ? ` updated since ${from}` : ''}`);
        
        let allProducts = [];
        let page = 1;
        let hasMorePages = true;
        const pageSize = 100; // Picqer default page size
        
        while (hasMorePages) {
            // Build URL with pagination and optional from parameter
            let url = `${baseUrl}?page=${page}&limit=${pageSize}`;
            if (fromParam) {
                url += `&${fromParam}`;
            }
            
            console.log(`Fetching page ${page} from Picqer API...`);
            dashboard.addLog('info', `Fetching page ${page} from Picqer API...`);
            
            const response = await axios.get(url, {
                auth: {
                    username: process.env.PICQER_API_KEY,
                    password: ''
                },
                headers: {
                    'User-Agent': 'Skapa-Picqer-Middleware (info@skapa.nl)'
                }
            });
            
            // Check the structure of the response
            let pageProducts = [];
            if (response.data && response.data.data && Array.isArray(response.data.data)) {
                // Response has nested data property
                pageProducts = response.data.data;
                
                // Check if we have pagination info
                if (response.data.pagination) {
                    hasMorePages = page < response.data.pagination.pages;
                    totalProductsAvailable = response.data.pagination.total;
                } else {
                    // If no pagination info, check if we got a full page
                    hasMorePages = pageProducts.length === pageSize;
                }
            } else if (response.data && Array.isArray(response.data)) {
                // Response data is directly an array
                pageProducts = response.data;
                
                // If no pagination info, check if we got a full page
                hasMorePages = pageProducts.length === pageSize;
            } else {
                console.log('Unexpected response format:', JSON.stringify(response.data).substring(0, 200) + '...');
                dashboard.addLog('warning', 'Unexpected response format from Picqer API');
                hasMorePages = false;
            }
            
            // Add products from this page to our collection
            if (pageProducts.length > 0) {
                allProducts = [...allProducts, ...pageProducts];
                console.log(`✅ Retrieved ${pageProducts.length} products from page ${page}`);
                dashboard.addLog('info', `Retrieved ${pageProducts.length} products from page ${page}`);
            } else {
                // No products on this page, stop pagination
                hasMorePages = false;
            }
            
            // Move to next page
            page++;
            
            // Add a small delay to respect rate limits
            if (hasMorePages) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        console.log(`✅ Total: Retrieved ${allProducts.length} products from Picqer`);
        dashboard.addLog('success', `Total: Retrieved ${allProducts.length} products from Picqer`);
        
        // Update total available count if we don't have it from pagination
        if (totalProductsAvailable === 0) {
            totalProductsAvailable = allProducts.length;
        }
        
        // Update SyncStatus table with total available
        updateSyncStatus('products', null, totalProductsAvailable);
        
        return allProducts;
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
            
            // Ensure stock is a valid number
            const stockValue = product.stock ? parseInt(product.stock, 10) || 0 : 0;
            
            // Ensure price is a valid decimal
            const priceValue = product.price ? parseFloat(product.price) || 0 : 0;
            
            if (checkResult.recordset.length > 0) {
                // Update existing product
                await pool.request()
                    .input('idproduct', sql.Int, product.idproduct)
                    .input('name', sql.NVarChar, product.name || '')
                    .input('productcode', sql.NVarChar, product.productcode || '')
                    .input('price', sql.Decimal(18, 2), priceValue)
                    .input('stock', sql.Int, stockValue)
                    .input('created', sql.DateTime, product.created ? new Date(product.created) : new Date())
                    .input('updated', sql.DateTime, product.updated ? new Date(product.updated) : new Date())
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
                    .input('name', sql.NVarChar, product.name || '')
                    .input('productcode', sql.NVarChar, product.productcode || '')
                    .input('price', sql.Decimal(18, 2), priceValue)
                    .input('stock', sql.Int, stockValue)
                    .input('created', sql.DateTime, product.created ? new Date(product.created) : new Date())
                    .input('updated', sql.DateTime, product.updated ? new Date(product.updated) : new Date())
                    .input('last_sync_date', sql.DateTime, new Date())
                    .query(`
                        INSERT INTO Products (idproduct, name, productcode, price, stock, created, updated, last_sync_date)
                        VALUES (@idproduct, @name, @productcode, @price, @stock, @created, @updated, @last_sync_date)
                    `);
            }
            
            savedCount++;
            
            // Log progress every 100 products
            if (savedCount % 100 === 0) {
                console.log(`Progress: Saved ${savedCount} of ${products.length} products to database`);
                dashboard.addLog('info', `Progress: Saved ${savedCount} of ${products.length} products to database`);
            }
        }
        
        console.log(`✅ Saved ${savedCount} products to database`);
        dashboard.addLog('success', `Saved ${savedCount} products to database`);
        
        // Update SyncStatus table with total synced
        const dbCount = await getDbProductCount();
        updateSyncStatus('products', new Date().toISOString(), null, dbCount);
        
        return savedCount;
    } catch (error) {
        console.error('❌ Error saving to database:', error.message);
        dashboard.addLog('error', `Error saving to database: ${error.message}`);
        throw error;
    }
}

// Get total product count from database
async function getDbProductCount() {
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
        
        // Get total product count from Picqer for statistics
        if (full || totalProductsAvailable === 0) {
            await getTotalProductCount();
        }
        
        // Get products from Picqer
        let from = null;
        if (!full) {
            // Get the last sync date from SyncStatus table
            const syncStatus = await getSyncStatus('products');
            from = syncStatus.last_sync_date.toISOString().split('T')[0];
        }
        
        // Use the new pagination-aware function
        const products = await getAllProductsFromPicqer(from);
        
        // Save products to database
        const savedCount = await saveProductsToDatabase(products);
        
        // Update last sync time
        lastSyncTime = new Date().toISOString();
        
        // Update SyncStatus table
        updateSyncStatus('products', lastSyncTime);
        
        console.log(`✅ Sync completed: ${savedCount} products synchronized`);
        dashboard.addLog('success', `Sync completed: ${savedCount} products synchronized`);
        
        // Get current database count for statistics
        const dbCount = await getDbProductCount();
        
        // Add sync record to history with total available count
        if (typeof dashboard.addSyncRecord === 'function' && 
            dashboard.addSyncRecord.length >= 4) {
            // New version with totalAvailable parameter
            dashboard.addSyncRecord(true, savedCount, null, totalProductsAvailable);
        } else if (typeof dashboard.updateSyncStats === 'function') {
            // If updateSyncStats is available
            dashboard.updateSyncStats(totalProductsAvailable, dbCount);
            dashboard.addSyncRecord(true, savedCount);
        } else {
            // Original version
            dashboard.addSyncRecord(true, savedCount);
        }
        
        syncInProgress = false;
        return { 
            success: true, 
            message: `Sync completed: ${savedCount} of ${totalProductsAvailable} products synchronized`,
            count: savedCount,
            totalAvailable: totalProductsAvailable
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
        const products = await getAllProductsFromPicqer(from);
        
        res.json({
            success: true,
            count: products.length,
            totalAvailable: totalProductsAvailable,
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
        const dbProductCount = await getDbProductCount();
        const syncStatus = await getSyncStatus('products');
        
        // Calculate sync percentage
        let syncPercentage = 0;
        if (totalProductsAvailable > 0) {
            syncPercentage = Math.round((dbProductCount / totalProductsAvailable) * 100);
        }
        
        res.json({
            totalProducts: dbProductCount,
            totalAvailable: totalProductsAvailable,
            syncPercentage: syncPercentage,
            lastSync: lastSyncTime || syncStatus.last_sync_date.toISOString(),
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

// Serve the enhanced dashboard
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard/enhanced-dashboard.html'));
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => {
    console.log(`✅ Server running on port ${PORT}`);
    dashboard.addLog('info', `Server started on port ${PORT}`);
    
    // Initialize database
    await initializeDatabase();
    
    // Get initial product count
    getTotalProductCount().then(count => {
        console.log(`Total products available in Picqer: ${count}`);
        dashboard.addLog('info', `Total products available in Picqer: ${count}`);
    });
    
    // Schedule first sync
    scheduleNextSync();
});
