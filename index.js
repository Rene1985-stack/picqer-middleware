require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('✅ Middleware API draait. Gebruik /products, /picklists of /apikeys voor Picqer-data.');
});

app.get('/apikeys', async (req, res) => {
  try {
    const response = await axios.get(`${process.env.PICQER_BASE_URL}/apikeys`, {
      auth: {
        username: process.env.PICQER_API_KEY,
        password: ''
      },
      headers: {
        'User-Agent': 'Skapa-Picqer-Middleware (info@skapa.nl)'
      }
    });
    res.json(response.data);
  } catch (err) {
    console.error('❌ Fout bij ophalen apikeys:', err.message, err.response?.data);
    res.status(500).json({
      error: 'Fout bij ophalen data uit Picqer (/apikeys)',
      details: err.message,
      response: err.response?.data || null
    });
  }
});

app.get('/picklists', async (req, res) => {
  try {
    const response = await axios.get(`${process.env.PICQER_BASE_URL}/picklists`, {
      auth: {
        username: process.env.PICQER_API_KEY,
        password: ''
      },
      headers: {
        'User-Agent': 'Skapa-Picqer-Middleware (info@skapa.nl)'
      }
    });
    res.json(response.data);
  } catch (err) {
    console.error('❌ Fout bij ophalen picklists:', err.message, err.response?.data);
    res.status(500).json({
      error: 'Fout bij ophalen data uit Picqer (/picklists)',
      details: err.message,
      response: err.response?.data || null
    });
  }
});

app.get('/products', async (req, res) => {
  try {
    const from = req.query.from || '2025-01-01';
    const response = await axios.get(`${process.env.PICQER_BASE_URL}/products?updated_since=${from}`, {
      auth: {
        username: process.env.PICQER_API_KEY,
        password: ''
      },
      headers: {
        'User-Agent': 'Skapa-Picqer-Middleware (info@skapa.nl)'
      }
    });
    res.json(response.data);
  } catch (err) {
    console.error('❌ Fout bij ophalen products:', err.message, err.response?.data);
    res.status(500).json({
      error: 'Fout bij ophalen data uit Picqer (/products)',
      details: err.message,
      response: err.response?.data || null
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server draait op poort ${PORT}`);
});
