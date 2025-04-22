/**
 * Enhanced User Service with Rate Limiting and Sync Methods
 * 
 * This service handles user data synchronization between Picqer and the database.
 * It includes:
 * 1. Rate limiting to prevent "Rate limit exceeded" errors
 * 2. Complete sync methods for the dashboard
 * 3. Proper error handling and logging
 * 4. Performance optimizations for efficient data processing
 */
const sql = require('mssql');
const { v4: uuidv4 } = require('uuid');
const usersSchema = require('./users_schema');
const syncProgressSchema = require('./sync_progress_schema');
const PicqerApiClient = require('./picqer-api-client');

class UserService {
  /**
   * Initialize the UserService
   * @param {string} apiKey - Picqer API key
   * @param {string} baseUrl - Picqer API base URL
   * @param {Object} dbConfig - Database configuration
   */
  constructor(apiKey, baseUrl, dbConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.dbConfig = dbConfig;
    this.batchSize = 100; // Use larger batch size for better performance
    
    // Initialize API client with rate limiting
    this.apiClient = new PicqerApiClient(apiKey, baseUrl, {
      requestsPerMinute: 30, // Adjust based on your Picqer plan
      maxRetries: 5,
      waitOnRateLimit: true,
      sleepTimeOnRateLimitHitInMs: 20000 // 20 seconds, like Picqer's default
    });
    
    console.log('UserService initialized with rate-limited Picqer API client');
  }

