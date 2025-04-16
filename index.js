require('dotenv').config();
const sql = require('mssql');
const axios = require('axios');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const sqlConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  options: {
    encrypt: true
  }
};

// Create Base64 encoded credentials for Picqer API
const credentials = `${process.env.PICQER_API_KEY}:`;
const encodedCredentials = Buffer.from(credentials).toString('base64');

async function fetchPicqerProducts(updatedSince = null) {
  try {
    const products = [];
    let page = 1;
    const pageSize = 100;
    
    console.log('Fetching products from Picqer API...');
    console.log('Base URL:', process.env.PICQER_BASE_URL);
    console.log('API Key (first 5 chars):', process.env.PICQER_API_KEY.substring(0, 5) + '...');

    while (true) {
      const params = { page, limit: pageSize };
      
      // Add updated_since parameter if provided
      if (updatedSince) {
        params.updated_since = updatedSince;
      }
      
      console.log(`Fetching page ${page}...`);
      
      const response = await axios.get(`${process.env.PICQER_BASE_URL}/products`, {
        params: params,
        auth: {
          username: process.env.PICQER_API_KEY,
          password: ''
        },
        headers: {
          'User-Agent': 'Skapa Middleware (info@skapa.nl)'
        }
      });

      if (!response.data || response.data.length === 0) break;

      products.push(...response.data);
      console.log(`Fetched ${response.data.length} products from page ${page}`);
      
      // Check if we have more pages
      if (response.data.length < pageSize) break;
      
      page++;
      await new Promise(r => setTimeout(r, 1000)); // respect rate limit
    }

    console.log(`🔄 Total ${products.length} products fetched`);
    return products;

  } catch (err) {
    console.error('❌ Error fetching from Picqer:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', JSON.stringify(err.response.data));
    }
    return [];
  }
}

