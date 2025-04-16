require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('✅ Middleware API draait. Gebruik /picklists voor Picqer-data.');
});

app.get('/picklists', async (req, res) => {
  try {
    const response = await axios.get(`${process.env.PICQER_BASE_URL}/picklists`, {
      headers: {
        Authorization: `Bearer ${process.env.PICQER_API_KEY}`
      }
    });

    res.json(response.data);
  } catch (err) {
    console.error('Fout bij ophalen picklists:', err.message, err.response?.data);
    res.status(500).json({ 
      error: 'Fout bij ophalen data uit Picqer', 
      details: err.message,
      response: err.response?.data || null
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server draait op poort ${PORT}`);
});
