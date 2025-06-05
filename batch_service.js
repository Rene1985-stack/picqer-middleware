/**
 * Complete Batch Service - Strictly following Picqer API documentation
 * Handles synchronization of picklist batches between Picqer and SQL database
 * Captures ALL attributes from the Picqer API documentation
 */
const axios = require('axios');
const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');
const batchesSchema = require('./batches_schema');

class BatchService {
  constructor(apiKey, baseUrl, sqlConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.sqlConfig = sqlConfig;
    
    console.log('Initializing BatchService with:');
    console.log('API Key (first 5 chars):', this.apiKey ? this.apiKey.substring(0, 5) + '...' : 'undefined');
    console.log('Base URL:', this.baseUrl);
    
    // Create Base64 encoded credentials (apiKey + ":")
    const credentials = `${this.apiKey}:`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');
    
    // Create client with Basic Authentication header
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Basic ${encodedCredentials}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PicqerMiddleware (middleware@skapa-global.com)'
      }
    });
    
    // Add request interceptor for debugging
    this.client.interceptors.request.use(request => {
      console.log('Making request to:', request.baseURL + request.url);
      if (request.params) {
        console.log('Request parameters:', JSON.stringify(request.params));
      }
      return request;
    });
    
    // Add response interceptor for debugging
    this.client.interceptors.response.use(
      response => {
        console.log('Response status:', response.status);
        return response;
      },
      error => {
        console.error('Request failed:');
        if (error.response) {
          console.error('Response status:', error.response.status);
        } else if (error.request) {
          console.error('No response received');
        } else {
          console.error('Error message:', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Initialize the database with batches schema
   * Uses a complete schema approach to capture all Picqer API fields
   * @returns {Promise<boolean>} - Success status
   */
  async initializeBatchesDatabase() {
    try {
      console.log('Initializing database with complete batches schema...');
      const pool = await sql.connect(this.sqlConfig);
      
      // Create Batches table with complete schema
      await pool.request().query(batchesSchema.createBatchesTableSQL);
      
      // Create BatchProducts table
      await pool.request().query(batchesSchema.createBatchProductsTableSQL);
      
      // Create BatchPicklists table
      await pool.request().query(batchesSchema.createBatchPicklistsTableSQL);
      
      // Check if SyncStatus table exists
      const tableResult = await pool.request().query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'SyncStatus'
      `);
      
      const syncTableExists = tableResult.recordset[0].tableExists > 0;
      
      if (syncTableExists) {
        // Check if batches record exists
        const recordResult = await pool.request().query(`
          SELECT COUNT(*) AS recordExists 
          FROM SyncStatus 
          WHERE entity_type = 'batches'
        `);
        
        const batchesRecordExists = recordResult.recordset[0].recordExists > 0;
        
        if (batchesRecordExists) {
          // Update existing record
          await pool.request().query(`
            UPDATE SyncStatus 
            SET entity_name = 'batches' 
            WHERE entity_type = 'batches'
          `);
          console.log('Updated existing batches entity in SyncStatus');
        } else {
          // Insert new record
          await pool.request().query(`
            INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
            VALUES ('batches', 'batches', '2025-01-01T00:00:00.000Z')
          `);
          console.log('Added batches record to SyncStatus table');
        }
      } else {
        // Create SyncStatus table
        await pool.request().query(`
          CREATE TABLE SyncStatus (
            id INT IDENTITY(1,1) PRIMARY KEY,
            entity_name NVARCHAR(100) NOT NULL,
            entity_type NVARCHAR(100) NOT NULL,
            last_sync_date DATETIME,
            total_count INT
          );
          
          INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
          VALUES ('batches', 'batches', '2025-01-01T00:00:00.000Z');
        `);
        console.log('Created SyncStatus table and added batches record');
      }
      
      // Create SyncProgress table if it doesn't exist
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SyncProgress')
        BEGIN
          CREATE TABLE SyncProgress (
            id INT IDENTITY(1,1) PRIMARY KEY,
            entity_type NVARCHAR(100) NOT NULL,
            sync_id NVARCHAR(100) NOT NULL,
            current_offset INT DEFAULT 0,
            items_processed INT DEFAULT 0,
            total_items INT,
            status NVARCHAR(50) DEFAULT 'in_progress',
            started_at DATETIME,
            last_updated DATETIME,
            completed_at DATETIME
          );
        END
      `);
      console.log('✅ Created/verified SyncProgress table for resumable sync functionality');
      
      console.log('✅ Complete batches database schema initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing complete batches database schema:', error.message);
      throw error;
    }
  }

  /**
   * Get batch count from database
   * @returns {Promise<number>} - Number of batches in database
   */
  async getBatchCountFromDatabase() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query('SELECT COUNT(*) as count FROM Batches');
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting batch count from database:', error.message);
      return 0;
    }
  }

  /**
   * Get last sync date for batches
   * @returns {Promise<Date|null>} - Last sync date or null if never synced
   */
  async getLastSyncDate() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query(`
        SELECT last_sync_date 
        FROM SyncStatus 
        WHERE entity_type = 'batches'
      `);
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      return null;
    } catch (error) {
      console.error('Error getting last sync date for batches:', error.message);
      return null;
    }
  }

  /**
   * Create or get sync progress record
   * @param {string} entityType - Entity type (e.g., 'batches')
   * @param {boolean} isFullSync - Whether this is a full sync
   * @param {boolean} usesDaysParam - Whether days parameter is being used
   * @returns {Promise<Object>} - Sync progress record
   */
  async createOrGetSyncProgress(entityType = 'batches', isFullSync = false, usesDaysParam = false) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // For full sync or days parameter, always create a new sync progress record
      // This ensures we start from offset 0
      if (isFullSync || usesDaysParam) {
        console.log(`Creating new sync progress for ${entityType} (${isFullSync ? 'full sync' : 'days parameter sync'})`);
        
        // First, mark any in-progress syncs as abandoned
        await pool.request()
          .input('entityType', sql.NVarChar, entityType)
          .query(`
            UPDATE SyncProgress 
            SET status = 'abandoned', last_updated = GETDATE()
            WHERE entity_type = @entityType AND status = 'in_progress'
          `);
        
        // Create a new sync progress record
        const syncId = uuidv4();
        const now = new Date().toISOString();
        
        const result = await pool.request()
          .input('entityType', sql.NVarChar, entityType)
          .input('syncId', sql.NVarChar, syncId)
          .input('now', sql.DateTime, now)
          .query(`
            INSERT INTO SyncProgress (
              entity_type, sync_id, current_offset,
              items_processed, status, started_at, last_updated
            )
            VALUES (
              @entityType, @syncId, 0,
              0, 'in_progress', @now, @now
            );
            
            SELECT * FROM SyncProgress WHERE entity_type = @entityType AND sync_id = @syncId
          `);
        
        console.log(`Created new sync progress record for ${entityType} with ID ${syncId} (starting from offset 0)`);
        return result.recordset[0];
      }
      
      // For regular incremental sync, check for existing in-progress sync
      const inProgressResult = await pool.request()
        .input('entityType', sql.NVarChar, entityType)
        .query(`
          SELECT * FROM SyncProgress 
          WHERE entity_type = @entityType AND status = 'in_progress'
          ORDER BY started_at DESC
        `);
      
      if (inProgressResult.recordset.length > 0) {
        console.log(`Found in-progress sync for ${entityType}, will resume from last position`);
        return inProgressResult.recordset[0];
      }
      
      // No in-progress sync found, create a new one
      const syncId = uuidv4();
      const now = new Date().toISOString();
      
      const result = await pool.request()
        .input('entityType', sql.NVarChar, entityType)
        .input('syncId', sql.NVarChar, syncId)
        .input('now', sql.DateTime, now)
        .query(`
          INSERT INTO SyncProgress (
            entity_type, sync_id, current_offset,
            items_processed, status, started_at, last_updated
          )
          VALUES (
            @entityType, @syncId, 0,
            0, 'in_progress', @now, @now
          );
          
          SELECT * FROM SyncProgress WHERE entity_type = @entityType AND sync_id = @syncId
        `);
      
      console.log(`Created new sync progress record for ${entityType} with ID ${syncId}`);
      return result.recordset[0];
    } catch (error) {
      console.error('Error creating or getting sync progress:', error.message);
      // Return a default progress object if database operation fails
      return {
        entity_type: entityType,
        sync_id: uuidv4(),
        current_offset: 0,
        items_processed: 0,
        status: 'in_progress',
        started_at: new Date().toISOString(),
        last_updated: new Date().toISOString()
      };
    }
  }

  /**
   * Update sync progress
   * @param {Object} progress - Sync progress record
   * @param {Object} updates - Fields to update
   * @returns {Promise<boolean>} - Success status
   */
  async updateSyncProgress(progress, updates) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Build update query dynamically based on provided updates
      let updateFields = [];
      const request = new sql.Request(pool);
      
      // Add each update field to the query
      if (updates.current_offset !== undefined) {
        updateFields.push('current_offset = @currentOffset');
        request.input('currentOffset', sql.Int, updates.current_offset);
      }
      
      if (updates.items_processed !== undefined) {
        updateFields.push('items_processed = @itemsProcessed');
        request.input('itemsProcessed', sql.Int, updates.items_processed);
      }
      
      if (updates.total_items !== undefined) {
        updateFields.push('total_items = @totalItems');
        request.input('totalItems', sql.Int, updates.total_items);
      }
      
      if (updates.status !== undefined) {
        updateFields.push('status = @status');
        request.input('status', sql.NVarChar, updates.status);
      }
      
      if (updates.completed_at !== undefined) {
        updateFields.push('completed_at = @completedAt');
        request.input('completedAt', sql.DateTime, updates.completed_at);
      }
      
      // Always update last_updated timestamp
      updateFields.push('last_updated = @lastUpdated');
      request.input('lastUpdated', sql.DateTime, new Date().toISOString());
      
      // Add parameters for WHERE clause
      request.input('entityType', sql.NVarChar, progress.entity_type);
      request.input('syncId', sql.NVarChar, progress.sync_id);
      
      // Execute update query
      if (updateFields.length > 0) {
        const updateQuery = `
          UPDATE SyncProgress 
          SET ${updateFields.join(', ')} 
          WHERE entity_type = @entityType AND sync_id = @syncId
        `;
        
        await request.query(updateQuery);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error updating sync progress:', error.message);
      return false;
    }
  }

  /**
   * Complete sync progress
   * @param {Object} progress - Sync progress record
   * @param {boolean} success - Whether sync completed successfully
   * @returns {Promise<boolean>} - Success status
   */
  async completeSyncProgress(progress, success) {
    try {
      return await this.updateSyncProgress(progress, {
        status: success ? 'completed' : 'failed',
        completed_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error completing sync progress:', error.message);
      return false;
    }
  }

  /**
   * Get all batches from Picqer API with pagination
   * @param {Date|null} updatedSince - Only get batches updated since this date
   * @param {Object|null} syncProgress - Sync progress record for resumable sync
   * @param {Date|null} cutoffDate - Optional cutoff date for days parameter optimization
   * @returns {Promise<Array>} - Array of batches
   */
  async getAllBatches(updatedSince = null, syncProgress = null, cutoffDate = null) {
    try {
      const limit = 100; // Number of batches per page
      let offset = syncProgress ? syncProgress.current_offset : 0;
      let hasMoreBatches = true;
      let allBatches = [];
      let foundOlderBatch = false;
      
      // Format date for API request if provided
      let updatedSinceParam = null;
      if (updatedSince) {
        updatedSinceParam = updatedSince.toISOString().replace('T', ' ').substring(0, 19);
        console.log(`Fetching batches updated since: ${updatedSinceParam}`);
      } else {
        console.log('Fetching batches from Picqer...');
      }
      
      if (cutoffDate) {
        console.log(`Using cutoff date for optimization: ${cutoffDate.toISOString()}`);
      }
      
      // Continue fetching until we have all batches or find batches older than cutoff date
      while (hasMoreBatches && !foundOlderBatch) {
        console.log(`Fetching batches with offset ${offset}...`);
        
        // Update sync progress if provided
        if (syncProgress) {
          await this.updateSyncProgress(syncProgress, {
            current_offset: offset
          });
        }
        
        // Build request parameters
        const params = { 
          offset,
          limit
        };
        
        // Add updated_since parameter if provided
        if (updatedSinceParam) {
          params.updated_since = updatedSinceParam;
        }
        
        const response = await this.client.get('/picklists/batches', { params });
        
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          // Filter out duplicates by idpicklist_batch
          const existingIds = new Set(allBatches.map(b => b.idpicklist_batch));
          const newBatches = response.data.filter(batch => {
            return !existingIds.has(batch.idpicklist_batch);
          });
          
          // Check if any batches are older than cutoff date
          if (cutoffDate) {
            // Sort batches by updated_at in descending order (newest first)
            newBatches.sort((a, b) => {
              const dateA = a.updated_at ? new Date(a.updated_at) : new Date(0);
              const dateB = b.updated_at ? new Date(b.updated_at) : new Date(0);
              return dateB - dateA;
            });
            
            // Check if the oldest batch in this page is older than cutoff date
            const oldestBatchInPage = newBatches[newBatches.length - 1];
            if (oldestBatchInPage && oldestBatchInPage.updated_at) {
              const oldestDate = new Date(oldestBatchInPage.updated_at);
              if (oldestDate < cutoffDate) {
                console.log(`Found batch older than cutoff date (${oldestDate.toISOString()}), stopping pagination`);
                
                // Filter out batches older than cutoff date
                const recentBatches = newBatches.filter(batch => {
                  if (!batch.updated_at) return false;
                  const batchDate = new Date(batch.updated_at);
                  return batchDate >= cutoffDate;
                });
                
                // Add only recent batches to our collection
                allBatches = [...allBatches, ...recentBatches];
                console.log(`Added ${recentBatches.length} recent batches (filtered out ${newBatches.length - recentBatches.length} older batches)`);
                
                // Stop pagination
                foundOlderBatch = true;
                hasMoreBatches = false;
                break;
              }
            }
          }
          
          // Add all batches if no cutoff date or all batches are newer than cutoff
          allBatches = [...allBatches, ...newBatches];
          console.log(`Retrieved ${newBatches.length} new batches (total unique: ${allBatches.length})`);
          
          // Check if we have more batches
          hasMoreBatches = response.data.length === limit;
          
          // Increment offset for next page
          offset += limit;
          
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          hasMoreBatches = false;
        }
      }
      
      console.log(`✅ Retrieved ${allBatches.length} unique batches from Picqer`);
      
      // Update sync progress with total items if provided
      if (syncProgress) {
        await this.updateSyncProgress(syncProgress, {
          total_items: allBatches.length
        });
      }
      
      return allBatches;
    } catch (error) {
      console.error('Error fetching batches from Picqer:', error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log('Rate limit hit, waiting before retrying...');
        
        // Wait for 20 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getAllBatches(updatedSince, syncProgress, cutoffDate);
      }
      
      throw error;
    }
  }

  /**
   * Get batches updated in the last N days
   * Uses optimized fetching to stop pagination when older batches are encountered
   * @param {number} days - Number of days to look back
   * @param {Object|null} syncProgress - Sync progress record for resumable sync
   * @returns {Promise<Array>} - Array of batches updated in the last N days
   */
  async getBatchesUpdatedInLastDays(days, syncProgress = null) {
    try {
      // Calculate date for days parameter
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);
      daysAgo.setHours(0, 0, 0, 0); // Set to beginning of the day for consistent comparison
      
      console.log(`Using custom date range: syncing batches updated since ${daysAgo.toISOString()}`);
      
      // Get batches with cutoff date optimization
      const batches = await this.getAllBatches(null, syncProgress, daysAgo);
      
      // Double-check all batches are within the date range (defensive programming)
      const filteredBatches = batches.filter(batch => {
        if (!batch.updated_at) return false;
        
        const batchUpdatedAt = new Date(batch.updated_at);
        return batchUpdatedAt >= daysAgo;
      });
      
      if (filteredBatches.length !== batches.length) {
        console.log(`Filtered out ${batches.length - filteredBatches.length} batches outside the date range`);
      }
      
      console.log(`Found ${filteredBatches.length} batches updated in the last ${days} days`);
      
      return filteredBatches;
    } catch (error) {
      console.error(`Error getting batches updated in last ${days} days:`, error.message);
      throw error;
    }
  }

  /**
   * Get batches updated since a specific date
   * For incremental syncs, use a 30-day rolling window
   * @param {Date} date - The date to check updates from
   * @param {Object|null} syncProgress - Sync progress record for resumable sync
   * @returns {Promise<Array>} - Array of updated batches
   */
  async getBatchesUpdatedSince(date, syncProgress = null) {
    try {
      // For incremental syncs, use a 30-day rolling window
      // This ensures we don't miss any updates due to timezone differences
      const thirtyDaysAgo = new Date(date.getTime() - (30 * 24 * 60 * 60 * 1000));
      
      console.log(`Using 30-day rolling window for incremental sync: ${thirtyDaysAgo.toISOString()}`);
      return this.getAllBatches(thirtyDaysAgo, syncProgress);
    } catch (error) {
      console.error('Error getting batches updated since date:', error.message);
      throw error;
    }
  }

  /**
   * Get a single batch with details from Picqer API
   * @param {number} idpicklist_batch - Batch ID
   * @returns {Promise<Object>} - Batch details
   */
  async getBatchDetails(idpicklist_batch) {
    try {
      console.log(`Fetching details for batch ${idpicklist_batch}...`);
      
      const response = await this.client.get(`/picklists/batches/${idpicklist_batch}`);
      
      if (response.data) {
        console.log(`Retrieved details for batch ${idpicklist_batch}`);
        return response.data;
      }
      
      return null;
    } catch (error) {
      console.error(`Error fetching details for batch ${idpicklist_batch}:`, error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log('Rate limit hit, waiting before retrying...');
        
        // Wait for 20 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getBatchDetails(idpicklist_batch);
      }
      
      // Return null on error to continue with other batches
      return null;
    }
  }

  /**
   * Save batches to database
   * @param {Array} batches - Array of batches to save
   * @param {Object|null} syncProgress - Sync progress record for resumable sync
   * @returns {Promise<number>} - Number of batches saved
   */
  async saveBatchesToDatabase(batches, syncProgress = null) {
    try {
      console.log(`Saving ${batches.length} batches to database...`);
      
      // Connect to database
      const pool = await sql.connect(this.sqlConfig);
      
      // Process batches in chunks to avoid overwhelming the database
      const chunkSize = 10;
      const chunks = [];
      
      for (let i = 0; i < batches.length; i += chunkSize) {
        chunks.push(batches.slice(i, i + chunkSize));
      }
      
      console.log(`Processing batches in ${chunks.length} chunks of ${chunkSize}...`);
      
      let savedCount = 0;
      let failedCount = 0;
      
      // Process each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`Processing chunk ${i + 1} of ${chunks.length} (${chunk.length} batches)...`);
        
        // Process each batch in the chunk
        for (const batch of chunk) {
          try {
            // Get batch details from Picqer API
            const batchDetails = await this.getBatchDetails(batch.idpicklist_batch);
            
            if (!batchDetails) {
              console.warn(`Skipping batch ${batch.idpicklist_batch} - could not retrieve details`);
              failedCount++;
              continue;
            }
            
            try {
              // Save batch to database
              const saved = await this.saveBatchToDatabase(batchDetails);
              
              if (saved) {
                savedCount++;
              } else {
                failedCount++;
              }
            } catch (error) {
              console.error(`Error saving batch ${batch.idpicklist_batch}:`, error.message);
              failedCount++;
            }
          } catch (error) {
            console.error(`Error processing batch ${batch.idpicklist_batch}:`, error.message);
            failedCount++;
          }
          
          // Add a small delay between batches to avoid overwhelming the database
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Update sync progress after each chunk if provided
        if (syncProgress) {
          await this.updateSyncProgress(syncProgress, {
            items_processed: savedCount + failedCount
          });
        }
      }
      
      console.log(`✅ Saved ${savedCount} out of ${batches.length} batches to database (${failedCount} failed)`);
      
      // Update SyncStatus table with last sync date
      await pool.request()
        .input('lastSyncDate', sql.DateTime, new Date().toISOString())
        .query(`
          UPDATE SyncStatus 
          SET last_sync_date = @lastSyncDate 
          WHERE entity_type = 'batches'
        `);
      
      return savedCount;
    } catch (error) {
      console.error('Error saving batches to database:', error.message);
      throw error;
    }
  }

  /**
   * Save a single batch to database
   * @param {Object} batchDetails - Batch details from Picqer API
   * @returns {Promise<boolean>} - Success status
   */
  async saveBatchToDatabase(batchDetails) {
    try {
      console.log(`Saving batch ${batchDetails.idpicklist_batch} to database...`);
      
      // Connect to database
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if batch already exists
      const checkResult = await pool.request()
        .input('idpicklist_batch', sql.Int, batchDetails.idpicklist_batch)
        .query('SELECT idbatch FROM Batches WHERE idpicklist_batch = @idpicklist_batch');
      
      const batchExists = checkResult.recordset.length > 0;
      
      // Get picklist_batchid with fallbacks for different field names
      let picklist_batchid = batchDetails.picklist_batchid || 
                            batchDetails.picklistbatchid || 
                            batchDetails.picklist_batch_id ||
                            batchDetails.picklistBatchId ||
                            `BATCH-${batchDetails.idpicklist_batch}`;
      
      // Ensure picklist_batchid is a valid string
      picklist_batchid = String(picklist_batchid).trim();
      
      // Sanitize string fields
      const status = batchDetails.status ? String(batchDetails.status).trim() : null;
      const type = batchDetails.type ? String(batchDetails.type).trim() : null;
      
      // Handle assigned_to and completed_by as JSON strings (they are arrays in the API)
      let assigned_to = null;
      if (batchDetails.assigned_to) {
        assigned_to = JSON.stringify(batchDetails.assigned_to);
      }
      
      let completed_by = null;
      if (batchDetails.completed_by) {
        completed_by = JSON.stringify(batchDetails.completed_by);
      }
      
      // Parse dates
      let created_at = null;
      if (batchDetails.created_at) {
        created_at = new Date(batchDetails.created_at);
      }
      
      let updated_at = null;
      if (batchDetails.updated_at) {
        updated_at = new Date(batchDetails.updated_at);
      }
      
      let completed_at = null;
      if (batchDetails.completed_at) {
        completed_at = new Date(batchDetails.completed_at);
      }
      
      // Sanitize numeric fields
      const iduser = batchDetails.iduser || null;
      const idwarehouse = batchDetails.idwarehouse || null;
      const idfulfilment_customer = batchDetails.idfulfilment_customer || null;
      const comment_count = batchDetails.comment_count || 0;
      const total_products = batchDetails.total_products || 0;
      const total_picklists = batchDetails.total_picklists || 0;
      
      // Current timestamp for last_sync_date
      const last_sync_date = new Date();
      
      // Handle products and picklists separately
      const products = batchDetails.products || [];
      const picklists = batchDetails.picklists || [];
      
      if (batchExists) {
        // Update existing batch
        await pool.request()
          .input('idpicklist_batch', sql.Int, batchDetails.idpicklist_batch)
          .input('picklist_batchid', sql.NVarChar, picklist_batchid)
          .input('type', sql.NVarChar, type)
          .input('status', sql.NVarChar, status)
          .input('assigned_to', sql.NVarChar, assigned_to)
          .input('completed_by', sql.NVarChar, completed_by)
          .input('total_products', sql.Int, total_products)
          .input('total_picklists', sql.Int, total_picklists)
          .input('completed_at', sql.DateTime, completed_at)
          .input('created_at', sql.DateTime, created_at)
          .input('updated_at', sql.DateTime, updated_at)
          .input('iduser', sql.Int, iduser)
          .input('idwarehouse', sql.Int, idwarehouse)
          .input('idfulfilment_customer', sql.Int, idfulfilment_customer)
          .input('comment_count', sql.Int, comment_count)
          .input('last_sync_date', sql.DateTime, last_sync_date)
          .query(`
            UPDATE Batches 
            SET 
              picklist_batchid = @picklist_batchid,
              type = @type,
              status = @status,
              assigned_to = @assigned_to,
              completed_by = @completed_by,
              total_products = @total_products,
              total_picklists = @total_picklists,
              completed_at = @completed_at,
              created_at = @created_at,
              updated_at = @updated_at,
              iduser = @iduser,
              idwarehouse = @idwarehouse,
              idfulfilment_customer = @idfulfilment_customer,
              comment_count = @comment_count,
              last_sync_date = @last_sync_date
            WHERE idpicklist_batch = @idpicklist_batch
          `);
        
        console.log(`Updated existing batch ${batchDetails.idpicklist_batch}`);
      } else {
        // Insert new batch - let the database generate the idbatch value
        await pool.request()
          .input('idpicklist_batch', sql.Int, batchDetails.idpicklist_batch)
          .input('picklist_batchid', sql.NVarChar, picklist_batchid)
          .input('type', sql.NVarChar, type)
          .input('status', sql.NVarChar, status)
          .input('assigned_to', sql.NVarChar, assigned_to)
          .input('completed_by', sql.NVarChar, completed_by)
          .input('total_products', sql.Int, total_products)
          .input('total_picklists', sql.Int, total_picklists)
          .input('completed_at', sql.DateTime, completed_at)
          .input('created_at', sql.DateTime, created_at)
          .input('updated_at', sql.DateTime, updated_at)
          .input('iduser', sql.Int, iduser)
          .input('idwarehouse', sql.Int, idwarehouse)
          .input('idfulfilment_customer', sql.Int, idfulfilment_customer)
          .input('comment_count', sql.Int, comment_count)
          .input('last_sync_date', sql.DateTime, last_sync_date)
          .query(`
            INSERT INTO Batches (
              idpicklist_batch, picklist_batchid, type, status, 
              assigned_to, completed_by, total_products, total_picklists,
              completed_at, created_at, updated_at, iduser, idwarehouse, 
              idfulfilment_customer, comment_count, last_sync_date
            )
            VALUES (
              @idpicklist_batch, @picklist_batchid, @type, @status,
              @assigned_to, @completed_by, @total_products, @total_picklists,
              @completed_at, @created_at, @updated_at, @iduser, @idwarehouse,
              @idfulfilment_customer, @comment_count, @last_sync_date
            )
          `);
        
        console.log(`Inserted new batch ${batchDetails.idpicklist_batch}`);
      }
      
      // Save batch products if available
      if (products.length > 0) {
        await this.saveBatchProductsToDatabase(batchDetails.idpicklist_batch, products);
      }
      
      // Save batch picklists if available
      if (picklists.length > 0) {
        await this.saveBatchPicklistsToDatabase(batchDetails.idpicklist_batch, picklists);
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving batch ${batchDetails.idpicklist_batch} to database:`, error.message);
      return false;
    }
  }

  /**
   * Save batch products to database
   * @param {number} idpicklist_batch - Batch ID
   * @param {Array} products - Array of products in the batch
   * @returns {Promise<boolean>} - Success status
   */
  async saveBatchProductsToDatabase(idpicklist_batch, products) {
    try {
      console.log(`Saving ${products.length} products for batch ${idpicklist_batch}...`);
      
      // Connect to database
      const pool = await sql.connect(this.sqlConfig);
      
      // Delete existing batch products
      await pool.request()
        .input('idpicklist_batch', sql.Int, idpicklist_batch)
        .query(`
          DELETE FROM BatchProducts 
          WHERE idpicklist_batch = @idpicklist_batch
        `);
      
      // Insert new batch products
      for (const product of products) {
        // Sanitize string fields
        const name = product.name ? String(product.name).trim() : null;
        const productcode = product.productcode ? String(product.productcode).trim() : null;
        const productcode_supplier = product.productcode_supplier ? String(product.productcode_supplier).trim() : null;
        const stock_location = product.stock_location ? String(product.stock_location).trim() : null;
        const image = product.image ? String(product.image).trim() : null;
        
        // Sanitize numeric fields
        const idproduct = product.idproduct || null;
        const amount = product.amount || 0;
        const amount_picked = product.amount_picked || 0;
        const amount_collected = product.amount_collected || 0;
        
        // Convert barcodes to string
        const barcodes = product.barcodes ? JSON.stringify(product.barcodes) : '[]';
        
        await pool.request()
          .input('idpicklist_batch', sql.Int, idpicklist_batch)
          .input('idproduct', sql.Int, idproduct)
          .input('name', sql.NVarChar, name)
          .input('productcode', sql.NVarChar, productcode)
          .input('productcode_supplier', sql.NVarChar, productcode_supplier)
          .input('stock_location', sql.NVarChar, stock_location)
          .input('image', sql.NVarChar, image)
          .input('barcodes', sql.NVarChar, barcodes)
          .input('amount', sql.Int, amount)
          .input('amount_picked', sql.Int, amount_picked)
          .input('amount_collected', sql.Int, amount_collected)
          .input('last_sync_date', sql.DateTime, new Date())
          .query(`
            INSERT INTO BatchProducts (
              idpicklist_batch, idproduct, name, productcode, productcode_supplier,
              stock_location, image, barcodes, amount, amount_picked, amount_collected,
              last_sync_date
            )
            VALUES (
              @idpicklist_batch, @idproduct, @name, @productcode, @productcode_supplier,
              @stock_location, @image, @barcodes, @amount, @amount_picked, @amount_collected,
              @last_sync_date
            )
          `);
      }
      
      console.log(`✅ Saved ${products.length} products for batch ${idpicklist_batch}`);
      return true;
    } catch (error) {
      console.error(`Error saving products for batch ${idpicklist_batch}:`, error.message);
      return false;
    }
  }

  /**
   * Save batch picklists to database
   * @param {number} idpicklist_batch - Batch ID
   * @param {Array} picklists - Array of picklists in the batch
   * @returns {Promise<boolean>} - Success status
   */
  async saveBatchPicklistsToDatabase(idpicklist_batch, picklists) {
    try {
      console.log(`Saving ${picklists.length} picklists for batch ${idpicklist_batch}...`);
      
      // Connect to database
      const pool = await sql.connect(this.sqlConfig);
      
      // Delete existing batch picklists
      await pool.request()
        .input('idpicklist_batch', sql.Int, idpicklist_batch)
        .query(`
          DELETE FROM BatchPicklists 
          WHERE idpicklist_batch = @idpicklist_batch
        `);
      
      // Insert new batch picklists
      for (const picklist of picklists) {
        // Sanitize string fields
        const picklistid = picklist.picklistid ? String(picklist.picklistid).trim() : null;
        const reference = picklist.reference ? String(picklist.reference).trim() : null;
        const status = picklist.status ? String(picklist.status).trim() : null;
        const alias = picklist.alias ? String(picklist.alias).trim() : null;
        const picking_container = picklist.picking_container ? String(picklist.picking_container).trim() : null;
        const delivery_name = picklist.delivery_name ? String(picklist.delivery_name).trim() : null;
        const customer_remarks = picklist.customer_remarks ? String(picklist.customer_remarks).trim() : null;
        
        // Sanitize numeric fields
        const idpicklist = picklist.idpicklist || null;
        const total_products = picklist.total_products || 0;
        
        // Sanitize boolean fields
        const has_notes = picklist.has_notes ? 1 : 0;
        const has_customer_remarks = picklist.has_customer_remarks ? 1 : 0;
        
        // Parse dates
        let created_at = null;
        if (picklist.created_at) {
          created_at = new Date(picklist.created_at);
        }
        
        await pool.request()
          .input('idpicklist_batch', sql.Int, idpicklist_batch)
          .input('idpicklist', sql.Int, idpicklist)
          .input('picklistid', sql.NVarChar, picklistid)
          .input('reference', sql.NVarChar, reference)
          .input('status', sql.NVarChar, status)
          .input('alias', sql.NVarChar, alias)
          .input('picking_container', sql.NVarChar, picking_container)
          .input('total_products', sql.Int, total_products)
          .input('delivery_name', sql.NVarChar, delivery_name)
          .input('has_notes', sql.Bit, has_notes)
          .input('has_customer_remarks', sql.Bit, has_customer_remarks)
          .input('customer_remarks', sql.NVarChar, customer_remarks)
          .input('created_at', sql.DateTime, created_at)
          .input('last_sync_date', sql.DateTime, new Date())
          .query(`
            INSERT INTO BatchPicklists (
              idpicklist_batch, idpicklist, picklistid, reference, status,
              alias, picking_container, total_products, delivery_name,
              has_notes, has_customer_remarks, customer_remarks, created_at,
              last_sync_date
            )
            VALUES (
              @idpicklist_batch, @idpicklist, @picklistid, @reference, @status,
              @alias, @picking_container, @total_products, @delivery_name,
              @has_notes, @has_customer_remarks, @customer_remarks, @created_at,
              @last_sync_date
            )
          `);
      }
      
      console.log(`✅ Saved ${picklists.length} picklists for batch ${idpicklist_batch}`);
      return true;
    } catch (error) {
      console.error(`Error saving picklists for batch ${idpicklist_batch}:`, error.message);
      return false;
    }
  }

  /**
   * Sync batches from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @param {number|null} days - Optional number of days to limit sync to
   * @returns {Promise<Object>} - Sync results
   */
  async syncBatches(fullSync = false, days = null) {
    try {
      console.log(`Starting ${fullSync ? 'full' : 'incremental'} batch sync${days ? ` for last ${days} days` : ''}...`);
      
      // Create or get sync progress record
      // Pass usesDaysParam=true when days parameter is provided
      // This ensures we always start from offset 0 for days parameter syncs
      const syncProgress = await this.createOrGetSyncProgress('batches', fullSync, days !== null);
      
      let batches = [];
      
      if (days) {
        // Days parameter: Get batches updated in the last N days
        console.log(`Using days parameter: ${days}`);
        batches = await this.getBatchesUpdatedInLastDays(parseInt(days), syncProgress);
      } else if (fullSync) {
        // Full sync: Get all batches
        batches = await this.getAllBatches(null, syncProgress);
      } else {
        // Incremental sync: Get batches updated since last sync
        const lastSyncDate = await this.getLastSyncDate();
        
        if (lastSyncDate) {
          console.log(`Last sync date: ${lastSyncDate.toISOString()}`);
          batches = await this.getBatchesUpdatedSince(lastSyncDate, syncProgress);
        } else {
          console.log('No last sync date found, performing full sync');
          batches = await this.getAllBatches(null, syncProgress);
        }
      }
      
      console.log(`Retrieved ${batches.length} batches from Picqer`);
      
      // Save batches to database
      const savedCount = await this.saveBatchesToDatabase(batches, syncProgress);
      
      // Complete sync progress
      await this.completeSyncProgress(syncProgress, true);
      
      console.log(`✅ Batch sync completed: ${savedCount} batches saved`);
      
      return {
        success: true,
        totalBatches: batches.length,
        savedBatches: savedCount
      };
    } catch (error) {
      console.error('❌ Error in batch sync:', error.message);
      
      // Update sync progress with failure status
      if (syncProgress) {
        await this.completeSyncProgress(syncProgress, false);
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = BatchService;
