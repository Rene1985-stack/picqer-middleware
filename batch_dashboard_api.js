/**
 * Batch API Endpoints for Dashboard
 * 
 * This file provides the necessary API endpoints for the dashboard to display batch data.
 * It integrates with the standard batch service implementation.
 */

const express = require('express');
const router = express.Router();

// Initialize batch endpoints
let batchService;
let pool;

/**
 * Initialize the router with a database connection pool
 * @param {Object} dbPool - SQL connection pool
 * @param {Object} services - Service instances including BatchService
 * @returns {express.Router} - Configured router
 */
function initialize(dbPool, services) {
  pool = dbPool;
  batchService = services.BatchService;
  
  // Batch list endpoint
  router.get('/batches', async (req, res) => {
    try {
      console.log('Batches list requested');
      
      // Parse pagination parameters
      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.pageSize) || 10;
      const offset = (page - 1) * pageSize;
      
      // Get batches with pagination
      const result = await pool.request()
        .input('offset', sql.Int, offset)
        .input('limit', sql.Int, pageSize)
        .query(`
          SELECT 
            b.id,
            b.idbatch,
            b.batch_number,
            b.created_at,
            b.status,
            b.total_products,
            b.total_picklists,
            b.last_sync_date
          FROM Batches b
          ORDER BY b.created_at DESC
          OFFSET @offset ROWS
          FETCH NEXT @limit ROWS ONLY
        `);
      
      // Get total count
      const countResult = await pool.request()
        .query(`
          SELECT COUNT(*) AS total
          FROM Batches
        `);
      
      const total = countResult.recordset[0].total;
      
      // Return batches with pagination info
      res.json({
        success: true,
        data: result.recordset,
        pagination: {
          page,
          pageSize,
          total,
          pages: Math.ceil(total / pageSize)
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting batches:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get batches',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Batch details endpoint
  router.get('/batches/:id', async (req, res) => {
    try {
      const batchId = parseInt(req.params.id);
      
      if (isNaN(batchId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid batch ID',
          message: 'Batch ID must be a number',
          timestamp: new Date().toISOString()
        });
      }
      
      console.log(`Batch details requested for ID: ${batchId}`);
      
      // Get batch details
      const result = await pool.request()
        .input('batchId', sql.Int, batchId)
        .query(`
          SELECT 
            b.id,
            b.idbatch,
            b.batch_number,
            b.created_at,
            b.assigned_to_iduser,
            b.picking_started_at,
            b.picking_completed_at,
            b.closed_by_iduser,
            b.packing_started_at,
            b.closed_at,
            b.status,
            b.warehouse_id,
            b.total_products,
            b.total_picklists,
            b.notes,
            b.last_sync_date
          FROM Batches b
          WHERE b.id = @batchId
        `);
      
      if (result.recordset.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Batch not found',
          message: `Batch with ID ${batchId} not found`,
          timestamp: new Date().toISOString()
        });
      }
      
      // Get associated picklists
      const picklistsResult = await pool.request()
        .input('batchId', sql.Int, batchId)
        .query(`
          SELECT 
            p.id,
            p.idpicklist,
            p.reference,
            p.status
          FROM Picklists p
          WHERE p.idpicklist_batch = @batchId
        `);
      
      // Return batch details with picklists
      res.json({
        success: true,
        data: {
          ...result.recordset[0],
          picklists: picklistsResult.recordset
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`Error getting batch details for ID ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to get batch details',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Batch productivity endpoint (simplified version with mock data)
  router.get('/batches/productivity', async (req, res) => {
    try {
      console.log('Batch productivity requested');
      
      // Get days parameter for time range
      const days = parseInt(req.query.days) || 30;
      
      // Get actual batch count from database
      const batchCountResult = await pool.request()
        .query(`
          SELECT COUNT(*) AS count
          FROM Batches
          WHERE created_at >= DATEADD(day, -${days}, GETDATE())
        `);
      
      const batchCount = batchCountResult.recordset[0].count;
      
      // Return simplified productivity data
      res.json({
        success: true,
        data: {
          picker_productivity: {
            average_items_per_hour: 45,
            average_batches_per_day: Math.max(1, Math.round(batchCount / days)),
            total_items_picked: batchCount * 15,
            total_batches_completed: batchCount
          },
          packer_productivity: {
            average_items_per_hour: 60,
            average_batches_per_day: Math.max(1, Math.round(batchCount / days)),
            total_items_packed: batchCount * 15,
            total_batches_completed: batchCount
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting batch productivity:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get batch productivity',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Batch trends endpoint (simplified version with mock data)
  router.get('/batches/trends', async (req, res) => {
    try {
      console.log('Batch trends requested');
      
      // Get days parameter for time range
      const days = parseInt(req.query.days) || 30;
      
      // Generate dates for the past N days
      const dates = [];
      const today = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        dates.push(date.toISOString().split('T')[0]);
      }
      
      // Get actual batch counts by day from database
      const batchCountsResult = await pool.request()
        .query(`
          SELECT 
            CONVERT(date, created_at) AS date,
            COUNT(*) AS count
          FROM Batches
          WHERE created_at >= DATEADD(day, -${days}, GETDATE())
          GROUP BY CONVERT(date, created_at)
          ORDER BY CONVERT(date, created_at)
        `);
      
      // Create a map of date to count
      const batchCountsByDate = {};
      batchCountsResult.recordset.forEach(row => {
        const dateStr = new Date(row.date).toISOString().split('T')[0];
        batchCountsByDate[dateStr] = row.count;
      });
      
      // Generate trend data with actual counts where available
      const pickerData = dates.map(date => ({
        date,
        count: batchCountsByDate[date] || 0,
        items_per_hour: 40 + Math.floor(Math.random() * 10)
      }));
      
      const packerData = dates.map(date => ({
        date,
        count: batchCountsByDate[date] || 0,
        items_per_hour: 55 + Math.floor(Math.random() * 10)
      }));
      
      // Return trend data
      res.json({
        success: true,
        data: {
          picker_trends: pickerData,
          packer_trends: packerData
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting batch trends:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get batch trends',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Batch sync endpoint
  router.post('/sync/batches', async (req, res) => {
    try {
      console.log('Batch sync requested');
      
      // Determine if this is a full sync
      const fullSync = req.query.full === 'true';
      
      // Start the sync process
      const result = await batchService.syncBatches(fullSync);
      
      // Return the result
      res.json({
        success: true,
        message: `Batch sync ${result.success ? 'completed successfully' : 'failed'}`,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error syncing batches:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to sync batches',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  console.log('Batch API endpoints initialized');
  return router;
}

module.exports = {
  router,
  initialize
};
