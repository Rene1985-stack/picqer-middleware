/**
 * Code to update index.js to include the Purchase Order service
 * This code should be added to your existing index.js file
 */

// Add this to your imports section
const PurchaseOrderService = require('./purchase_order_service');

// Add this to your service initialization section
const purchaseOrderService = new PurchaseOrderService(apiKey, baseUrl, sqlConfig);

// Add this to your initialization function
async function initializeDatabase() {
  try {
    console.log("Initializing database...");
    
    // Add this line to initialize purchase orders database
    await purchaseOrderService.initializePurchaseOrdersDatabase();
    
    console.log("Database initialized successfully");
    return true;
  } catch (error) {
    console.error("Error initializing database:", error.message);
    return false;
  }
}

// Add this to your exports section
module.exports = {
  // ... existing exports
  purchaseOrderService
};