  /**
   * Initialize the database with users schema and sync progress tracking
   * @returns {Promise<boolean>} - Success status
   */
  async initializeUsersDatabase() {
    try {
      console.log('Initializing database with users schema...');
      const pool = await sql.connect(this.dbConfig);
      
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
              VALUES ('users', 'users', GETDATE())
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
      const pool = await sql.connect(this.dbConfig);
      
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
      const pool = await sql.connect(this.dbConfig);
      
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
        
        const response = await this.apiClient.get('/users', { params });
        
        if (response && Array.isArray(response) && response.length > 0) {
          // Filter out duplicates by iduser
          const existingIds = new Set(allUsers.map(u => u.iduser));
          const newUsers = response.filter(user => {
            return !existingIds.has(user.iduser);
          });
          
          allUsers = [...allUsers, ...newUsers];
          console.log(`Retrieved ${newUsers.length} new users (total unique: ${allUsers.length})`);
          
          // Check if we have more users
          hasMoreUsers = response.length === limit;
          
          // Increment offset for next page
          offset += limit;
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
      
      const response = await this.apiClient.get(`/users/${iduser}`);
      
      if (response) {
        console.log(`Retrieved details for user ${iduser}`);
        return response;
      }
      
      return null;
    } catch (error) {
      console.error(`Error fetching details for user ${iduser}:`, error.message);
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
    const syncDate = date && date > thirtyDaysAgo ? date : thirtyDaysAgo;
    
    console.log(`Using sync date: ${syncDate.toISOString()}`);
    return this.getAllUsers(syncDate);
  }

  /**
   * Save user to database
   * @param {Object} user - User object from Picqer API
   * @returns {Promise<boolean>} - Success status
   */
  async saveUser(user) {
    try {
      const pool = await sql.connect(this.dbConfig);
      
      // Check if user already exists
      const existingResult = await pool.request()
        .input('iduser', sql.Int, user.iduser)
        .query('SELECT id FROM Users WHERE iduser = @iduser');
      
      const exists = existingResult.recordset.length > 0;
      
      if (exists) {
        // Update existing user
        await pool.request()
          .input('iduser', sql.Int, user.iduser)
          .input('name', sql.NVarChar, user.name || '')
          .input('email', sql.NVarChar, user.email || '')
          .input('language', sql.NVarChar, user.language || '')
          .input('active', sql.Bit, user.active ? 1 : 0)
          .input('last_login_at', sql.DateTime, user.last_login_at ? new Date(user.last_login_at) : null)
          .input('last_sync_date', sql.DateTime, new Date())
          .query(`
            UPDATE Users
            SET name = @name,
                email = @email,
                language = @language,
                active = @active,
                last_login_at = @last_login_at,
                last_sync_date = @last_sync_date
            WHERE iduser = @iduser
          `);
      } else {
        // Insert new user
        await pool.request()
          .input('iduser', sql.Int, user.iduser)
          .input('name', sql.NVarChar, user.name || '')
          .input('email', sql.NVarChar, user.email || '')
          .input('language', sql.NVarChar, user.language || '')
          .input('active', sql.Bit, user.active ? 1 : 0)
          .input('last_login_at', sql.DateTime, user.last_login_at ? new Date(user.last_login_at) : null)
          .input('last_sync_date', sql.DateTime, new Date())
          .query(`
            INSERT INTO Users (
              iduser, name, email, language, active, last_login_at, last_sync_date
            )
            VALUES (
              @iduser, @name, @email, @language, @active, @last_login_at, @last_sync_date
            )
          `);
      }
      
      // Save user rights if available
      if (user.rights && Array.isArray(user.rights)) {
        // First delete existing rights
        await pool.request()
          .input('iduser', sql.Int, user.iduser)
          .query('DELETE FROM UserRights WHERE iduser = @iduser');
        
        // Then insert new rights
        for (const right of user.rights) {
          await pool.request()
            .input('iduser', sql.Int, user.iduser)
            .input('right', sql.NVarChar, right)
            .query(`
              INSERT INTO UserRights (iduser, right_name)
              VALUES (@iduser, @right)
            `);
        }
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving user ${user.iduser}:`, error.message);
      return false;
    }
  }

  /**
   * Save multiple users to database in batches
   * @param {Array} users - Array of user objects from Picqer API
   * @param {Object|null} syncProgress - Sync progress record for tracking
   * @returns {Promise<number>} - Number of successfully saved users
   */
  async saveUsers(users, syncProgress = null) {
    try {
      console.log(`Saving ${users.length} users to database...`);
      
      let successCount = 0;
      let batchNumber = 0;
      const totalBatches = Math.ceil(users.length / this.batchSize);
      
      // Update sync progress with total batches if provided
      if (syncProgress) {
        await this.updateSyncProgress(syncProgress, {
          total_batches: totalBatches,
          total_items: users.length
        });
      }
      
      // Process users in batches
      for (let i = 0; i < users.length; i += this.batchSize) {
        const batch = users.slice(i, i + this.batchSize);
        batchNumber++;
        
        console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} users)...`);
        
        // Update sync progress if provided
        if (syncProgress) {
          await this.updateSyncProgress(syncProgress, {
            batch_number: batchNumber,
            items_processed: successCount
          });
        }
        
        // Process each user in the batch
        for (const user of batch) {
          try {
            // Get detailed user info if needed
            let userDetails = user;
            
            // If user doesn't have rights property, fetch details
            if (!user.rights) {
              userDetails = await this.getUserDetails(user.iduser);
              
              // If details fetch failed, use original user object
              if (!userDetails) {
                userDetails = user;
              }
            }
            
            // Save user to database
            const success = await this.saveUser(userDetails);
            
            if (success) {
              successCount++;
            }
          } catch (userError) {
            console.error(`Error processing user ${user.iduser}:`, userError.message);
            // Continue with next user
          }
        }
        
        console.log(`Batch ${batchNumber}/${totalBatches} completed. ${successCount}/${i + batch.length} users saved successfully.`);
      }
      
      // Update SyncStatus table
      try {
        const pool = await sql.connect(this.dbConfig);
        
        await pool.request()
          .input('entityName', sql.NVarChar, 'users')
          .input('entityType', sql.NVarChar, 'users')
          .input('lastSyncDate', sql.DateTime, new Date())
          .input('lastSyncCount', sql.Int, successCount)
          .input('totalCount', sql.Int, await this.getUserCount())
          .query(`
            UPDATE SyncStatus
            SET last_sync_date = @lastSyncDate,
                last_sync_count = @lastSyncCount,
                total_count = @totalCount
            WHERE entity_name = @entityName OR entity_type = @entityType
            
            IF @@ROWCOUNT = 0
            BEGIN
                INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date, last_sync_count, total_count)
                VALUES (@entityName, @entityType, @lastSyncDate, @lastSyncCount, @totalCount)
            END
          `);
      } catch (syncStatusError) {
        console.error('Error updating SyncStatus:', syncStatusError.message);
      }
      
      console.log(`✅ Saved ${successCount}/${users.length} users to database`);
      return successCount;
    } catch (error) {
      console.error('Error saving users to database:', error.message);
      throw error;
    }
  }

  /**
   * Get user count from database
   * @returns {Promise<number>} - Number of users in database
   */
  async getUserCount() {
    try {
      const pool = await sql.connect(this.dbConfig);
      
      const result = await pool.request().query('SELECT COUNT(*) AS count FROM Users');
      
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting user count:', error.message);
      return 0;
    }
  }

  /**
   * Get last sync date for users
   * @returns {Promise<Date|null>} - Last sync date or null if never synced
   */
  async getLastUserSyncDate() {
    try {
      const pool = await sql.connect(this.dbConfig);
      
      const result = await pool.request()
        .query(`
          SELECT last_sync_date 
          FROM SyncStatus 
          WHERE entity_name = 'users' OR entity_type = 'users'
        `);
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      return null;
    } catch (error) {
      console.error('Error getting last user sync date:', error.message);
      return null;
    }
  }

  /**
   * Sync users from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Sync result
   */
  async syncUsers(fullSync = false) {
    try {
      console.log(`Starting ${fullSync ? 'full' : 'incremental'} user sync...`);
      
      // Create sync progress record
      const syncProgress = await this.createOrGetSyncProgress('users', fullSync);
      
      try {
        let users = [];
        
        if (fullSync) {
          // Full sync: Get all users
          users = await this.getAllUsers(null, syncProgress);
        } else {
          // Incremental sync: Get users updated since last sync
          const lastSyncDate = await this.getLastUserSyncDate();
          users = await this.getUsersUpdatedSince(lastSyncDate);
        }
        
        // Save users to database
        const savedCount = await this.saveUsers(users, syncProgress);
        
        // Complete sync progress
        await this.completeSyncProgress(syncProgress, true);
        
        return {
          success: true,
          message: `Successfully synced ${savedCount} users`,
          syncedCount: savedCount,
          totalCount: users.length
        };
      } catch (syncError) {
        // Mark sync progress as failed
        await this.completeSyncProgress(syncProgress, false);
        
        throw syncError;
      }
    } catch (error) {
      console.error('Error syncing users:', error.message);
      
      return {
        success: false,
        message: `Error syncing users: ${error.message}`,
        error: error.message
      };
    }
  }
}

module.exports = UserService;
