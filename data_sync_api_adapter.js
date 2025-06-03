/**
 * Code to update data_sync_api_adapter.js to include the Purchase Order service endpoints
 * This code should be added to your existing data_sync_api_adapter.js file
 */

// Add this to your imports section if not already present
const { purchaseOrderService } = require('./index');

// Add these endpoints to your router setup

// GET endpoint to sync purchase orders
router.get('/sync/purchaseorders', async (req, res) => {
  try {
    const fullSync = req.query.full === 'true';
    const days = req.query.days ? parseInt(req.query.days) : null;
    
    console.log(`Received request to ${fullSync ? 'fully' : 'incrementally'} sync purchase orders${days ? ` for the last ${days} days` : ''}`);
    
    const result = await purchaseOrderService.syncPurchaseOrders(fullSync, days);
    
    res.json({
      success: true,
      message: `Purchase orders sync ${result.success ? 'completed' : 'failed'}`,
      details: result
    });
  } catch (error) {
    console.error('Error syncing purchase orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing purchase orders',
      error: error.message
    });
  }
});

// GET endpoint to get purchase orders
router.get('/purchaseorders', async (req, res) => {
  try {
    const pool = await sql.connect(sqlConfig);
    const result = await pool.request().query(`
      SELECT po.*, 
        (SELECT COUNT(*) FROM PurchaseOrderProducts WHERE idpurchaseorder = po.idpurchaseorder) AS product_count,
        (SELECT COUNT(*) FROM PurchaseOrderComments WHERE idpurchaseorder = po.idpurchaseorder) AS comment_count
      FROM PurchaseOrders po
      ORDER BY po.updated DESC
    `);
    
    res.json({
      success: true,
      data: result.recordset
    });
  } catch (error) {
    console.error('Error getting purchase orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting purchase orders',
      error: error.message
    });
  }
});

// GET endpoint to get a specific purchase order with its products and comments
router.get('/purchaseorders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await sql.connect(sqlConfig);
    
    // Get purchase order
    const purchaseOrderResult = await pool.request()
      .input('idpurchaseorder', sql.Int, id)
      .query('SELECT * FROM PurchaseOrders WHERE idpurchaseorder = @idpurchaseorder');
    
    if (purchaseOrderResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Purchase order with ID ${id} not found`
      });
    }
    
    const purchaseOrder = purchaseOrderResult.recordset[0];
    
    // Get purchase order products
    const productsResult = await pool.request()
      .input('idpurchaseorder', sql.Int, id)
      .query('SELECT * FROM PurchaseOrderProducts WHERE idpurchaseorder = @idpurchaseorder');
    
    // Get purchase order comments
    const commentsResult = await pool.request()
      .input('idpurchaseorder', sql.Int, id)
      .query('SELECT * FROM PurchaseOrderComments WHERE idpurchaseorder = @idpurchaseorder ORDER BY created DESC');
    
    // Combine results
    purchaseOrder.products = productsResult.recordset;
    purchaseOrder.comments = commentsResult.recordset;
    
    res.json({
      success: true,
      data: purchaseOrder
    });
  } catch (error) {
    console.error(`Error getting purchase order ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: `Error getting purchase order ${req.params.id}`,
      error: error.message
    });
  }
});
