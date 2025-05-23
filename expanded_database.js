const sql = require('mssql');
const axios = require('axios');
const { addLog } = require('./dashboard/dashboard-api');

// Database configuration
const config = {
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: false
    }
};

// Initialize database
async function initializeDatabase() {
    try {
        const pool = await sql.connect(config);
        
        // Create Products table with expanded schema if it doesn't exist
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Products')
            BEGIN
                CREATE TABLE Products (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    idproduct INT NOT NULL,
                    idvatgroup INT NULL,
                    name NVARCHAR(255) NOT NULL,
                    price DECIMAL(18,2) NULL,
                    fixedstockprice DECIMAL(18,2) NULL,
                    idsupplier INT NULL,
                    productcode NVARCHAR(100) NOT NULL,
                    productcode_supplier NVARCHAR(100) NULL,
                    deliverytime INT NULL,
                    description NVARCHAR(MAX) NULL,
                    barcode NVARCHAR(100) NULL,
                    type NVARCHAR(50) NULL,
                    unlimitedstock BIT NULL,
                    weight INT NULL,
                    length INT NULL,
                    width INT NULL,
                    height INT NULL,
                    minimum_purchase_quantity INT NULL,
                    purchase_in_quantities_of INT NULL,
                    hs_code NVARCHAR(50) NULL,
                    country_of_origin NVARCHAR(2) NULL,
                    active BIT NULL,
                    idfulfilment_customer INT NULL,
                    analysis_pick_amount_per_day FLOAT NULL,
                    analysis_abc_classification NVARCHAR(1) NULL,
                    tags NVARCHAR(MAX) NULL,
                    productfields NVARCHAR(MAX) NULL,
                    images NVARCHAR(MAX) NULL,
                    pricelists NVARCHAR(MAX) NULL,
                    stock INT NULL,
                    created DATETIME NULL,
                    updated DATETIME NULL,
                    last_sync_date DATETIME NOT NULL
                );
                
                -- Create indexes for better performance
                CREATE INDEX IX_Products_idproduct ON Products(idproduct);
                CREATE INDEX IX_Products_productcode ON Products(productcode);
                CREATE INDEX IX_Products_updated ON Products(updated);
                CREATE INDEX IX_Products_barcode ON Products(barcode);
            END
        `);
        
        // Create SyncStatus table if it doesn't exist
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SyncStatus')
            BEGIN
                CREATE TABLE SyncStatus (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    entity_name NVARCHAR(50) NOT NULL,
                    last_sync_date DATETIME NOT NULL,
                    total_available INT NULL,
                    total_synced INT NULL,
                    CONSTRAINT UC_SyncStatus_entity_name UNIQUE (entity_name)
                );
                
                -- Insert initial record for products
                INSERT INTO SyncStatus (entity_name, last_sync_date, total_available, total_synced)
                VALUES ('products', '2025-01-01T00:00:00.000Z', 0, 0);
            END
        `);
        
        console.log('✅ Database initialized successfully');
        addLog('success', 'Database initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Error initializing database:', error.message);
        addLog('error', `Error initializing database: ${error.message}`);
        throw error;
    }
}

// Get last sync date for entity
async function getLastSyncDate(entityName) {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('entity_name', sql.NVarChar, entityName)
            .query('SELECT last_sync_date FROM SyncStatus WHERE entity_name = @entity_name');
        
        if (result.recordset.length > 0) {
            return result.recordset[0].last_sync_date;
        }
        return null;
    } catch (error) {
        console.error(`❌ Error getting last sync date for ${entityName}:`, error.message);
        addLog('error', `Error getting last sync date for ${entityName}: ${error.message}`);
        throw error;
    }
}

// Update last sync date for entity
async function updateSyncStatus(entityName, lastSyncDate, totalAvailable = null, totalSynced = null) {
    try {
        const pool = await sql.connect(config);
        
        // Get current values if not provided
        if (totalAvailable === null || totalSynced === null) {
            const result = await pool.request()
                .input('entity_name', sql.NVarChar, entityName)
                .query('SELECT total_available, total_synced FROM SyncStatus WHERE entity_name = @entity_name');
            
            if (result.recordset.length > 0) {
                totalAvailable = totalAvailable !== null ? totalAvailable : result.recordset[0].total_available;
                totalSynced = totalSynced !== null ? totalSynced : result.recordset[0].total_synced;
            }
        }
        
        await pool.request()
            .input('entity_name', sql.NVarChar, entityName)
            .input('last_sync_date', sql.DateTime, new Date(lastSyncDate))
            .input('total_available', sql.Int, totalAvailable)
            .input('total_synced', sql.Int, totalSynced)
            .query(`
                UPDATE SyncStatus 
                SET last_sync_date = @last_sync_date,
                    total_available = @total_available,
                    total_synced = @total_synced
                WHERE entity_name = @entity_name
            `);
        
        console.log(`✅ Updated sync status for ${entityName}`);
        addLog('info', `Updated sync status for ${entityName}`);
        return true;
    } catch (error) {
        console.error(`❌ Error updating sync status for ${entityName}:`, error.message);
        addLog('error', `Error updating sync status for ${entityName}: ${error.message}`);
        throw error;
    }
}

