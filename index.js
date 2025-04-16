require('dotenv').config();
const express = require('express');
const axios = require('axios');
const sql = require('mssql');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// SQL Configuratie
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

// Product ophalen + wegschrijven
async function fetchAndStoreProducts() {
  const pageSize = 100;
  let page = 1;
  let totalFetched = 0;

  try {
    const pool = await sql.connect(sqlConfig);

    // Maak de tabel aan als die niet bestaat
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'products')
      CREATE TABLE products (
        idproduct INT,
        name NVARCHAR(MAX),
        productcode NVARCHAR(MAX),
        price FLOAT,
        fixedstockprice FLOAT,
        deliverytime INT,
        idvatgroup INT,
        idsupplier INT,
        productcode_supplier NVARCHAR(MAX),
        description NVARCHAR(MAX)
      )
    `);

    let hasMore = true;

    while (hasMore) {
      const response = await axios.get(`${process.env.PICQER_BASE_URL}/products`, {
        params: { page, limit: pageSize },
        headers: {
          Authorization: `Bearer ${process.env.PICQER_API_KEY}`,
          'User-Agent': 'Skapa Middleware'
        }
      });

      const products = response.data;

      if (products.length === 0) {
        hasMore = false;
        break;
      }

      for (const product of products) {
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
          .query(`
            INSERT INTO products (
              idproduct, name, productcode, price, fixedstockprice, deliverytime,
              idvatgroup, idsupplier, productcode_supplier, description
            ) VALUES (
              @idproduct, @name, @productcode, @price, @fixedstockprice, @deliverytime,
              @idvatgroup, @idsupplier, @productcode_supplier, @description
            )
          `);
      }

      totalFetched += products.length;
      console.log(`✅ Pagina ${page} verwerkt, totaal ${totalFetched} producten`);
      page++;

      // Wacht 1 seconde per request ivm Picqer rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    pool.close();
  } catch (error) {
    console.error('❌ Fout bij ophalen of wegschrijven:', error.message, error.response?.data);
  }
}

app.get('/import/products', async (req, res) => {
  await fetchAndStoreProducts();
  res.json({ message: '✅ Import afgerond' });
});

app.get('/', (req, res) => {
  res.send('Skapa Middleware draait ✔️');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server draait op poort ${PORT}`);
});
