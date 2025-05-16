/**
 * Dashboard Route for Picqer Middleware
 * Serves the dashboard HTML and static assets
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Debug middleware to log file existence
router.use((req, res, next) => {
  console.log(`Dashboard request: ${req.path}`);
  next();
});

// Serve the dashboard HTML
router.get('/', (req, res) => {
  const dashboardPath = path.join(__dirname, 'dashboard.html');
  
  // Check if file exists and log result
  fs.access(dashboardPath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error(`Dashboard file not found at ${dashboardPath}`);
      return res.status(404).send(`Dashboard file not found at ${dashboardPath}. Error: ${err.message}`);
    }
    
    console.log(`Serving dashboard from ${dashboardPath}`);
    res.sendFile(dashboardPath);
  });
});

// Serve dashboard JavaScript files
router.get('/:file.js', (req, res) => {
  const filename = req.params.file + '.js';
  const filePath = path.join(__dirname, filename);
  
  // Check if file exists and log result
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error(`JavaScript file not found: ${filePath}`);
      return res.status(404).send(`JavaScript file not found: ${filePath}`);
    }
    
    console.log(`Serving JavaScript file: ${filePath}`);
    res.sendFile(filePath);
  });
});

// Serve CSS files if needed
router.get('/:file.css', (req, res) => {
  const filename = req.params.file + '.css';
  const filePath = path.join(__dirname, filename);
  
  // Check if file exists and log result
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error(`CSS file not found: ${filePath}`);
      return res.status(404).send(`CSS file not found: ${filePath}`);
    }
    
    console.log(`Serving CSS file: ${filePath}`);
    res.sendFile(filePath);
  });
});

// Serve images if needed
router.get('/images/:file', (req, res) => {
  const filename = req.params.file;
  const filePath = path.join(__dirname, 'images', filename);
  
  // Check if file exists and log result
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error(`Image file not found: ${filePath}`);
      return res.status(404).send(`Image file not found: ${filePath}`);
    }
    
    console.log(`Serving image file: ${filePath}`);
    res.sendFile(filePath);
  });
});

// Serve static files from public directory if it exists
const publicDir = path.join(__dirname, 'public');
fs.access(publicDir, fs.constants.F_OK, (err) => {
  if (!err) {
    console.log(`Serving static files from ${publicDir}`);
    router.use('/public', express.static(publicDir));
  }
});

module.exports = router;
