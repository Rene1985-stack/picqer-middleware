/**
 * Simplified Batch Sync Implementation
 * 
 * This file provides a streamlined implementation for syncing batches from Picqer to SQL
 * without any productivity tracking features. It focuses solely on data synchronization.
 */

const express = require('express');
const router = express.Router();
const sql = require('mssql');
const BatchService = require('./batch_service');

// Initialize batch service
let batchService;
let pool;

/**
 * Initialize the router with a database connection pool
 * @param {sql.ConnectionPool} dbPool - SQL connection pool
 * @param {Object} picqerConfig - Configuration for Picqer API
 * @returns {express.Router} - Configured router
 */
function initialize(dbPool, picqerConfig) {
  pool = dbPool;
  batchService = new BatchService(pool, picqerConfig);
  
  // Batch sync endpoint
  router.post('/sync/batches', async (req, res) => {
    try {
      console.log('Batch sync requested');
      
      // Start the sync process
      const result = await batchService.syncBatches();
      
      // Return the result
      res.json({
        success: true,
        message: 'Batch sync completed successfully',
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

  // Get batch sync status endpoint
  router.get('/sync/batches/status', async (req, res) => {
    try {
      console.log('Batch sync status requested');
      
      // Get the last sync date and status
      const result = await pool.request()
        .input('entityType', sql.NVarChar, 'batches')
        .query(`
          SELECT TOP 1 
            entity_type,
            last_sync_date,
            status,
            total_count,
            processed_count,
            error_message
          FROM SyncProgress
          WHERE entity_type = @entityType
          ORDER BY last_sync_date DESC
        `);
      
      if (result.recordset.length > 0) {
        res.json({
          success: true,
          data: result.recordset[0],
          timestamp: new Date().toISOString()
        });
      } else {
        res.json({
          success: true,
          data: {
            entity_type: 'batches',
            last_sync_date: null,
            status: 'never_run',
            total_count: 0,
            processed_count: 0,
            error_message: null
          },
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error getting batch sync status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get batch sync status',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get batches endpoint (simple listing without productivity metrics)
  router.get('/batches', async (req, res) => {
    try {
      console.log('Batches list requested');
      
      // Parse pagination parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;
      
      // Get batches with pagination
      const result = await pool.request()
        .input('offset', sql.Int, offset)
        .input('limit', sql.Int, limit)
        .query(`
          SELECT 
            b.id,
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
        data: {
          batches: result.recordset,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
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

  // Get batch details endpoint (simple details without productivity metrics)
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

  console.log('Simplified batch sync endpoints initialized');
  return router;
}

module.exports = {
  router,
  initialize
};