async function saveProductsToSQL(products) {
  if (!process.env.SQL_SERVER || !process.env.SQL_DATABASE) {
    console.log('⚠️ SQL configuration not found, skipping database save');
    return;
  }
  
  try {
    const pool = await sql.connect(sqlConfig);

    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'products')
      CREATE TABLE products (
        idproduct INT PRIMARY KEY,
        name NVARCHAR(MAX),
        productcode NVARCHAR(255),
        price FLOAT,
        fixedstockprice FLOAT,
        deliverytime INT,
        idvatgroup INT,
        idsupplier INT,
        productcode_supplier NVARCHAR(255),
        description NVARCHAR(MAX),
        barcode NVARCHAR(255),
        updated DATETIME,
        created DATETIME,
        last_sync DATETIME DEFAULT GETDATE()
      )
    `);

    for (const product of products) {
      // Check if product already exists
      const checkResult = await pool.request()
        .input('idproduct', sql.Int, product.idproduct)
        .query('SELECT idproduct FROM products WHERE idproduct = @idproduct');
      
      if (checkResult.recordset.length > 0) {
        // Update existing product
        await pool.request()
          .input('idproduct', sql.Int, product.idproduct)
          .input('name', sql.NVarChar, product.name)
          .input('productcode', sql.NVarChar, product.productcode)
          .input('price', sql.Float, product.price || 0)
          .input('fixedstockprice', sql.Float, product.fixedstockprice || 0)
          .input('deliverytime', sql.Int, product.deliverytime || 0)
          .input('idvatgroup', sql.Int, product.idvatgroup)
          .input('idsupplier', sql.Int, product.idsupplier)
          .input('productcode_supplier', sql.NVarChar, product.productcode_supplier)
          .input('description', sql.NVarChar, product.description)
          .input('barcode', sql.NVarChar, product.barcode)
          .input('updated', sql.DateTime, new Date(product.updated))
          .input('created', sql.DateTime, new Date(product.created))
          .query(`
            UPDATE products SET
              name = @name,
              productcode = @productcode,
              price = @price,
              fixedstockprice = @fixedstockprice,
              deliverytime = @deliverytime,
              idvatgroup = @idvatgroup,
              idsupplier = @idsupplier,
              productcode_supplier = @productcode_supplier,
              description = @description,
              barcode = @barcode,
              updated = @updated,
              created = @created,
              last_sync = GETDATE()
            WHERE idproduct = @idproduct
          `);
      } else {
        // Insert new product
        await pool.request()
          .input('idproduct', sql.Int, product.idproduct)
          .input('name', sql.NVarChar, product.name)
          .input('productcode', sql.NVarChar, product.productcode)
          .input('price', sql.Float, product.price || 0)
          .input('fixedstockprice', sql.Float, product.fixedstockprice || 0)
          .input('deliverytime', sql.Int, product.deliverytime || 0)
          .input('idvatgroup', sql.Int, product.idvatgroup)
          .input('idsupplier', sql.Int, product.idsupplier)
          .input('productcode_supplier', sql.NVarChar, product.productcode_supplier)
          .input('description', sql.NVarChar, product.description)
          .input('barcode', sql.NVarChar, product.barcode)
          .input('updated', sql.DateTime, new Date(product.updated))
          .input('created', sql.DateTime, new Date(product.created))
          .query(`
            INSERT INTO products (
              idproduct, name, productcode, price, fixedstockprice, deliverytime,
              idvatgroup, idsupplier, productcode_supplier, description, barcode,
              updated, created, last_sync
            ) VALUES (
              @idproduct, @name, @productcode, @price, @fixedstockprice, @deliverytime,
              @idvatgroup, @idsupplier, @productcode_supplier, @description, @barcode,
              @updated, @created, GETDATE()
            )
          `);
      }
    }

    console.log(`✅ ${products.length} products saved to SQL`);
    await pool.close();
  } catch (err) {
    console.error('❌ Error saving to SQL:', err.message);
  }
}

// API Routes
app.get('/', (req, res) => {
  res.send('✅ Picqer Middleware API is running. Use /products, /sync, or /test endpoints.');
});

// Test connection to Picqer API
app.get('/test', async (req, res) => {
  try {
    const response = await axios.get(`${process.env.PICQER_BASE_URL}/products`, {
      params: { limit: 1 },
      auth: {
        username: process.env.PICQER_API_KEY,
        password: ''
      },
      headers: {
        'User-Agent': 'Skapa Middleware (info@skapa.nl)'
      }
    });
    
    res.json({
      status: 'success',
      message: 'Connection to Picqer API successful',
      data: response.data
    });
  } catch (err) {
    console.error('❌ Error testing Picqer API:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Connection to Picqer API failed',
      error: err.message,
      details: err.response ? err.response.data : null
    });
  }
});

// Get products from Picqer
app.get('/products', async (req, res) => {
  try {
    const updatedSince = req.query.from || '2025-01-01';
    const products = await fetchPicqerProducts(updatedSince);
    res.json(products);
  } catch (err) {
    console.error('❌ Error fetching products:', err.message);
    res.status(500).json({
      error: 'Error fetching products from Picqer',
      details: err.message
    });
  }
});

// Sync products from Picqer to SQL
app.get('/sync', async (req, res) => {
  try {
    const updatedSince = req.query.from || '2025-01-01';
    const fullSync = req.query.full === 'true';
    
    console.log(`Starting ${fullSync ? 'full' : 'incremental'} sync from ${updatedSince}`);
    
    const products = await fetchPicqerProducts(fullSync ? null : updatedSince);
    
    if (products.length > 0) {
      await saveProductsToSQL(products);
      res.json({
        status: 'success',
        message: `Synced ${products.length} products to SQL database`,
        syncType: fullSync ? 'full' : 'incremental',
        updatedSince: updatedSince
      });
    } else {
      res.json({
        status: 'success',
        message: 'No products to sync',
        syncType: fullSync ? 'full' : 'incremental',
        updatedSince: updatedSince
      });
    }
  } catch (err) {
    console.error('❌ Error during sync:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Error during sync process',
      error: err.message
    });
  }
});

// Schedule hourly sync
function scheduleHourlySync() {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(nextHour.getHours() + 1);
  nextHour.setMinutes(0);
  nextHour.setSeconds(0);
  nextHour.setMilliseconds(0);
  
  const timeUntilNextHour = nextHour - now;
  
  setTimeout(async () => {
    console.log('Running scheduled hourly sync...');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const formattedDate = yesterday.toISOString().split('T')[0];
    
    try {
      const products = await fetchPicqerProducts(formattedDate);
      if (products.length > 0) {
        await saveProductsToSQL(products);
        console.log(`✅ Scheduled sync completed: ${products.length} products updated`);
      } else {
        console.log('✅ Scheduled sync completed: No products to update');
      }
    } catch (err) {
      console.error('❌ Error during scheduled sync:', err.message);
    }
    
    // Schedule next sync
    scheduleHourlySync();
  }, timeUntilNextHour);
  
  console.log(`Next sync scheduled at: ${nextHour.toLocaleTimeString()}`);
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  
  // Schedule first sync
  scheduleHourlySync();
});