// Get sync statistics
async function getSyncStatistics() {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request()
            .query(`
                SELECT 
                    entity_name,
                    last_sync_date,
                    total_available,
                    total_synced,
                    CASE 
                        WHEN total_available > 0 THEN (total_synced * 100.0 / total_available)
                        ELSE 0
                    END AS sync_percentage
                FROM SyncStatus
            `);
        
        return result.recordset;
    } catch (error) {
        console.error('❌ Error getting sync statistics:', error.message);
        addLog('error', `Error getting sync statistics: ${error.message}`);
        throw error;
    }
}

// Save products to database
async function saveProductsToDatabase(products) {
    try {
        if (!products || products.length === 0) {
            console.log('No products to save');
            addLog('info', 'No products to save');
            return 0;
        }
        
        const pool = await sql.connect(config);
        let savedCount = 0;
        
        // Process products in batches to avoid overwhelming the database
        const batchSize = 50;
        const totalProducts = products.length;
        
        for (let i = 0; i < totalProducts; i += batchSize) {
            const batch = products.slice(i, i + batchSize);
            const transaction = new sql.Transaction(pool);
            
            try {
                await transaction.begin();
                
                for (const product of batch) {
                    // Check if product exists
                    const checkResult = await new sql.Request(transaction)
                        .input('idproduct', sql.Int, product.idproduct)
                        .query('SELECT id FROM Products WHERE idproduct = @idproduct');
                    
                    // Ensure all values are properly formatted
                    const idproductValue = product.idproduct ? parseInt(product.idproduct, 10) || null : null;
                    const idvatgroupValue = product.idvatgroup ? parseInt(product.idvatgroup, 10) || null : null;
                    const priceValue = product.price ? parseFloat(product.price) || 0 : 0;
                    const fixedstockpriceValue = product.fixedstockprice ? parseFloat(product.fixedstockprice) || 0 : null;
                    const idsupplierValue = product.idsupplier ? parseInt(product.idsupplier, 10) || null : null;
                    const deliverytimeValue = product.deliverytime ? parseInt(product.deliverytime, 10) || null : null;
                    const stockValue = product.stock ? parseInt(product.stock, 10) || 0 : 0;
                    const weightValue = product.weight ? parseInt(product.weight, 10) || null : null;
                    const lengthValue = product.length ? parseInt(product.length, 10) || null : null;
                    const widthValue = product.width ? parseInt(product.width, 10) || null : null;
                    const heightValue = product.height ? parseInt(product.height, 10) || null : null;
                    const minPurchaseValue = product.minimum_purchase_quantity ? parseInt(product.minimum_purchase_quantity, 10) || null : null;
                    const purchaseQuantitiesValue = product.purchase_in_quantities_of ? parseInt(product.purchase_in_quantities_of, 10) || null : null;
                    const idfulfilmentValue = product.idfulfilment_customer ? parseInt(product.idfulfilment_customer, 10) || null : null;
                    const pickAmountValue = product.analysis_pick_amount_per_day ? parseFloat(product.analysis_pick_amount_per_day) || null : null;
                    
                    // Convert complex objects to JSON strings
                    const tagsValue = product.tags ? JSON.stringify(product.tags) : null;
                    const productfieldsValue = product.productfields ? JSON.stringify(product.productfields) : null;
                    const imagesValue = product.images ? JSON.stringify(product.images) : null;
                    const pricelistsValue = product.pricelists ? JSON.stringify(product.pricelists) : null;
                    
                    if (checkResult.recordset.length > 0) {
                        // Update existing product
                        await new sql.Request(transaction)
                            .input('id', sql.Int, checkResult.recordset[0].id)
                            .input('idproduct', sql.Int, idproductValue)
                            .input('idvatgroup', sql.Int, idvatgroupValue)
                            .input('name', sql.NVarChar, product.name || '')
                            .input('price', sql.Decimal(18, 2), priceValue)
                            .input('fixedstockprice', sql.Decimal(18, 2), fixedstockpriceValue)
                            .input('idsupplier', sql.Int, idsupplierValue)
                            .input('productcode', sql.NVarChar, product.productcode || '')
                            .input('productcode_supplier', sql.NVarChar, product.productcode_supplier || null)
                            .input('deliverytime', sql.Int, deliverytimeValue)
                            .input('description', sql.NVarChar(sql.MAX), product.description || null)
                            .input('barcode', sql.NVarChar, product.barcode || null)
                            .input('type', sql.NVarChar, product.type || null)
                            .input('unlimitedstock', sql.Bit, product.unlimitedstock === true ? 1 : 0)
                            .input('weight', sql.Int, weightValue)
                            .input('length', sql.Int, lengthValue)
                            .input('width', sql.Int, widthValue)
                            .input('height', sql.Int, heightValue)
                            .input('minimum_purchase_quantity', sql.Int, minPurchaseValue)
                            .input('purchase_in_quantities_of', sql.Int, purchaseQuantitiesValue)
                            .input('hs_code', sql.NVarChar, product.hs_code || null)
                            .input('country_of_origin', sql.NVarChar, product.country_of_origin || null)
                            .input('active', sql.Bit, product.active === true ? 1 : 0)
                            .input('idfulfilment_customer', sql.Int, idfulfilmentValue)
                            .input('analysis_pick_amount_per_day', sql.Float, pickAmountValue)
                            .input('analysis_abc_classification', sql.NVarChar(1), product.analysis_abc_classification || null)
                            .input('tags', sql.NVarChar(sql.MAX), tagsValue)
                            .input('productfields', sql.NVarChar(sql.MAX), productfieldsValue)
                            .input('images', sql.NVarChar(sql.MAX), imagesValue)
                            .input('pricelists', sql.NVarChar(sql.MAX), pricelistsValue)
                            .input('stock', sql.Int, stockValue)
                            .input('created', sql.DateTime, product.created ? new Date(product.created) : null)
                            .input('updated', sql.DateTime, product.updated ? new Date(product.updated) : null)
                            .input('last_sync_date', sql.DateTime, new Date())
                            .query(`
                                UPDATE Products SET
                                    idproduct = @idproduct,
                                    idvatgroup = @idvatgroup,
                                    name = @name,
                                    price = @price,
                                    fixedstockprice = @fixedstockprice,
                                    idsupplier = @idsupplier,
                                    productcode = @productcode,
                                    productcode_supplier = @productcode_supplier,
                                    deliverytime = @deliverytime,
                                    description = @description,
                                    barcode = @barcode,
                                    type = @type,
                                    unlimitedstock = @unlimitedstock,
                                    weight = @weight,
                                    length = @length,
                                    width = @width,
                                    height = @height,
                                    minimum_purchase_quantity = @minimum_purchase_quantity,
                                    purchase_in_quantities_of = @purchase_in_quantities_of,
                                    hs_code = @hs_code,
                                    country_of_origin = @country_of_origin,
                                    active = @active,
                                    idfulfilment_customer = @idfulfilment_customer,
                                    analysis_pick_amount_per_day = @analysis_pick_amount_per_day,
                                    analysis_abc_classification = @analysis_abc_classification,
                                    tags = @tags,
                                    productfields = @productfields,
                                    images = @images,
                                    pricelists = @pricelists,
                                    stock = @stock,
                                    created = @created,
                                    updated = @updated,
                                    last_sync_date = @last_sync_date
                                WHERE id = @id
                            `);
                    } else {
                        // Insert new product
                        await new sql.Request(transaction)
                            .input('idproduct', sql.Int, idproductValue)
                            .input('idvatgroup', sql.Int, idvatgroupValue)
                            .input('name', sql.NVarChar, product.name || '')
                            .input('price', sql.Decimal(18, 2), priceValue)
                            .input('fixedstockprice', sql.Decimal(18, 2), fixedstockpriceValue)
                            .input('idsupplier', sql.Int, idsupplierValue)
                            .input('productcode', sql.NVarChar, product.productcode || '')
                            .input('productcode_supplier', sql.NVarChar, product.productcode_supplier || null)
                            .input('deliverytime', sql.Int, deliverytimeValue)
                            .input('description', sql.NVarChar(sql.MAX), product.description || null)
                            .input('barcode', sql.NVarChar, product.barcode || null)
                            .input('type', sql.NVarChar, product.type || null)
                            .input('unlimitedstock', sql.Bit, product.unlimitedstock === true ? 1 : 0)
                            .input('weight', sql.Int, weightValue)
                            .input('length', sql.Int, lengthValue)
                            .input('width', sql.Int, widthValue)
                            .input('height', sql.Int, heightValue)
                            .input('minimum_purchase_quantity', sql.Int, minPurchaseValue)
                            .input('purchase_in_quantities_of', sql.Int, purchaseQuantitiesValue)
                            .input('hs_code', sql.NVarChar, product.hs_code || null)
                            .input('country_of_origin', sql.NVarChar, product.country_of_origin || null)
                            .input('active', sql.Bit, product.active === true ? 1 : 0)
                            .input('idfulfilment_customer', sql.Int, idfulfilmentValue)
                            .input('analysis_pick_amount_per_day', sql.Float, pickAmountValue)
                            .input('analysis_abc_classification', sql.NVarChar(1), product.analysis_abc_classification || null)
                            .input('tags', sql.NVarChar(sql.MAX), tagsValue)
                            .input('productfields', sql.NVarChar(sql.MAX), productfieldsValue)
                            .input('images', sql.NVarChar(sql.MAX), imagesValue)
                            .input('pricelists', sql.NVarChar(sql.MAX), pricelistsValue)
                            .input('stock', sql.Int, stockValue)
                            .input('created', sql.DateTime, product.created ? new Date(product.created) : null)
                            .input('updated', sql.DateTime, product.updated ? new Date(product.updated) : null)
                            .input('last_sync_date', sql.DateTime, new Date())
                            .query(`
                                INSERT INTO Products (
                                    idproduct, idvatgroup, name, price, fixedstockprice, idsupplier, 
                                    productcode, productcode_supplier, deliverytime, description, barcode, 
                                    type, unlimitedstock, weight, length, width, height, 
                                    minimum_purchase_quantity, purchase_in_quantities_of, hs_code, country_of_origin, 
                                    active, idfulfilment_customer, analysis_pick_amount_per_day, analysis_abc_classification, 
                                    tags, productfields, images, pricelists, stock, created, updated, last_sync_date
                                ) VALUES (
                                    @idproduct, @idvatgroup, @name, @price, @fixedstockprice, @idsupplier, 
                                    @productcode, @productcode_supplier, @deliverytime, @description, @barcode, 
                                    @type, @unlimitedstock, @weight, @length, @width, @height, 
                                    @minimum_purchase_quantity, @purchase_in_quantities_of, @hs_code, @country_of_origin, 
                                    @active, @idfulfilment_customer, @analysis_pick_amount_per_day, @analysis_abc_classification, 
                                    @tags, @productfields, @images, @pricelists, @stock, @created, @updated, @last_sync_date
                                )
                            `);
                    }
                    
                    savedCount++;
                }
                
                await transaction.commit();
                
                // Log progress for large batches
                if (totalProducts > 100) {
                    console.log(`Saved ${Math.min(i + batchSize, totalProducts)} of ${totalProducts} products`);
                    addLog('info', `Saved ${Math.min(i + batchSize, totalProducts)} of ${totalProducts} products`);
                }
            } catch (error) {
                await transaction.rollback();
                console.error('❌ Error in batch transaction:', error.message);
                addLog('error', `Error in batch transaction: ${error.message}`);
                throw error;
            }
        }
        
        console.log(`✅ Saved ${savedCount} products to database`);
        addLog('success', `Saved ${savedCount} products to database`);
        return savedCount;
    } catch (error) {
        console.error('❌ Error saving to database:', error.message);
        addLog('error', `Error saving to database: ${error.message}`);
        throw error;
    }
}

// Get products from database
async function getProductsFromDatabase() {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request().query('SELECT * FROM Products');
        return result.recordset;
    } catch (error) {
        console.error('❌ Error querying the database:', error.message);
        addLog('error', `Error querying the database: ${error.message}`);
        throw error;
    }
}

// Get product count from database
async function getProductCountFromDatabase() {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request().query('SELECT COUNT(*) as count FROM Products');
        return result.recordset[0].count;
    } catch (error) {
        console.error('❌ Error getting product count:', error.message);
        addLog('error', `Error getting product count: ${error.message}`);
        throw error;
    }
}

module.exports = {
    initializeDatabase,
    getLastSyncDate,
    updateSyncStatus,
    getSyncStatistics,
    saveProductsToDatabase,
    getProductsFromDatabase,
    getProductCountFromDatabase
};
