require('dotenv').config();
const sql = require('mssql');
const axios = require('axios');

const sqlConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  options: {
    encrypt: true
  }
};

async function fetchPicqerProducts() {
  try {
    const products = [];
    let page = 1;
    const pageSize = 100;

    while (true) {
      const response = await axios.get(`${process.env.PICQER_BASE_URL}/products`, {
        params: { page, limit: pageSize },
        headers: {
          Authorization: `Bearer ${process.env.PICQER_API_KEY}`,
          'User-Agent': 'Skapa Middleware'
        }
      });

      if (response.data.length === 0) break;

      products.push(...response.data);
      page++;
      await new Promise(r => setTimeout(r, 1000)); // respecteer rate limit
    }

    console.log(`🔄 Totaal ${products.length} producten opgehaald`);
    return products;

  } catch (err) {
    console.error('❌ Fout bij ophalen uit Picqer:', err.message);
    return [];
  }
}

async function saveProductsToSQL(products) {
  try {
    const pool = await sql.connect(sqlConfig);

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

    console.log(`✅ ${products.length} producten opgeslagen in SQL`);
    pool.close();
  } catch (err) {
    console.error('❌ Fout bij opslaan in SQL:', err.message);
  }
}

async function run() {
  const products = await fetchPicqerProducts();
  if (products.length > 0) {
    await saveProductsToSQL(products);
  }
}

run();
