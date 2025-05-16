/**
 * Dashboard Route for Picqer Middleware
 * Serves the dashboard HTML and static assets
 */
const express = require('express');
const path = require('path');
const router = express.Router();

// Serve the dashboard HTML
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Serve dashboard JavaScript files
router.get('/:file.js', (req, res) => {
  const filename = req.params.file + '.js';
  res.sendFile(path.join(__dirname, filename));
});

// Serve CSS files if needed
router.get('/:file.css', (req, res) => {
  const filename = req.params.file + '.css';
  res.sendFile(path.join(__dirname, filename));
});

// Serve images if needed
router.get('/images/:file', (req, res) => {
  const filename = req.params.file;
  res.sendFile(path.join(__dirname, 'images', filename));
});

module.exports = router;
