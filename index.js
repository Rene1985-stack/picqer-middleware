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

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getAllPages = async (endpoint, from) => {
  let page = 1;
  const allData = [];

  while (true) {
    const url = `${process.env.PICQER_BASE_URL}${endpoint}?updated_since=${from}&page=${page}`;

    try {
      const response = await axios.get(url, {
        auth: {
          username: process.env.PICQER_API_KEY,
          password: ''
        },
        headers: {
          'User-Agent': 'Skapa-Picqer-Middleware (info@skapa.nl)'
        }
      });

      if (response.data.length === 0) break;

      allData.push(...response.data);
      page++;
    } catch (err) {
      if (err.response?.status === 429) {
        const retryAfter = parseInt(err.response.headers['retry-after'] || '5', 10);
        console.warn(`⏳ Ratelimit bereikt. Wachten ${retryAfter} seconden...`);
        await delay(retryAfter * 1000);
      } else {
        throw err;
      }
    }
  }

  return allData;
};

app.get('/products', async (req, res) => {
  try {
    const from = req.query.from || '2025-01-01';
    const data = await getAllPages('/products', from);
    res.json(data);
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
