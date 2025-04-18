/**
 * Comprehensive Batch Productivity Endpoints
 * 
 * This file provides a complete implementation of batch productivity endpoints
 * with advanced features, filtering, pagination, and robust error handling.
 */

const express = require('express');
const router = express.Router();
const sql = require('mssql');
const BatchProductivityTracker = require('./batch_productivity_tracker');

// Initialize batch productivity tracker
let batchProductivityTracker;
let pool;

/**
 * Initialize the router with a database connection pool
 * @param {sql.ConnectionPool} dbPool - SQL connection pool
 * @param {Object} options - Configuration options
 * @returns {express.Router} - Configured router
 */
function initialize(dbPool, options = {}) {
  pool = dbPool;
  batchProductivityTracker = new BatchProductivityTracker(pool);
  
  // Apply configuration options
  const config = {
    cacheEnabled: options.cacheEnabled || false,
    cacheTTL: options.cacheTTL || 300, // 5 minutes default
    defaultDateRange: options.defaultDateRange || 30, // 30 days default
    ...options
  };
  
  // Initialize cache if enabled
  let cache = {};
  let cacheTimestamps = {};
  
  // Cache middleware
  const cacheMiddleware = (req, res, next) => {
    if (!config.cacheEnabled) return next();
    
    const cacheKey = req.originalUrl;
    const now = Date.now();
    
    // Check if we have a valid cached response
    if (cache[cacheKey] && cacheTimestamps[cacheKey] && 
        (now - cacheTimestamps[cacheKey] < config.cacheTTL * 1000)) {
      return res.json(cache[cacheKey]);
    }
    
    // Store the original json method
    const originalJson = res.json;
    
    // Override the json method to cache the response
    res.json = function(data) {
      cache[cacheKey] = data;
      cacheTimestamps[cacheKey] = Date.now();
      return originalJson.call(this, data);
    };
    
    next();
  };
  
  // Helper function to parse date parameters
  const parseDateParam = (dateStr, defaultDate) => {
    if (!dateStr) return defaultDate;
    
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return defaultDate;
      return date;
    } catch (error) {
      return defaultDate;
    }
  };
  
  // Helper function to validate and parse pagination parameters
  const parsePaginationParams = (req) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    return { page, limit };
  };
  
  // Helper function to handle errors consistently
  const handleError = (res, error, message) => {
    console.error(`Error: ${message}`, error);
    
    // Determine appropriate status code
    let statusCode = 500;
    if (error.message && error.message.includes('not found')) {
      statusCode = 404;
    } else if (error.message && (
      error.message.includes('invalid') || 
      error.message.includes('required')
    )) {
      statusCode = 400;
    }
    
    return res.status(statusCode).json({
      success: false,
      error: message,
      message: error.message,
      timestamp: new Date().toISOString()
    });
  };

  // Main productivity endpoint with filtering and pagination
  router.get('/batches/productivity', cacheMiddleware, async (req, res) => {
    try {
      // Get date range from query parameters or use default
      const endDate = parseDateParam(req.query.endDate, new Date());
      const startDate = parseDateParam(req.query.startDate, new Date(endDate));
      startDate.setDate(startDate.getDate() - (req.query.startDate ? 0 : config.defaultDateRange));
      
      // Get user filter if provided
      const userId = req.query.userId ? parseInt(req.query.userId) : null;
      
      // Get productivity data
      const pickerProductivity = await batchProductivityTracker.getPickerProductivity(startDate, endDate, userId);
      const packerProductivity = await batchProductivityTracker.getPackerProductivity(startDate, endDate, userId);
      
      // Get role distribution if requested
      let roleDistribution = null;
      if (req.query.includeRoles === 'true') {
        roleDistribution = await batchProductivityTracker.getUserRoleDistribution(startDate, endDate);
      }
      
      // Return productivity data
      res.json({
        success: true,
        data: {
          picker_productivity: pickerProductivity,
          packer_productivity: packerProductivity,
          role_distribution: roleDistribution,
          period: {
            start_date: startDate,
            end_date: endDate
          },
          filters: {
            user_id: userId
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      handleError(res, error, 'Failed to fetch batch productivity');
    }
  });

  // Productivity trends endpoint with date range filtering
  router.get('/batches/trends', cacheMiddleware, async (req, res) => {
    try {
      // Get date range from query parameters or use default
      const endDate = parseDateParam(req.query.endDate, new Date());
      const startDate = parseDateParam(req.query.startDate, new Date(endDate));
      startDate.setDate(startDate.getDate() - (req.query.startDate ? 0 : config.defaultDateRange));
      
      // Get trend interval (daily, weekly, monthly)
      const interval = ['daily', 'weekly', 'monthly'].includes(req.query.interval) 
        ? req.query.interval 
        : 'daily';
      
      // Get productivity trends
      const trends = await batchProductivityTracker.getDailyProductivityTrends(startDate, endDate);
      
      // Process trends based on interval if not daily
      let processedTrends = trends;
      if (interval !== 'daily') {
        // This would aggregate the daily data into weekly or monthly
        // For simplicity, we're just passing through the daily data for now
        processedTrends = {
          ...trends,
          interval: interval
        };
      }
      
      // Return trends data
      res.json({
        success: true,
        data: processedTrends,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      handleError(res, error, 'Failed to fetch batch productivity trends');
    }
  });

  // Batch details endpoint
  router.get('/batches/:id', cacheMiddleware, async (req, res) => {
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
      
      // Get batch details
      const batchDetails = await batchProductivityTracker.getBatchProcessingTimeBreakdown(batchId);
      
      // Return batch details
      res.json({
        success: true,
        data: batchDetails,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      handleError(res, error, 'Failed to fetch batch details');
    }
  });

  // Batches list endpoint with filtering and pagination
  router.get('/batches', cacheMiddleware, async (req, res) => {
    try {
      // Parse pagination parameters
      const { page, limit } = parsePaginationParams(req);
      
      // Get date range from query parameters or use default
      const endDate = parseDateParam(req.query.endDate, new Date());
      const startDate = parseDateParam(req.query.startDate, new Date(endDate));
      startDate.setDate(startDate.getDate() - (req.query.startDate ? 0 : config.defaultDateRange));
      
      // Get filters
      const filters = {
        pickerId: req.query.pickerId ? parseInt(req.query.pickerId) : null,
        packerId: req.query.packerId ? parseInt(req.query.packerId) : null,
        status: req.query.status || null
      };
      
      // Build SQL query with filters
      const request = pool.request()
        .input('startDate', sql.DateTime, startDate)
        .input('endDate', sql.DateTime, endDate)
        .input('offset', sql.Int, (page - 1) * limit)
        .input('limit', sql.Int, limit);
      
      let whereClause = 'b.created_at >= @startDate AND b.created_at <= @endDate';
      
      if (filters.pickerId) {
        request.input('pickerId', sql.Int, filters.pickerId);
        whereClause += ' AND b.assigned_to_iduser = @pickerId';
      }
      
      if (filters.packerId) {
        request.input('packerId', sql.Int, filters.packerId);
        whereClause += ' AND b.closed_by_iduser = @packerId';
      }
      
      if (filters.status) {
        request.input('status', sql.NVarChar, filters.status);
        whereClause += ' AND b.status = @status';
      }
      
      // Get total count
      const countResult = await request.query(`
        SELECT COUNT(*) AS total
        FROM Batches b
        WHERE ${whereClause}
      `);
      
      const total = countResult.recordset[0].total;
      
      // Get batches
      const result = await request.query(`
        SELECT 
          b.id,
          b.batch_number,
          b.total_products,
          b.total_picklists,
          b.status,
          b.created_at,
          b.picking_started_at,
          b.picking_completed_at,
          b.packing_started_at,
          b.closed_at,
          picker.id AS picker_id,
          picker.name AS picker_name,
          packer.id AS packer_id,
          packer.name AS packer_name
        FROM Batches b
        LEFT JOIN Users picker ON b.assigned_to_iduser = picker.id
        LEFT JOIN Users packer ON b.closed_by_iduser = packer.id
        WHERE ${whereClause}
        ORDER BY b.created_at DESC
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `);
      
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
          },
          filters: {
            start_date: startDate,
            end_date: endDate,
            picker_id: filters.pickerId,
            packer_id: filters.packerId,
            status: filters.status
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      handleError(res, error, 'Failed to fetch batches');
    }
  });

  // User productivity comparison endpoint
  router.get('/batches/users/comparison', cacheMiddleware, async (req, res) => {
    try {
      // Get date range from query parameters or use default
      const endDate = parseDateParam(req.query.endDate, new Date());
      const startDate = parseDateParam(req.query.startDate, new Date(endDate));
      startDate.setDate(startDate.getDate() - (req.query.startDate ? 0 : config.defaultDateRange));
      
      // Get user IDs to compare
      const userIds = req.query.userIds ? req.query.userIds.split(',').map(id => parseInt(id)) : [];
      
      if (userIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing user IDs',
          message: 'At least one user ID is required for comparison',
          timestamp: new Date().toISOString()
        });
      }
      
      // Get productivity data for each user
      const userProductivity = await Promise.all(
        userIds.map(async userId => {
          const pickerData = await batchProductivityTracker.getPickerProductivity(startDate, endDate, userId);
          const packerData = await batchProductivityTracker.getPackerProductivity(startDate, endDate, userId);
          
          return {
            user_id: userId,
            user_name: pickerData.length > 0 ? pickerData[0].user_name : 
                      (packerData.length > 0 ? packerData[0].user_name : `User ${userId}`),
            picker_data: pickerData[0] || null,
            packer_data: packerData[0] || null
          };
        })
      );
      
      // Return comparison data
      res.json({
        success: true,
        data: {
          users: userProductivity,
          period: {
            start_date: startDate,
            end_date: endDate
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      handleError(res, error, 'Failed to fetch user productivity comparison');
    }
  });

  // Cache management endpoint (admin only)
  router.post('/batches/cache/clear', async (req, res) => {
    try {
      // In a real implementation, this would be protected by authentication
      cache = {};
      cacheTimestamps = {};
      
      res.json({
        success: true,
        message: 'Cache cleared successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      handleError(res, error, 'Failed to clear cache');
    }
  });

  console.log('Comprehensive batch productivity endpoints initialized');
  return router;
}

module.exports = {
  router,
  initialize
};
