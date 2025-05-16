/**
 * Dashboard Route for Picqer Middleware
 * Serves the dashboard HTML directly from the route handler
 */
const express = require('express');
const path = require('path');
const router = express.Router();

// Debug middleware to log requests
router.use((req, res, next) => {
  console.log(`Dashboard request: ${req.path}`);
  next();
});

// Serve the dashboard HTML directly from the route handler
router.get('/', (req, res) => {
  console.log('Serving dashboard HTML');
  
  // First try to serve the file from disk
  const dashboardPath = path.join(__dirname, 'dashboard.html');
  
  // Use sendFile with error handling
  res.sendFile(dashboardPath, (err) => {
    if (err) {
      console.log(`Error serving dashboard.html: ${err.message}`);
      // Fallback to a simple HTML response
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Skapa Picqer Middleware</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 20px;
                    background-color: #f5f5f5;
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    background-color: white;
                    padding: 20px;
                    border-radius: 5px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                h1 {
                    color: #00c853;
                }
                .btn {
                    display: inline-block;
                    background-color: #00c853;
                    color: white;
                    padding: 10px 15px;
                    text-decoration: none;
                    border-radius: 4px;
                    margin-top: 20px;
                }
                .status {
                    margin-top: 20px;
                    padding: 15px;
                    background-color: #f8f9fa;
                    border-radius: 4px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Skapa Picqer Middleware</h1>
                <p>Welcome to the Picqer to SQL synchronization middleware.</p>
                
                <div class="status">
                    <h2>API Status</h2>
                    <p>Check the status of your synchronization:</p>
                    <a href="/api/sync/status" class="btn">View Sync Status</a>
                </div>
                
                <div class="status">
                    <h2>Sync Data</h2>
                    <p>Start synchronization for specific entities:</p>
                    <a href="#" onclick="syncEntity('product'); return false;" class="btn">Sync Products</a>
                    <a href="#" onclick="syncEntity('supplier'); return false;" class="btn">Sync Suppliers</a>
                    <a href="#" onclick="syncEntity('warehouse'); return false;" class="btn">Sync Warehouses</a>
                </div>
            </div>
            
            <script>
                function syncEntity(entityType) {
                    fetch('/api/sync/' + entityType, {
                        method: 'POST'
                    })
                    .then(response => response.json())
                    .then(data => {
                        alert('Sync started for ' + entityType + '. Check status endpoint for results.');
                    })
                    .catch(error => {
                        alert('Error starting sync: ' + error.message);
                    });
                }
            </script>
        </body>
        </html>
      `);
    }
  });
});

// Serve dashboard JavaScript files
router.get('/:file.js', (req, res) => {
  const filename = req.params.file + '.js';
  res.sendFile(path.join(__dirname, filename), (err) => {
    if (err) {
      console.log(`Error serving ${filename}: ${err.message}`);
      res.status(404).send('File not found');
    }
  });
});

// Serve CSS files if needed
router.get('/:file.css', (req, res) => {
  const filename = req.params.file + '.css';
  res.sendFile(path.join(__dirname, filename), (err) => {
    if (err) {
      console.log(`Error serving ${filename}: ${err.message}`);
      res.status(404).send('File not found');
    }
  });
});

module.exports = router;
