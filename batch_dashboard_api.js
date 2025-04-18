/**
 * Enhanced Batch Dashboard API
 * 
 * This file provides the necessary API endpoints for the dashboard to display batch data.
 * It integrates with the enhanced batch service implementation that properly connects to Picqer.
 */

const express = require('express');
const router = express.Router();
const sql = require('mssql');

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
            id,
            idpicklist_batch,
            picklist_batchid,
            idwarehouse,
            type,
            status,
            assigned_to_iduser,
            assigned_to_name,
            total_products,
            total_picklists,
            created_at,
            updated_at,
            completed_at,
            last_sync_date
          FROM Batches
          ORDER BY created_at DESC
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
      
      // Get batch details from service
      const batch = await batchService.getBatch(batchId);
      
      if (!batch) {
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
            id,
            idpicklist,
            reference,
            status
          FROM Picklists
          WHERE idpicklist_batch = @batchId
        `);
      
      // Return batch details with picklists
      res.json({
        success: true,
        data: {
          ...batch,
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

  // Batch productivity endpoint
  router.get('/batches/productivity', async (req, res) => {
    try {
      console.log('Batch productivity requested');
      
      // Get days parameter for time range
      const days = parseInt(req.query.days) || 30;
      
      // Get productivity data from service
      const productivityData = await batchService.getProductivity(days);
      
      // Return productivity data
      res.json({
        success: true,
        data: productivityData,
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

  // Batch trends endpoint
  router.get('/batches/trends', async (req, res) => {
    try {
      console.log('Batch trends requested');
      
      // Get days parameter for time range
      const days = parseInt(req.query.days) || 30;
      
      // Get trend data from service
      const trendsData = await batchService.getTrends(days);
      
      // Return trend data
      res.json({
        success: true,
        data: trendsData,
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
  router: express.Router(),
  initialize
};
