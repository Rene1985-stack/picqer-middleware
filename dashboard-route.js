/**
 * Dashboard Route for Picqer Middleware
 * Serves the dashboard HTML and static assets
 * 
 * UPDATED: Now uses __dirname for local development and process.cwd() for Railway deployment
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Helper function to find files in multiple possible locations
function findFile(filename) {
  // Possible locations to check for files
  const possiblePaths = [
    path.join(__dirname, filename),                // Local development - same directory as this file
    path.join(process.cwd(), filename),            // Railway deployment - app root directory
    path.join(process.cwd(), 'public', filename),  // Railway deployment - public directory
    path.join('/app', filename),                   // Railway deployment - absolute path
    path.join('/app/public', filename)             // Railway deployment - absolute public path
  ];
  
  // Log all paths being checked
  console.log(`Looking for ${filename} in multiple locations:`);
  possiblePaths.forEach(p => console.log(` - ${p}`));
  
  // Return the first path that exists
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        console.log(`Found ${filename} at: ${p}`);
        return p;
      }
    } catch (err) {
      console.error(`Error checking path ${p}:`, err.message);
    }
  }
  
  console.error(`File ${filename} not found in any location`);
  return null;
}

// Debug middleware to log file existence
router.use((req, res, next) => {
  console.log(`Dashboard request: ${req.path}`);
  next();
});

// Serve the dashboard HTML
router.get('/', (req, res) => {
  const dashboardPath = findFile('dashboard.html');
  
  if (!dashboardPath) {
    return res.status(404).send(`Dashboard file not found. Checked multiple locations.`);
  }
  
  console.log(`Serving dashboard from ${dashboardPath}`);
  res.sendFile(dashboardPath);
});

// Serve dashboard JavaScript files
router.get('/:file.js', (req, res) => {
  const filename = req.params.file + '.js';
  const filePath = findFile(filename);
  
  if (!filePath) {
    return res.status(404).send(`JavaScript file not found: ${filename}`);
  }
  
  console.log(`Serving JavaScript file: ${filePath}`);
  res.sendFile(filePath);
});

// Serve CSS files if needed
router.get('/:file.css', (req, res) => {
  const filename = req.params.file + '.css';
  const filePath = findFile(filename);
  
  if (!filePath) {
    return res.status(404).send(`CSS file not found: ${filename}`);
  }
  
  console.log(`Serving CSS file: ${filePath}`);
  res.sendFile(filePath);
});

// Serve images if needed
router.get('/images/:file', (req, res) => {
  const filename = path.join('images', req.params.file);
  const filePath = findFile(filename);
  
  if (!filePath) {
    return res.status(404).send(`Image file not found: ${filename}`);
  }
  
  console.log(`Serving image file: ${filePath}`);
  res.sendFile(filePath);
});

// Create a public directory if it doesn't exist
const publicDir = path.join(process.cwd(), 'public');
try {
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
    console.log(`Created public directory at ${publicDir}`);
  }
} catch (err) {
  console.error(`Error creating public directory:`, err.message);
}

// Serve static files from public directory
router.use('/public', express.static(publicDir));

module.exports = router;
