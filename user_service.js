/**
 * Optimized User service with performance enhancements
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
const usersSchema = require('./users_schema');
const syncProgressSchema = require('./sync_progress_schema');

class UserService {
  constructor(apiKey, baseUrl, sqlConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.sqlConfig = sqlConfig;
    this.batchSize = 100; // Use larger batch size for better performance
    
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
   * Initialize the database with users schema and sync progress tracking
   * @returns {Promise<boolean>} - Success status
   */
  async initializeUsersDatabase() {
    try {
      console.log('Initializing database with users schema...');
      const pool = await sql.connect(this.sqlConfig);
      
      // Create Users table
      await pool.request().query(usersSchema.createUsersTableSQL);
      
      // Create UserRights table
      await pool.request().query(usersSchema.createUserRightsTableSQL);
      
      // Create SyncProgress table for resumable sync if it doesn't exist
      await pool.request().query(syncProgressSchema.createSyncProgressTableSQL);
      console.log('✅ Created/verified SyncProgress table for resumable sync functionality');
      
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
          SELECT COUNT(*) AS columnExists 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'SyncStatus' AND COLUMN_NAME = 'entity_type'
        `);
        
        const entityTypeColumnExists = columnResult.recordset[0].columnExists > 0;
        
        if (entityTypeColumnExists) {
          // Check if users record exists
          const recordResult = await pool.request().query(`
            SELECT COUNT(*) AS recordExists 
            FROM SyncStatus 
            WHERE entity_type = 'users'
          `);
          
          const usersRecordExists = recordResult.recordset[0].recordExists > 0;
          
          if (usersRecordExists) {
            // Update existing record
            await pool.request().query(`
              UPDATE SyncStatus 
              SET entity_name = 'users' 
              WHERE entity_type = 'users'
            `);
            console.log('Updated existing users entity in SyncStatus');
          } else {
            // Insert new record
            await pool.request().query(`
              INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
              VALUES ('users', 'users', '2025-01-01T00:00:00.000Z')
            `);
            console.log('Added users record to SyncStatus table');
          }
        } else {
          console.warn('entity_type column does not exist in SyncStatus table');
        }
      } else {
        console.warn('SyncStatus table does not exist');
      }
      
      console.log('✅ Users database schema initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing users database schema:', error.message);
      throw error;
    }
  }

  /**
   * Create or get sync progress record
   * @param {string} entityType - Entity type (e.g., 'users')
   * @param {boolean} isFullSync - Whether this is a full sync
   * @returns {Promise<Object>} - Sync progress record
   */
  async createOrGetSyncProgress(entityType = 'users', isFullSync = false) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check for existing in-progress sync
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
   * Get all users from Picqer API with pagination
   * @param {Date|null} updatedSince - Only get users updated since this date
   * @param {Object|null} syncProgress - Sync progress record for resumable sync
   * @returns {Promise<Array>} - Array of users
   */
  async getAllUsers(updatedSince = null, syncProgress = null) {
    try {
      const limit = 100; // Number of users per page
      let offset = syncProgress ? syncProgress.current_offset : 0;
      let hasMoreUsers = true;
      let allUsers = [];
      
      // Format date for API request if provided
      let updatedSinceParam = null;
      if (updatedSince) {
        updatedSinceParam = updatedSince.toISOString();
        console.log(`Fetching users updated since: ${updatedSinceParam}`);
      } else {
        console.log('Fetching all users from Picqer...');
      }
      
      // Continue fetching until we have all users
      while (hasMoreUsers) {
        console.log(`Fetching users with offset ${offset}...`);
        
        // Update sync progress if provided
        if (syncProgress) {
          await this.updateSyncProgress(syncProgress, {
            current_offset: offset
          });
        }
        
        // Build request parameters
        const params = { 
          offset,
          limit,
          active: true // Only get active users by default
        };
        
        // Add updated_since parameter if provided
        if (updatedSinceParam) {
          params.updated_since = updatedSinceParam;
        }
        
        const response = await this.client.get('/users', { params });
        
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          // Filter out duplicates by iduser
          const existingIds = new Set(allUsers.map(u => u.iduser));
          const newUsers = response.data.filter(user => {
            return !existingIds.has(user.iduser);
          });
          
          allUsers = [...allUsers, ...newUsers];
          console.log(`Retrieved ${newUsers.length} new users (total unique: ${allUsers.length})`);
          
          // Check if we have more users
          hasMoreUsers = response.data.length === limit;
          
          // Increment offset for next page
          offset += limit;
          
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          hasMoreUsers = false;
        }
      }
      
      // Sort users by last_login_at in descending order (newest first)
      allUsers.sort((a, b) => {
        const dateA = a.last_login_at ? new Date(a.last_login_at) : new Date(0);
        const dateB = b.last_login_at ? new Date(b.last_login_at) : new Date(0);
        return dateB - dateA; // Descending order (newest first)
      });
      
      console.log('Sorted users with most recently active first for priority processing');
      console.log(`✅ Retrieved ${allUsers.length} unique users from Picqer`);
      
      // Update sync progress with total items if provided
      if (syncProgress) {
        await this.updateSyncProgress(syncProgress, {
          total_items: allUsers.length
        });
      }
      
      return allUsers;
    } catch (error) {
      console.error('Error fetching users from Picqer:', error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log('Rate limit hit, waiting before retrying...');
        
        // Wait for 20 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getAllUsers(updatedSince, syncProgress);
      }
      
      throw error;
    }
  }

  /**
   * Get user details including rights
   * @param {number} iduser - User ID
   * @returns {Promise<Object>} - User details with rights
   */
  async getUserDetails(iduser) {
    try {
      console.log(`Fetching details for user ${iduser}...`);
      
      const response = await this.client.get(`/users/${iduser}`);
      
      if (response.data) {
        console.log(`Retrieved details for user ${iduser}`);
        return response.data;
      }
      
      return null;
    } catch (error) {
      console.error(`Error fetching details for user ${iduser}:`, error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log('Rate limit hit, waiting before retrying...');
        
        // Wait for 20 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getUserDetails(iduser);
      }
      
      // Return null on error to continue with other users
      return null;
    }
  }

  /**
   * Get users updated since a specific date
   * For incremental syncs, use a 30-day rolling window
   * @param {Date} date - The date to check updates from
   * @returns {Promise<Array>} - Array of updated users
   */
  async getUsersUpdatedSince(date) {
    // For incremental syncs, use a 30-day rolling window
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Use the more recent date between the provided date and 30 days ago
    const effectiveDate = date > thirtyDaysAgo ? date : thirtyDaysAgo;
    
    console.log(`Using 30-day rolling window for incremental sync. Effective date: ${effectiveDate.toISOString()}`);
    return this.getAllUsers(effectiveDate);
  }

  /**
   * Get the last sync date for users
   * @returns {Promise<Date|null>} - Last sync date or null if not found
   */
  async getLastUsersSyncDate() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if SyncStatus table exists
      const tableResult = await pool.request().query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'SyncStatus'
      `);
      
      const syncTableExists = tableResult.recordset[0].tableExists > 0;
      
      if (syncTableExists) {
        // Check if entity_type column exists
        const columnResult = await pool.request().query(`
          SELECT COUNT(*) AS columnExists 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'SyncStatus' AND COLUMN_NAME = 'entity_type'
        `);
        
        const entityTypeColumnExists = columnResult.recordset[0].columnExists > 0;
        
        if (entityTypeColumnExists) {
          // Get last sync date by entity_type
          const result = await pool.request().query(`
            SELECT last_sync_date 
            FROM SyncStatus 
            WHERE entity_type = 'users'
          `);
          
          if (result.recordset.length > 0) {
            return new Date(result.recordset[0].last_sync_date);
          }
        }
      }
      
      // Default to January 1, 2025 if no sync date found
      return new Date('2025-01-01T00:00:00.000Z');
    } catch (error) {
      console.error('Error getting last users sync date:', error.message);
      // Default to January 1, 2025 if error occurs
      return new Date('2025-01-01T00:00:00.000Z');
    }
  }

  /**
   * Update the last sync date for users
   * @param {Date} date - The new sync date
   * @param {number} count - The number of users synced
   * @returns {Promise<boolean>} - Success status
   */
  async updateLastUsersSyncDate(date = new Date(), count = 0) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if SyncStatus table exists
      const tableResult = await pool.request().query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'SyncStatus'
      `);
      
      const syncTableExists = tableResult.recordset[0].tableExists > 0;
      
      if (syncTableExists) {
        // Check if entity_type column exists
        const columnResult = await pool.request().query(`
          SELECT COUNT(*) AS columnExists 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'SyncStatus' AND COLUMN_NAME = 'entity_type'
        `);
        
        const entityTypeColumnExists = columnResult.recordset[0].columnExists > 0;
        
        if (entityTypeColumnExists) {
          // Check if users record exists
          const recordResult = await pool.request().query(`
            SELECT COUNT(*) AS recordExists 
            FROM SyncStatus 
            WHERE entity_type = 'users'
          `);
          
          const recordExists = recordResult.recordset[0].recordExists > 0;
          
          if (recordExists) {
            // Update existing record
            await pool.request()
              .input('lastSyncDate', sql.DateTime, date)
              .input('lastSyncCount', sql.Int, count)
              .query(`
                UPDATE SyncStatus 
                SET last_sync_date = @lastSyncDate, 
                    last_sync_count = @lastSyncCount,
                    entity_name = 'users'
                WHERE entity_type = 'users'
              `);
          } else {
            // Insert new record
            await pool.request()
              .input('lastSyncDate', sql.DateTime, date)
              .input('lastSyncCount', sql.Int, count)
              .query(`
                INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date, last_sync_count)
                VALUES ('users', 'users', @lastSyncDate, @lastSyncCount)
              `);
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error updating last users sync date:', error.message);
      return false;
    }
  }

  /**
   * Get the count of users in the database
   * @returns {Promise<number>} - User count
   */
  async getUserCountFromDatabase() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query('SELECT COUNT(*) AS count FROM Users');
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting user count:', error.message);
      return 0;
    }
  }

  /**
   * Save users to database with optimized batch processing
   * @param {Array} users - Array of users to save
   * @param {Object|null} syncProgress - Sync progress record for resumable sync
   * @returns {Promise<Object>} - Result with success status and count
   */
  async saveUsersToDatabase(users, syncProgress = null) {
    try {
      console.log(`Saving ${users.length} users to database...`);
      
      const pool = await sql.connect(this.sqlConfig);
      
      // Calculate number of batches
      const totalBatches = Math.ceil(users.length / this.batchSize);
      console.log(`Processing users in ${totalBatches} batches of ${this.batchSize}`);
      
      // Update sync progress with total batches if provided
      if (syncProgress) {
        await this.updateSyncProgress(syncProgress, {
          total_batches: totalBatches
        });
      }
      
      // Start from the batch number in sync progress if resuming
      const startBatch = syncProgress ? syncProgress.batch_number : 0;
      let savedCount = syncProgress ? syncProgress.items_processed : 0;
      let errorCount = 0;
      
      // Process users in batches
      for (let batchNum = startBatch; batchNum < totalBatches; batchNum++) {
        console.log(`Processing batch ${batchNum + 1} of ${totalBatches}...`);
        
        // Update sync progress if provided
        if (syncProgress) {
          await this.updateSyncProgress(syncProgress, {
            batch_number: batchNum
          });
        }
        
        const batchStart = batchNum * this.batchSize;
        const batchEnd = Math.min(batchStart + this.batchSize, users.length);
        const batch = users.slice(batchStart, batchEnd);
        
        // Process each user in the batch
        const transaction = new sql.Transaction(pool);
        
        try {
          await transaction.begin();
          
          for (const user of batch) {
            try {
              // Check if user already exists
              const checkResult = await new sql.Request(transaction)
                .input('iduser', sql.Int, user.iduser)
                .query('SELECT id FROM Users WHERE iduser = @iduser');
              
              const userExists = checkResult.recordset.length > 0;
              
              // Prepare request for insert/update
              const request = new sql.Request(transaction);
              
              // Add standard fields
              request.input('iduser', sql.Int, user.iduser);
              request.input('idpacking_station', sql.Int, user.idpacking_station || null);
              request.input('username', sql.NVarChar, user.username || '');
              request.input('firstname', sql.NVarChar, user.firstname || null);
              request.input('lastname', sql.NVarChar, user.lastname || null);
              request.input('first_name', sql.NVarChar, user.first_name || null);
              request.input('last_name', sql.NVarChar, user.last_name || null);
              request.input('emailaddress', sql.NVarChar, user.emailaddress || null);
              request.input('language', sql.NVarChar, user.language || null);
              request.input('admin', sql.Bit, user.admin ? 1 : 0);
              request.input('active', sql.Bit, user.active ? 1 : 0);
              request.input('last_login_at', sql.DateTime, user.last_login_at ? new Date(user.last_login_at) : null);
              request.input('created_at', sql.DateTime, user.created_at ? new Date(user.created_at) : null);
              request.input('updated_at', sql.DateTime, user.updated_at ? new Date(user.updated_at) : null);
              request.input('lastSyncDate', sql.DateTime, new Date());
              
              if (userExists) {
                // Update existing user
                await request.query(`
                  UPDATE Users 
                  SET idpacking_station = @idpacking_station,
                      username = @username,
                      firstname = @firstname,
                      lastname = @lastname,
                      first_name = @first_name,
                      last_name = @last_name,
                      emailaddress = @emailaddress,
                      language = @language,
                      admin = @admin,
                      active = @active,
                      last_login_at = @last_login_at,
                      created_at = @created_at,
                      updated_at = @updated_at,
                      last_sync_date = @lastSyncDate
                  WHERE iduser = @iduser
                `);
              } else {
                // Insert new user
                await request.query(`
                  INSERT INTO Users (
                    iduser, idpacking_station, username, firstname, lastname,
                    first_name, last_name, emailaddress, language, admin,
                    active, last_login_at, created_at, updated_at, last_sync_date
                  )
                  VALUES (
                    @iduser, @idpacking_station, @username, @firstname, @lastname,
                    @first_name, @last_name, @emailaddress, @language, @admin,
                    @active, @last_login_at, @created_at, @updated_at, @lastSyncDate
                  )
                `);
              }
              
              // Fetch and save user rights if available
              if (!user.rights) {
                // Get detailed user info including rights
                const userDetails = await this.getUserDetails(user.iduser);
                if (userDetails && userDetails.rights) {
                  user.rights = userDetails.rights;
                }
              }
              
              if (user.rights && Array.isArray(user.rights)) {
                // Delete existing rights for this user
                await new sql.Request(transaction)
                  .input('iduser', sql.Int, user.iduser)
                  .query('DELETE FROM UserRights WHERE iduser = @iduser');
                
                // Insert new rights
                for (const right of user.rights) {
                  const rightRequest = new sql.Request(transaction);
                  rightRequest.input('iduser', sql.Int, user.iduser);
                  rightRequest.input('right_name', sql.NVarChar, right.right || '');
                  rightRequest.input('granted', sql.Bit, right.granted ? 1 : 0);
                  rightRequest.input('lastSyncDate', sql.DateTime, new Date());
                  
                  await rightRequest.query(`
                    INSERT INTO UserRights (
                      iduser, right_name, granted, last_sync_date
                    )
                    VALUES (
                      @iduser, @right_name, @granted, @lastSyncDate
                    )
                  `);
                }
                
                console.log(`Saved ${user.rights.length} rights for user ${user.iduser}`);
              }
              
              savedCount++;
            } catch (userError) {
              console.error(`Error saving user ${user.iduser}:`, userError.message);
              errorCount++;
            }
          }
          
          await transaction.commit();
          
          // Update sync progress if provided
          if (syncProgress) {
            await this.updateSyncProgress(syncProgress, {
              items_processed: savedCount
            });
          }
        } catch (batchError) {
          console.error(`Error processing batch ${batchNum + 1}:`, batchError.message);
          await transaction.rollback();
          errorCount += batch.length;
        }
      }
      
      console.log(`✅ Saved ${savedCount} users to database (${errorCount} errors)`);
      
      // Complete sync progress if provided
      if (syncProgress) {
        await this.completeSyncProgress(syncProgress, true);
      }
      
      return {
        success: true,
        savedCount,
        errorCount,
        message: `Saved ${savedCount} users to database (${errorCount} errors)`
      };
    } catch (error) {
      console.error('Error saving users to database:', error.message);
      
      // Complete sync progress with failure if provided
      if (syncProgress) {
        await this.completeSyncProgress(syncProgress, false);
      }
      
      return {
        success: false,
        savedCount: 0,
        errorCount: users.length,
        message: `Error saving users to database: ${error.message}`
      };
    }
  }

  /**
   * Perform a full sync of all users
   * @returns {Promise<Object>} - Result with success status and count
   */
  async performFullUsersSync() {
    try {
      console.log('Starting full users sync...');
      
      // Create sync progress record
      const syncProgress = await this.createOrGetSyncProgress('users', true);
      
      // Get all users from Picqer
      const users = await this.getAllUsers(null, syncProgress);
      console.log(`Retrieved ${users.length} users from Picqer`);
      
      // Save users to database
      const result = await this.saveUsersToDatabase(users, syncProgress);
      
      // Update last sync date
      await this.updateLastUsersSyncDate(new Date(), result.savedCount);
      
      return result;
    } catch (error) {
      console.error('Error performing full users sync:', error.message);
      return {
        success: false,
        savedCount: 0,
        message: `Error performing full users sync: ${error.message}`
      };
    }
  }

  /**
   * Perform an incremental sync of users updated since last sync
   * Uses 30-day rolling window for better performance
   * @returns {Promise<Object>} - Result with success status and count
   */
  async performIncrementalUsersSync() {
    try {
      console.log('Starting incremental users sync...');
      
      // Get last sync date
      const lastSyncDate = await this.getLastUsersSyncDate();
      console.log('Last users sync date:', lastSyncDate.toISOString());
      
      // Create sync progress record
      const syncProgress = await this.createOrGetSyncProgress('users', false);
      
      // Get users updated since last sync (with 30-day rolling window)
      const users = await this.getUsersUpdatedSince(lastSyncDate, syncProgress);
      console.log(`Retrieved ${users.length} updated users from Picqer`);
      
      // Save users to database
      const result = await this.saveUsersToDatabase(users, syncProgress);
      
      // Update last sync date
      await this.updateLastUsersSyncDate(new Date(), result.savedCount);
      
      return result;
    } catch (error) {
      console.error('Error performing incremental users sync:', error.message);
      return {
        success: false,
        savedCount: 0,
        message: `Error performing incremental users sync: ${error.message}`
      };
    }
  }

  /**
   * Retry a failed users sync
   * @param {string} syncId - The ID of the failed sync to retry
   * @returns {Promise<Object>} - Result with success status and count
   */
  async retryFailedUsersSync(syncId) {
    try {
      console.log(`Retrying failed users sync with ID: ${syncId}`);
      
      const pool = await sql.connect(this.sqlConfig);
      
      // Get the failed sync record
      const syncResult = await pool.request()
        .input('syncId', sql.NVarChar, syncId)
        .query(`
          SELECT * FROM SyncProgress 
          WHERE sync_id = @syncId AND entity_type = 'users'
        `);
      
      if (syncResult.recordset.length === 0) {
        return {
          success: false,
          message: `No users sync record found with ID: ${syncId}`
        };
      }
      
      const syncRecord = syncResult.recordset[0];
      
      // Reset sync status to in_progress
      await pool.request()
        .input('syncId', sql.NVarChar, syncId)
        .input('now', sql.DateTime, new Date().toISOString())
        .query(`
          UPDATE SyncProgress 
          SET status = 'in_progress', 
              last_updated = @now,
              completed_at = NULL
          WHERE sync_id = @syncId
        `);
      
      // Get last sync date
      const lastSyncDate = await this.getLastUsersSyncDate();
      
      // Get users updated since last sync
      const users = await this.getAllUsers(lastSyncDate, syncRecord);
      
      // Save users to database
      const result = await this.saveUsersToDatabase(users, syncRecord);
      
      // Update last sync date
      await this.updateLastUsersSyncDate(new Date(), result.savedCount);
      
      return {
        success: true,
        savedCount: result.savedCount,
        message: `Successfully retried users sync: ${result.message}`
      };
    } catch (error) {
      console.error(`Error retrying users sync ${syncId}:`, error.message);
      return {
        success: false,
        savedCount: 0,
        message: `Error retrying users sync: ${error.message}`
      };
    }
  }
}

module.exports = UserService;
