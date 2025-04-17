/**
 * Optimized Picklist service with resumable sync functionality
 * Includes performance optimizations:
 * 1. 30-day rolling window for incremental syncs
 * 2. Increased batch size for database operations
 * 3. Optimized database operations with bulk inserts
 * 4. Newest-first processing to prioritize recent data
 * 5. Resumable sync to continue from last position after restarts
 */
const axios = require('axios');
const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');
const picklistsSchema = require('./picklists_schema');
const syncProgressSchema = require('./sync_progress_schema');

class PicklistService {
  constructor(apiKey, baseUrl, sqlConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.sqlConfig = sqlConfig;
    this.batchSize = 100; // Increased from 20 to 100 for better performance
    
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
   * Initialize the database with picklists schema and sync progress tracking
   * @returns {Promise<boolean>} - Success status
   */
  async initializePicklistsDatabase() {
    try {
      console.log('Initializing database with picklists schema...');
      const pool = await sql.connect(this.sqlConfig);
      
      // Create Picklists table
      await pool.request().query(picklistsSchema.createPicklistsTableSQL);
      
      // Create PicklistProducts table
      await pool.request().query(picklistsSchema.createPicklistProductsTableSQL);
      
      // Create PicklistProductLocations table
      await pool.request().query(picklistsSchema.createPicklistProductLocationsTableSQL);
      
      // Create SyncProgress table for resumable sync
      await pool.request().query(syncProgressSchema.createSyncProgressTableSQL);
      console.log('✅ Created SyncProgress table for resumable sync functionality');
      
      // Check if SyncStatus table exists
      const tableResult = await pool.request().query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'SyncStatus'
      `);
      
      const syncTableExists = tableResult.recordset[0].tableExists > 0;
      
      if (syncTableExists) {
        // Check if entity_type column exists in SyncStatus
        const columnResult = await pool.request().query(`
          SELECT 
            COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE 
            TABLE_NAME = 'SyncStatus' AND 
            COLUMN_NAME = 'entity_type'
        `);
        
        const hasEntityTypeColumn = columnResult.recordset.length > 0;
        
        if (hasEntityTypeColumn) {
          // Check if picklists entity already exists in SyncStatus with entity_type
          const entityTypeResult = await pool.request().query(`
            SELECT COUNT(*) AS entityExists 
            FROM SyncStatus 
            WHERE entity_type = 'picklists'
          `);
          
          const entityTypeExists = entityTypeResult.recordset[0].entityExists > 0;
          
          if (entityTypeExists) {
            // Entity with this entity_type already exists, update it instead of inserting
            await pool.request().query(`
              UPDATE SyncStatus 
              SET entity_name = 'picklists', last_sync_date = '2025-01-01T00:00:00.000Z'
              WHERE entity_type = 'picklists'
            `);
            console.log('Updated existing picklists entity in SyncStatus');
          } else {
            // Check if picklists entity exists by name
            const entityNameResult = await pool.request().query(`
              SELECT COUNT(*) AS entityExists 
              FROM SyncStatus 
              WHERE entity_name = 'picklists'
            `);
            
            const entityNameExists = entityNameResult.recordset[0].entityExists > 0;
            
            if (entityNameExists) {
              // Entity with this name exists, update it
              await pool.request().query(`
                UPDATE SyncStatus 
                SET entity_type = 'picklists', last_sync_date = '2025-01-01T00:00:00.000Z'
                WHERE entity_name = 'picklists'
              `);
              console.log('Updated existing picklists entity in SyncStatus');
            } else {
              // No entity exists, insert new one
              await pool.request().query(`
                INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
                VALUES ('picklists', 'picklists', '2025-01-01T00:00:00.000Z');
              `);
              console.log('Inserted new picklists entity in SyncStatus');
            }
          }
        } else {
          // No entity_type column, check by entity_name only
          const entityResult = await pool.request().query(`
            SELECT COUNT(*) AS entityExists 
            FROM SyncStatus 
            WHERE entity_name = 'picklists'
          `);
          
          const entityExists = entityResult.recordset[0].entityExists > 0;
          
          if (entityExists) {
            // Entity exists, update it
            await pool.request().query(`
              UPDATE SyncStatus 
              SET last_sync_date = '2025-01-01T00:00:00.000Z'
              WHERE entity_name = 'picklists'
            `);
            console.log('Updated existing picklists entity in SyncStatus');
          } else {
            // No entity exists, insert new one
            await pool.request().query(`
              INSERT INTO SyncStatus (entity_name, last_sync_date)
              VALUES ('picklists', '2025-01-01T00:00:00.000Z');
            `);
            console.log('Inserted new picklists entity in SyncStatus');
          }
        }
      }
      
      console.log('✅ Picklists database schema initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing picklists database schema:', error.message);
      throw error;
    }
  }

  /**
   * Create a new sync progress record or get existing one
   * @param {string} entityType - Type of entity being synced (e.g., 'picklists')
   * @param {boolean} isFullSync - Whether this is a full sync
   * @returns {Promise<Object>} - Sync progress record
   */
  async createOrGetSyncProgress(entityType, isFullSync = false) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check for any in-progress sync for this entity type
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
        .input('isFullSync', sql.Bit, isFullSync ? 1 : 0)
        .input('now', sql.DateTime, now)
        .query(`
          INSERT INTO SyncProgress (
            entity_type, sync_id, current_offset, batch_number,
            items_processed, status, started_at, last_updated
          )
          VALUES (
            @entityType, @syncId, 0, 0, 
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
        batch_number: 0,
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
      
      if (updates.batch_number !== undefined) {
        updateFields.push('batch_number = @batchNumber');
        request.input('batchNumber', sql.Int, updates.batch_number);
      }
      
      if (updates.total_batches !== undefined) {
        updateFields.push('total_batches = @totalBatches');
        request.input('totalBatches', sql.Int, updates.total_batches);
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
      request.input('lastUpdated', sql.DateTime, new Date());
      
      // Add where clause parameters
      request.input('entityType', sql.NVarChar, progress.entity_type);
      request.input('syncId', sql.NVarChar, progress.sync_id);
      
      // Execute update query
      await request.query(`
        UPDATE SyncProgress
        SET ${updateFields.join(', ')}
        WHERE entity_type = @entityType AND sync_id = @syncId
      `);
      
      return true;
    } catch (error) {
      console.error('Error updating sync progress:', error.message);
      // Continue even if update fails
      return false;
    }
  }

  /**
   * Complete sync progress
   * @param {Object} progress - Sync progress record
   * @param {boolean} success - Whether sync completed successfully
   * @returns {Promise<boolean>} - Success status
   */
  async completeSyncProgress(progress, success = true) {
    try {
      const now = new Date();
      await this.updateSyncProgress(progress, {
        status: success ? 'completed' : 'failed',
        completed_at: now
      });
      
      console.log(`Marked sync ${progress.sync_id} as ${success ? 'completed' : 'failed'}`);
      return true;
    } catch (error) {
      console.error('Error completing sync progress:', error.message);
      return false;
    }
  }

  /**
   * Get all picklists from Picqer with pagination and resumable sync
   * @param {Date} updatedSince - Only get picklists updated since this date
   * @param {Object} syncProgress - Sync progress record for resuming
   * @returns {Promise<Array>} - Array of unique picklists
   */
  async getAllPicklists(updatedSince = null, syncProgress = null) {
    console.log('Fetching all picklists from Picqer...');
    
    let allPicklists = [];
    let offset = 0;
    const limit = 100; // Picqer's default page size
    let hasMorePicklists = true;
    let batchNumber = 0;
    
    // If we have sync progress, resume from last position
    if (syncProgress && syncProgress.current_offset > 0) {
      offset = syncProgress.current_offset;
      batchNumber = syncProgress.batch_number;
      console.log(`Resuming picklists sync from offset ${offset} (batch ${batchNumber})`);
    }
    
    // Track unique picklist IDs to prevent duplicates
    const seenPicklistIds = new Set();
    
    try {
      while (hasMorePicklists) {
        console.log(`Fetching picklists with offset ${offset}...`);
        
        // Build query parameters - use offset and limit
        const params = { offset, limit };
        
        // Add updated_since parameter if provided
        if (updatedSince) {
          const formattedDate = updatedSince.toISOString().replace('T', ' ').substring(0, 19);
          params.updated_since = formattedDate;
        }
        
        // Make API request
        const response = await this.client.get('/picklists', { params });
        
        // Check if we have data
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          // Filter out duplicates before adding to our collection
          const newPicklists = response.data.filter(picklist => {
            if (seenPicklistIds.has(picklist.idpicklist)) {
              return false; // Skip duplicate
            }
            seenPicklistIds.add(picklist.idpicklist);
            return true;
          });
          
          allPicklists = [...allPicklists, ...newPicklists];
          console.log(`Retrieved ${newPicklists.length} new picklists (total unique: ${allPicklists.length})`);
          
          // Check if we have more picklists
          hasMorePicklists = response.data.length === limit;
          
          // Increment offset for next page
          offset += limit;
          
          // Update sync progress if provided
          if (syncProgress) {
            await this.updateSyncProgress(syncProgress, {
              current_offset: offset,
              items_processed: allPicklists.length
            });
          }
          
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          hasMorePicklists = false;
        }
      }
      
      console.log(`✅ Retrieved ${allPicklists.length} unique picklists from Picqer`);
      
      // Sort picklists by updated date in descending order (newest first)
      // This ensures we process the most recent data first
      allPicklists.sort((a, b) => {
        const dateA = a.updated ? new Date(a.updated) : new Date(0);
        const dateB = b.updated ? new Date(b.updated) : new Date(0);
        return dateB - dateA; // Descending order (newest first)
      });
      
      console.log('Sorted picklists with newest first for priority processing');
      
      // Update total items in sync progress if provided
      if (syncProgress) {
        await this.updateSyncProgress(syncProgress, {
          total_items: allPicklists.length
        });
      }
      
      return allPicklists;
    } catch (error) {
      console.error('Error fetching picklists from Picqer:', error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log('Rate limit hit, waiting before retrying...');
        
        // Wait for 20 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getAllPicklists(updatedSince, syncProgress);
      }
      
      throw error;
    }
  }

  /**
   * Get picklists updated since a specific date
   * @param {Date} date - The date to check updates from
   * @param {boolean} useRollingWindow - Whether to use a 30-day rolling window
   * @param {Object} syncProgress - Sync progress record for resuming
   * @returns {Promise<Array>} - Array of updated picklists
   */
  async getPicklistsUpdatedSince(date, useRollingWindow = true, syncProgress = null) {
    // If using rolling window and date is older than 30 days, use 30 days ago instead
    if (useRollingWindow) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      if (date < thirtyDaysAgo) {
        console.log(`Using 30-day rolling window instead of ${date.toISOString()}`);
        console.log(`New date: ${thirtyDaysAgo.toISOString()}`);
        date = thirtyDaysAgo;
      }
    }
    
    return this.getAllPicklists(date, syncProgress);
  }

  /**
   * Get the last sync date for picklists
   * @returns {Promise<Date|null>} - Last sync date or null if not found
   */
  async getLastPicklistsSyncDate() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if entity_type column exists in SyncStatus
      const columnResult = await pool.request().query(`
        SELECT 
          COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE 
          TABLE_NAME = 'SyncStatus' AND 
          COLUMN_NAME = 'entity_type'
      `);
      
      const hasEntityTypeColumn = columnResult.recordset.length > 0;
      
      // Get last sync date for picklists from SyncStatus table
      let result;
      if (hasEntityTypeColumn) {
        result = await pool.request()
          .query(`
            SELECT last_sync_date 
            FROM SyncStatus 
            WHERE entity_type = 'picklists' OR entity_name = 'picklists'
          `);
      } else {
        result = await pool.request()
          .input('entityName', sql.NVarChar, 'picklists')
          .query('SELECT last_sync_date FROM SyncStatus WHERE entity_name = @entityName');
      }
      
      if (result.recordset.length > 0) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      // If no record found, return January 1, 2025 as default start date
      return new Date('2025-01-01T00:00:00.000Z');
    } catch (error) {
      console.error('Error getting last picklists sync date:', error.message);
      // Return January 1, 2025 as fallback
      return new Date('2025-01-01T00:00:00.000Z');
    }
  }

  /**
   * Update the sync status for picklists
   * @param {string} lastSyncDate - ISO string of the last sync date
   * @param {number} totalCount - Total count of picklists in database
   * @param {number} lastSyncCount - Count of picklists in last sync
   * @returns {Promise<boolean>} - Success status
   */
  async updatePicklistsSyncStatus(lastSyncDate, totalCount = null, lastSyncCount = null) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if entity_type column exists in SyncStatus
      const columnResult = await pool.request().query(`
        SELECT 
          COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE 
          TABLE_NAME = 'SyncStatus' AND 
          COLUMN_NAME = 'entity_type'
      `);
      
      const hasEntityTypeColumn = columnResult.recordset.length > 0;
      
      if (hasEntityTypeColumn) {
        // Check if picklists entity exists by entity_type
        const entityTypeResult = await pool.request().query(`
          SELECT COUNT(*) AS entityExists 
          FROM SyncStatus 
          WHERE entity_type = 'picklists'
        `);
        
        const entityTypeExists = entityTypeResult.recordset[0].entityExists > 0;
        
        if (entityTypeExists) {
          // Update existing record by entity_type
          await pool.request()
            .input('lastSyncDate', sql.DateTime, new Date(lastSyncDate))
            .input('totalCount', sql.Int, totalCount)
            .input('lastSyncCount', sql.Int, lastSyncCount)
            .query(`
              UPDATE SyncStatus SET
                entity_name = 'picklists',
                last_sync_date = @lastSyncDate,
                total_count = @totalCount,
                last_sync_count = @lastSyncCount
              WHERE entity_type = 'picklists'
            `);
          return true;
        }
      }
      
      // Check if picklists entity exists by name
      const entityNameResult = await pool.request()
        .input('entityName', sql.NVarChar, 'picklists')
        .query('SELECT COUNT(*) AS entityExists FROM SyncStatus WHERE entity_name = @entityName');
      
      const entityNameExists = entityNameResult.recordset[0].entityExists > 0;
      
      if (entityNameExists) {
        // Update existing record by name
        if (hasEntityTypeColumn) {
          await pool.request()
            .input('entityName', sql.NVarChar, 'picklists')
            .input('entityType', sql.NVarChar, 'picklists')
            .input('lastSyncDate', sql.DateTime, new Date(lastSyncDate))
            .input('totalCount', sql.Int, totalCount)
            .input('lastSyncCount', sql.Int, lastSyncCount)
            .query(`
              UPDATE SyncStatus SET
                entity_type = @entityType,
                last_sync_date = @lastSyncDate,
                total_count = @totalCount,
                last_sync_count = @lastSyncCount
              WHERE entity_name = @entityName
            `);
        } else {
          await pool.request()
            .input('entityName', sql.NVarChar, 'picklists')
            .input('lastSyncDate', sql.DateTime, new Date(lastSyncDate))
            .input('totalCount', sql.Int, totalCount)
            .input('lastSyncCount', sql.Int, lastSyncCount)
            .query(`
              UPDATE SyncStatus SET
                last_sync_date = @lastSyncDate,
                total_count = @totalCount,
                last_sync_count = @lastSyncCount
              WHERE entity_name = @entityName
            `);
        }
      } else {
        // No record exists, insert new one
        if (hasEntityTypeColumn) {
          await pool.request()
            .input('entityName', sql.NVarChar, 'picklists')
            .input('entityType', sql.NVarChar, 'picklists')
            .input('lastSyncDate', sql.DateTime, new Date(lastSyncDate))
            .input('totalCount', sql.Int, totalCount)
            .input('lastSyncCount', sql.Int, lastSyncCount)
            .query(`
              INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date, total_count, last_sync_count)
              VALUES (@entityName, @entityType, @lastSyncDate, @totalCount, @lastSyncCount);
            `);
        } else {
          await pool.request()
            .input('entityName', sql.NVarChar, 'picklists')
            .input('lastSyncDate', sql.DateTime, new Date(lastSyncDate))
            .input('totalCount', sql.Int, totalCount)
            .input('lastSyncCount', sql.Int, lastSyncCount)
            .query(`
              INSERT INTO SyncStatus (entity_name, last_sync_date, total_count, last_sync_count)
              VALUES (@entityName, @lastSyncDate, @totalCount, @lastSyncCount);
            `);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error updating picklists sync status:', error.message);
      // Continue even if update fails
      return false;
    }
  }

  /**
   * Get the count of picklists in the database
   * @returns {Promise<number>} - Picklist count
   */
  async getPicklistCountFromDatabase() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      const result = await pool.request()
        .query('SELECT COUNT(*) AS count FROM Picklists');
      
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting picklist count from database:', error.message);
      return 0;
    }
  }

  /**
   * Optimized method to save picklists to the database using bulk operations
   * with resumable sync support
   * @param {Array} picklists - Array of picklists from Picqer API
   * @param {Object} syncProgress - Sync progress record for resuming
   * @returns {Promise<number>} - Number of picklists saved
   */
  async savePicklistsToDatabase(picklists, syncProgress = null) {
    if (!picklists || picklists.length === 0) {
      console.log('No picklists to save.');
      return 0;
    }
    
    console.log(`Saving ${picklists.length} picklists to database...`);
    let savedCount = 0;
    
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Process picklists in larger batches for better performance
      const batchSize = this.batchSize; // Increased from 20 to 100
      
      // Calculate total batches for progress tracking
      const totalBatches = Math.ceil(picklists.length / batchSize);
      
      // If we have sync progress, update total batches
      if (syncProgress) {
        await this.updateSyncProgress(syncProgress, {
          total_batches: totalBatches
        });
      }
      
      // Start from the batch number in sync progress if available
      let startBatch = 0;
      if (syncProgress && syncProgress.batch_number > 0) {
        startBatch = syncProgress.batch_number;
        // Skip picklists that have already been processed
        savedCount = syncProgress.items_processed || 0;
      }
      
      for (let i = startBatch * batchSize; i < picklists.length; i += batchSize) {
        const batchNumber = Math.floor(i / batchSize);
        const batch = picklists.slice(i, i + batchSize);
        console.log(`Processing batch ${batchNumber + 1} of ${totalBatches}...`);
        
        // Update sync progress with current batch number
        if (syncProgress) {
          await this.updateSyncProgress(syncProgress, {
            batch_number: batchNumber,
            items_processed: savedCount
          });
        }
        
        // Begin transaction for the entire batch
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        
        try {
          // Get all picklist IDs in this batch
          const picklistIds = batch.map(p => p.idpicklist);
          
          // Check which picklists already exist in a single query
          const existingPicklistsQuery = `
            SELECT idpicklist, id 
            FROM Picklists 
            WHERE idpicklist IN (${picklistIds.join(',')})
          `;
          
          const existingPicklistsResult = await new sql.Request(transaction).query(existingPicklistsQuery);
          
          // Create a map of existing picklists for quick lookup
          const existingPicklists = new Map();
          existingPicklistsResult.recordset.forEach(record => {
            existingPicklists.set(record.idpicklist, record.id);
          });
          
          // Prepare arrays for bulk operations
          const picklistsToUpdate = [];
          const picklistsToInsert = [];
          
          // Separate picklists into update and insert arrays
          batch.forEach(picklist => {
            if (existingPicklists.has(picklist.idpicklist)) {
              picklistsToUpdate.push({
                ...picklist,
                id: existingPicklists.get(picklist.idpicklist)
              });
            } else {
              picklistsToInsert.push(picklist);
            }
          });
          
          // Process updates in bulk if any
          if (picklistsToUpdate.length > 0) {
            // Create a batch of update statements
            const updateStatements = picklistsToUpdate.map(picklist => `
              UPDATE Picklists SET
                picklistid = '${picklist.picklistid || ''}',
                idcustomer = ${picklist.idcustomer || 'NULL'},
                idorder = ${picklist.idorder || 'NULL'},
                idreturn = ${picklist.idreturn || 'NULL'},
                idwarehouse = ${picklist.idwarehouse || 'NULL'},
                idtemplate = ${picklist.idtemplate || 'NULL'},
                idpicklist_batch = ${picklist.idpicklist_batch || 'NULL'},
                idshippingprovider_profile = ${picklist.idshippingprovider_profile || 'NULL'},
                deliveryname = ${picklist.deliveryname ? `'${picklist.deliveryname.replace(/'/g, "''")}'` : 'NULL'},
                deliverycontact = ${picklist.deliverycontact ? `'${picklist.deliverycontact.replace(/'/g, "''")}'` : 'NULL'},
                deliveryaddress = ${picklist.deliveryaddress ? `'${picklist.deliveryaddress.replace(/'/g, "''")}'` : 'NULL'},
                deliveryaddress2 = ${picklist.deliveryaddress2 ? `'${picklist.deliveryaddress2.replace(/'/g, "''")}'` : 'NULL'},
                deliveryzipcode = ${picklist.deliveryzipcode ? `'${picklist.deliveryzipcode.replace(/'/g, "''")}'` : 'NULL'},
                deliverycity = ${picklist.deliverycity ? `'${picklist.deliverycity.replace(/'/g, "''")}'` : 'NULL'},
                deliveryregion = ${picklist.deliveryregion ? `'${picklist.deliveryregion.replace(/'/g, "''")}'` : 'NULL'},
                deliverycountry = ${picklist.deliverycountry ? `'${picklist.deliverycountry.replace(/'/g, "''")}'` : 'NULL'},
                telephone = ${picklist.telephone ? `'${picklist.telephone.replace(/'/g, "''")}'` : 'NULL'},
                emailaddress = ${picklist.emailaddress ? `'${picklist.emailaddress.replace(/'/g, "''")}'` : 'NULL'},
                reference = ${picklist.reference ? `'${picklist.reference.replace(/'/g, "''")}'` : 'NULL'},
                assigned_to_iduser = ${picklist.assigned_to_iduser || 'NULL'},
                invoiced = ${picklist.invoiced ? 1 : 0},
                urgent = ${picklist.urgent ? 1 : 0},
                preferred_delivery_date = ${picklist.preferred_delivery_date ? `'${picklist.preferred_delivery_date}'` : 'NULL'},
                status = ${picklist.status ? `'${picklist.status.replace(/'/g, "''")}'` : 'NULL'},
                totalproducts = ${picklist.totalproducts || 0},
                totalpicked = ${picklist.totalpicked || 0},
                weight = ${picklist.weight || 0},
                snoozed_until = ${picklist.snoozed_until ? `'${picklist.snoozed_until}'` : 'NULL'},
                closed_by_iduser = ${picklist.closed_by_iduser || 'NULL'},
                closed_at = ${picklist.closed_at ? `'${picklist.closed_at}'` : 'NULL'},
                created = ${picklist.created ? `'${picklist.created}'` : 'NULL'},
                updated = ${picklist.updated ? `'${picklist.updated}'` : 'NULL'},
                idfulfilment_customer = ${picklist.idfulfilment_customer || 'NULL'},
                last_sync_date = '${new Date().toISOString()}'
              WHERE idpicklist = ${picklist.idpicklist}
            `);
            
            // Execute all updates in a single batch
            if (updateStatements.length > 0) {
              await new sql.Request(transaction).query(updateStatements.join(';'));
              console.log(`Updated ${updateStatements.length} existing picklists`);
            }
          }
          
          // Process inserts in bulk if any
          if (picklistsToInsert.length > 0) {
            // Create a batch of insert statements
            const insertValues = picklistsToInsert.map(picklist => `(
              ${picklist.idpicklist},
              '${picklist.picklistid || ''}',
              ${picklist.idcustomer || 'NULL'},
              ${picklist.idorder || 'NULL'},
              ${picklist.idreturn || 'NULL'},
              ${picklist.idwarehouse || 'NULL'},
              ${picklist.idtemplate || 'NULL'},
              ${picklist.idpicklist_batch || 'NULL'},
              ${picklist.idshippingprovider_profile || 'NULL'},
              ${picklist.deliveryname ? `'${picklist.deliveryname.replace(/'/g, "''")}'` : 'NULL'},
              ${picklist.deliverycontact ? `'${picklist.deliverycontact.replace(/'/g, "''")}'` : 'NULL'},
              ${picklist.deliveryaddress ? `'${picklist.deliveryaddress.replace(/'/g, "''")}'` : 'NULL'},
              ${picklist.deliveryaddress2 ? `'${picklist.deliveryaddress2.replace(/'/g, "''")}'` : 'NULL'},
              ${picklist.deliveryzipcode ? `'${picklist.deliveryzipcode.replace(/'/g, "''")}'` : 'NULL'},
              ${picklist.deliverycity ? `'${picklist.deliverycity.replace(/'/g, "''")}'` : 'NULL'},
              ${picklist.deliveryregion ? `'${picklist.deliveryregion.replace(/'/g, "''")}'` : 'NULL'},
              ${picklist.deliverycountry ? `'${picklist.deliverycountry.replace(/'/g, "''")}'` : 'NULL'},
              ${picklist.telephone ? `'${picklist.telephone.replace(/'/g, "''")}'` : 'NULL'},
              ${picklist.emailaddress ? `'${picklist.emailaddress.replace(/'/g, "''")}'` : 'NULL'},
              ${picklist.reference ? `'${picklist.reference.replace(/'/g, "''")}'` : 'NULL'},
              ${picklist.assigned_to_iduser || 'NULL'},
              ${picklist.invoiced ? 1 : 0},
              ${picklist.urgent ? 1 : 0},
              ${picklist.preferred_delivery_date ? `'${picklist.preferred_delivery_date}'` : 'NULL'},
              ${picklist.status ? `'${picklist.status.replace(/'/g, "''")}'` : 'NULL'},
              ${picklist.totalproducts || 0},
              ${picklist.totalpicked || 0},
              ${picklist.weight || 0},
              ${picklist.snoozed_until ? `'${picklist.snoozed_until}'` : 'NULL'},
              ${picklist.closed_by_iduser || 'NULL'},
              ${picklist.closed_at ? `'${picklist.closed_at}'` : 'NULL'},
              ${picklist.created ? `'${picklist.created}'` : 'NULL'},
              ${picklist.updated ? `'${picklist.updated}'` : 'NULL'},
              ${picklist.idfulfilment_customer || 'NULL'},
              '${new Date().toISOString()}'
            )`);
            
            if (insertValues.length > 0) {
              const insertQuery = `
                INSERT INTO Picklists (
                  idpicklist, picklistid, idcustomer, idorder, idreturn, idwarehouse, idtemplate,
                  idpicklist_batch, idshippingprovider_profile, deliveryname, deliverycontact,
                  deliveryaddress, deliveryaddress2, deliveryzipcode, deliverycity, deliveryregion,
                  deliverycountry, telephone, emailaddress, reference, assigned_to_iduser,
                  invoiced, urgent, preferred_delivery_date, status, totalproducts, totalpicked,
                  weight, snoozed_until, closed_by_iduser, closed_at, created, updated,
                  idfulfilment_customer, last_sync_date
                )
                VALUES ${insertValues.join(',')}
              `;
              
              await new sql.Request(transaction).query(insertQuery);
              console.log(`Inserted ${insertValues.length} new picklists`);
            }
          }
          
          // Get all picklist IDs and their database IDs for products processing
          const allPicklistIdsQuery = `
            SELECT idpicklist, id 
            FROM Picklists 
            WHERE idpicklist IN (${picklistIds.join(',')})
          `;
          
          const allPicklistIdsResult = await new sql.Request(transaction).query(allPicklistIdsQuery);
          
          // Create a map of all picklists for quick lookup
          const allPicklists = new Map();
          allPicklistIdsResult.recordset.forEach(record => {
            allPicklists.set(record.idpicklist, record.id);
          });
          
          // Delete existing picklist products and locations in bulk
          await new sql.Request(transaction).query(`
            DELETE FROM PicklistProductLocations 
            WHERE idpicklist_product IN (
              SELECT pp.idpicklist_product 
              FROM PicklistProducts pp
              JOIN Picklists p ON pp.idpicklist = p.idpicklist
              WHERE p.idpicklist IN (${picklistIds.join(',')})
            )
          `);
          
          await new sql.Request(transaction).query(`
            DELETE FROM PicklistProducts 
            WHERE idpicklist IN (${picklistIds.join(',')})
          `);
          
          // Process all products for all picklists in this batch
          const allProductInserts = [];
          const allProductLocationInserts = [];
          
          // Collect all product inserts
          batch.forEach(picklist => {
            if (picklist.products && Array.isArray(picklist.products)) {
              picklist.products.forEach(product => {
                allProductInserts.push(`(
                  ${product.idpicklist_product || 0},
                  ${picklist.idpicklist},
                  ${product.idproduct || 0},
                  ${product.idorder_product || 'NULL'},
                  ${product.idreturn_product_replacement || 'NULL'},
                  ${product.idvatgroup || 'NULL'},
                  ${product.productcode ? `'${product.productcode.replace(/'/g, "''")}'` : 'NULL'},
                  ${product.name ? `'${product.name.replace(/'/g, "''")}'` : 'NULL'},
                  ${product.remarks ? `'${product.remarks.replace(/'/g, "''")}'` : 'NULL'},
                  ${product.amount || 0},
                  ${product.amount_picked || 0},
                  ${product.price || 0},
                  ${product.weight || 0},
                  ${product.stocklocation ? `'${product.stocklocation.replace(/'/g, "''")}'` : 'NULL'},
                  ${product.partof_idpicklist_product || 'NULL'},
                  ${product.has_parts ? 1 : 0},
                  '${new Date().toISOString()}'
                )`);
                
                // Collect all product location inserts
                if (product.pick_locations && Array.isArray(product.pick_locations)) {
                  product.pick_locations.forEach(location => {
                    allProductLocationInserts.push(`(
                      ${product.idpicklist_product},
                      ${location.idlocation || 0},
                      ${location.name ? `'${location.name.replace(/'/g, "''")}'` : 'NULL'},
                      ${location.amount || 0},
                      '${new Date().toISOString()}'
                    )`);
                  });
                }
              });
            }
          });
          
          // Insert all products in bulk
          if (allProductInserts.length > 0) {
            // Split into smaller chunks to avoid query size limits
            const chunkSize = 500;
            for (let i = 0; i < allProductInserts.length; i += chunkSize) {
              const chunk = allProductInserts.slice(i, i + chunkSize);
              const productInsertQuery = `
                INSERT INTO PicklistProducts (
                  idpicklist_product, idpicklist, idproduct, idorder_product, idreturn_product_replacement,
                  idvatgroup, productcode, name, remarks, amount, amount_picked, price, weight,
                  stocklocation, partof_idpicklist_product, has_parts, last_sync_date
                )
                VALUES ${chunk.join(',')}
              `;
              
              await new sql.Request(transaction).query(productInsertQuery);
            }
            console.log(`Inserted ${allProductInserts.length} picklist products`);
          }
          
          // Insert all product locations in bulk
          if (allProductLocationInserts.length > 0) {
            // Split into smaller chunks to avoid query size limits
            const chunkSize = 500;
            for (let i = 0; i < allProductLocationInserts.length; i += chunkSize) {
              const chunk = allProductLocationInserts.slice(i, i + chunkSize);
              const locationInsertQuery = `
                INSERT INTO PicklistProductLocations (
                  idpicklist_product, idlocation, name, amount, last_sync_date
                )
                VALUES ${chunk.join(',')}
              `;
              
              await new sql.Request(transaction).query(locationInsertQuery);
            }
            console.log(`Inserted ${allProductLocationInserts.length} picklist product locations`);
          }
          
          // Commit transaction
          await transaction.commit();
          savedCount += batch.length;
          
          // Update sync progress with items processed
          if (syncProgress) {
            await this.updateSyncProgress(syncProgress, {
              batch_number: batchNumber + 1,
              items_processed: savedCount
            });
          }
          
          console.log(`Successfully processed batch ${batchNumber + 1} of ${totalBatches} (${savedCount}/${picklists.length} picklists)`);
          
          // Create a checkpoint after each batch
          console.log(`Created checkpoint at batch ${batchNumber + 1}`);
        } catch (transactionError) {
          // Rollback transaction on error
          await transaction.rollback();
          console.error(`Error processing batch:`, transactionError.message);
          
          // Update sync progress with error status but don't mark as failed
          // This allows resuming from the last successful batch
          if (syncProgress) {
            await this.updateSyncProgress(syncProgress, {
              status: 'error_recoverable'
            });
          }
        }
      }
      
      console.log(`✅ Saved ${savedCount} picklists to database`);
      return savedCount;
    } catch (error) {
      console.error('❌ Error saving picklists to database:', error.message);
      
      // Update sync progress with error status
      if (syncProgress) {
        await this.updateSyncProgress(syncProgress, {
          status: 'error_recoverable'
        });
      }
      
      throw error;
    }
  }

  /**
   * Perform a full sync of all picklists with resumable sync support
   * @returns {Promise<Object>} - Sync result
   */
  async performFullPicklistsSync() {
    try {
      console.log('Starting full picklists sync...');
      
      // Create or get sync progress record
      const syncProgress = await this.createOrGetSyncProgress('picklists', true);
      console.log(`Using sync progress record with ID ${syncProgress.sync_id}`);
      
      // Get all picklists from Picqer with resumable sync support
      const picklists = await this.getAllPicklists(null, syncProgress);
      console.log(`Retrieved ${picklists.length} picklists from Picqer`);
      
      // Save picklists to database with resumable sync support
      const savedCount = await this.savePicklistsToDatabase(picklists, syncProgress);
      
      // Update sync status
      const totalCount = await this.getPicklistCountFromDatabase();
      await this.updatePicklistsSyncStatus(new Date().toISOString(), totalCount, savedCount);
      
      // Mark sync progress as completed
      await this.completeSyncProgress(syncProgress, true);
      
      console.log('✅ Full picklists sync completed successfully');
      return {
        success: true,
        message: `Full picklists sync completed successfully. Saved ${savedCount} picklists.`,
        totalCount,
        savedCount
      };
    } catch (error) {
      console.error('❌ Picklists sync failed:', error.message);
      return {
        success: false,
        message: `Picklists sync failed: ${error.message}`
      };
    }
  }

  /**
   * Perform an incremental sync of picklists updated since last sync
   * with resumable sync support
   * @param {boolean} useRollingWindow - Whether to use a 30-day rolling window
   * @returns {Promise<Object>} - Sync result
   */
  async performIncrementalPicklistsSync(useRollingWindow = true) {
    try {
      console.log('Starting incremental picklists sync...');
      
      // Create or get sync progress record
      const syncProgress = await this.createOrGetSyncProgress('picklists', false);
      console.log(`Using sync progress record with ID ${syncProgress.sync_id}`);
      
      // Get last sync date
      const lastSyncDate = await this.getLastPicklistsSyncDate();
      console.log(`Last picklists sync date: ${lastSyncDate.toISOString()}`);
      
      // Get picklists updated since last sync, with optional rolling window and resumable sync
      const picklists = await this.getPicklistsUpdatedSince(lastSyncDate, useRollingWindow, syncProgress);
      console.log(`Retrieved ${picklists.length} updated picklists from Picqer`);
      
      // Save picklists to database with resumable sync support
      const savedCount = await this.savePicklistsToDatabase(picklists, syncProgress);
      
      // Update sync status
      const totalCount = await this.getPicklistCountFromDatabase();
      await this.updatePicklistsSyncStatus(new Date().toISOString(), totalCount, savedCount);
      
      // Mark sync progress as completed
      await this.completeSyncProgress(syncProgress, true);
      
      console.log('✅ Incremental picklists sync completed successfully');
      return {
        success: true,
        message: `Incremental picklists sync completed successfully. Saved ${savedCount} picklists.`,
        totalCount,
        savedCount
      };
    } catch (error) {
      console.error('❌ Picklists sync failed:', error.message);
      return {
        success: false,
        message: `Picklists sync failed: ${error.message}`
      };
    }
  }
  
  /**
   * Get sync progress status
   * @returns {Promise<Object>} - Sync progress status
   */
  async getSyncProgressStatus() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Get the most recent sync progress record
      const result = await pool.request()
        .input('entityType', sql.NVarChar, 'picklists')
        .query(`
          SELECT TOP 1 * FROM SyncProgress 
          WHERE entity_type = @entityType
          ORDER BY started_at DESC
        `);
      
      if (result.recordset.length === 0) {
        return {
          status: 'no_sync',
          message: 'No sync has been performed yet'
        };
      }
      
      const progress = result.recordset[0];
      
      // Calculate percentage complete
      let percentComplete = 0;
      if (progress.total_items && progress.total_items > 0) {
        percentComplete = Math.round((progress.items_processed / progress.total_items) * 100);
      } else if (progress.total_batches && progress.total_batches > 0) {
        percentComplete = Math.round((progress.batch_number / progress.total_batches) * 100);
      }
      
      // Format timestamps
      const startedAt = new Date(progress.started_at).toISOString();
      const lastUpdated = new Date(progress.last_updated).toISOString();
      const completedAt = progress.completed_at ? new Date(progress.completed_at).toISOString() : null;
      
      // Calculate duration
      const endTime = completedAt ? new Date(completedAt) : new Date();
      const startTime = new Date(startedAt);
      const durationMs = endTime - startTime;
      const durationMinutes = Math.round(durationMs / 60000);
      
      return {
        sync_id: progress.sync_id,
        status: progress.status,
        started_at: startedAt,
        last_updated: lastUpdated,
        completed_at: completedAt,
        current_batch: progress.batch_number,
        total_batches: progress.total_batches,
        items_processed: progress.items_processed,
        total_items: progress.total_items,
        percent_complete: percentComplete,
        duration_minutes: durationMinutes,
        message: this.getSyncStatusMessage(progress, percentComplete, durationMinutes)
      };
    } catch (error) {
      console.error('Error getting sync progress status:', error.message);
      return {
        status: 'error',
        message: `Error getting sync status: ${error.message}`
      };
    }
  }
  
  /**
   * Get a human-readable message for sync status
   * @param {Object} progress - Sync progress record
   * @param {number} percentComplete - Percentage complete
   * @param {number} durationMinutes - Duration in minutes
   * @returns {string} - Status message
   */
  getSyncStatusMessage(progress, percentComplete, durationMinutes) {
    switch (progress.status) {
      case 'in_progress':
        return `Sync in progress: ${percentComplete}% complete (${progress.items_processed}/${progress.total_items || '?'} items, running for ${durationMinutes} minutes)`;
      case 'completed':
        return `Sync completed successfully: Processed ${progress.items_processed} items in ${durationMinutes} minutes`;
      case 'failed':
        return `Sync failed after processing ${progress.items_processed} items (${durationMinutes} minutes)`;
      case 'error_recoverable':
        return `Sync encountered errors but can be resumed from batch ${progress.batch_number}`;
      default:
        return `Sync status: ${progress.status}`;
    }
  }
}

module.exports = PicklistService;
