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
   * Get user count from database
   * @returns {Promise<number>} - Number of users in database
   */
  async getUserCountFromDatabase() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query('SELECT COUNT(*) as count FROM Users');
      return result.recordset[0].count;
    } catch (error) {
      console.error('Error getting user count from database:', error.message);
      return 0;
    }
  }

  /**
   * Get last sync date for users
   * @returns {Promise<Date|null>} - Last sync date or null if never synced
   */
  async getLastSyncDate() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query(`
        SELECT last_sync_date 
        FROM SyncStatus 
        WHERE entity_type = 'users'
      `);
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      return null;
    } catch (error) {
      console.error('Error getting last sync date for users:', error.message);
      return null;
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
    const effectiveDate = date && date > thirtyDaysAgo ? date : thirtyDaysAgo;
    
    console.log(`Getting users updated since ${effectiveDate.toISOString()}`);
    return this.getAllUsers(effectiveDate);
  }

  /**
   * Save users to database
   * @param {Array} users - Array of users to save
   * @param {Object|null} syncProgress - Sync progress record for tracking
   * @returns {Promise<Object>} - Results of save operation
   */
  async saveUsersToDB(users, syncProgress = null) {
    try {
      if (!users || users.length === 0) {
        console.log('No users to save');
        return { savedUsers: 0, savedRights: 0 };
      }
      
      console.log(`Saving ${users.length} users to database...`);
      
      const pool = await sql.connect(this.sqlConfig);
      let savedUsers = 0;
      let savedRights = 0;
      let batchNumber = 0;
      
      // Process users in batches for better performance
      for (let i = 0; i < users.length; i += this.batchSize) {
        batchNumber++;
        const batch = users.slice(i, i + this.batchSize);
        console.log(`Processing batch ${batchNumber} with ${batch.length} users...`);
        
        // Update sync progress if provided
        if (syncProgress) {
          await this.updateSyncProgress(syncProgress, {
            batch_number: batchNumber,
            items_processed: i
          });
        }
        
        // Process each user in the batch
        for (const user of batch) {
          try {
            // Get user details including rights
            const userDetails = await this.getUserDetails(user.iduser);
            
            if (!userDetails) {
              console.warn(`Could not get details for user ${user.iduser}, skipping`);
              continue;
            }
            
            // Save user to database
            await this.saveUserToDB(userDetails);
            savedUsers++;
            
            // Save user rights to database if available
            if (userDetails.rights && Array.isArray(userDetails.rights)) {
              await this.saveUserRightsToDB(userDetails.iduser, userDetails.rights);
              savedRights += userDetails.rights.length;
            }
          } catch (userError) {
            console.error(`Error saving user ${user.iduser}:`, userError.message);
            // Continue with next user
          }
        }
        
        console.log(`Completed batch ${batchNumber}, saved ${savedUsers} users so far`);
        
        // Add a small delay between batches to avoid database overload
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Update sync status
      await this.updateSyncStatus(users.length);
      
      console.log(`✅ Saved ${savedUsers} users and ${savedRights} user rights to database`);
      return { savedUsers, savedRights };
    } catch (error) {
      console.error('Error saving users to database:', error.message);
      throw error;
    }
  }

  /**
   * Save a single user to database
   * @param {Object} user - User to save
   * @returns {Promise<boolean>} - Success status
   */
  async saveUserToDB(user) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if user already exists
      const checkResult = await pool.request()
        .input('iduser', sql.Int, user.iduser)
        .query('SELECT id FROM Users WHERE iduser = @iduser');
      
      const userExists = checkResult.recordset.length > 0;
      
      if (userExists) {
        // Update existing user
        await pool.request()
          .input('iduser', sql.Int, user.iduser)
          .input('name', sql.NVarChar, user.name || '')
          .input('email', sql.NVarChar, user.email || '')
          .input('active', sql.Bit, user.active ? 1 : 0)
          .input('last_login_at', sql.DateTime, user.last_login_at ? new Date(user.last_login_at) : null)
          .input('last_sync_date', sql.DateTime, new Date())
          .query(`
            UPDATE Users 
            SET 
              name = @name,
              email = @email,
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
          .input('active', sql.Bit, user.active ? 1 : 0)
          .input('last_login_at', sql.DateTime, user.last_login_at ? new Date(user.last_login_at) : null)
          .input('last_sync_date', sql.DateTime, new Date())
          .query(`
            INSERT INTO Users (
              iduser, name, email, active, last_login_at, last_sync_date
            )
            VALUES (
              @iduser, @name, @email, @active, @last_login_at, @last_sync_date
            )
          `);
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving user ${user.iduser} to database:`, error.message);
      throw error;
    }
  }

  /**
   * Save user rights to database
   * @param {number} iduser - User ID
   * @param {Array} rights - Array of user rights
   * @returns {Promise<boolean>} - Success status
   */
  async saveUserRightsToDB(iduser, rights) {
    try {
      if (!rights || rights.length === 0) {
        return true;
      }
      
      const pool = await sql.connect(this.sqlConfig);
      
      // Delete existing rights for this user
      await pool.request()
        .input('iduser', sql.Int, iduser)
        .query('DELETE FROM UserRights WHERE iduser = @iduser');
      
      // Insert new rights
      for (const right of rights) {
        await pool.request()
          .input('iduser', sql.Int, iduser)
          .input('right_name', sql.NVarChar, right.name || '')
          .input('right_value', sql.NVarChar, right.value || '')
          .query(`
            INSERT INTO UserRights (
              iduser, right_name, right_value
            )
            VALUES (
              @iduser, @right_name, @right_value
            )
          `);
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving rights for user ${iduser} to database:`, error.message);
      throw error;
    }
  }

  /**
   * Update sync status in SyncStatus table
   * @param {number} syncCount - Number of items synced
   * @returns {Promise<boolean>} - Success status
   */
  async updateSyncStatus(syncCount) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Update SyncStatus record for users
      await pool.request()
        .input('entityType', sql.NVarChar, 'users')
        .input('lastSyncDate', sql.DateTime, new Date())
        .input('lastSyncCount', sql.Int, syncCount)
        .query(`
          UPDATE SyncStatus 
          SET 
            last_sync_date = @lastSyncDate,
            last_sync_count = @lastSyncCount
          WHERE entity_type = @entityType
        `);
      
      return true;
    } catch (error) {
      console.error('Error updating sync status:', error.message);
      return false;
    }
  }

  /**
   * Sync users from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Results of sync operation
   */
  async syncUsers(fullSync = false) {
    try {
      console.log(`Starting ${fullSync ? 'full' : 'incremental'} user sync...`);
      
      // Create sync progress record
      const syncProgress = await this.createOrGetSyncProgress('users', fullSync);
      
      let users;
      if (fullSync) {
        // Full sync: get all users
        users = await this.getAllUsers(null, syncProgress);
      } else {
        // Incremental sync: get users updated since last sync
        const lastSyncDate = await this.getLastSyncDate();
        users = await this.getUsersUpdatedSince(lastSyncDate);
      }
      
      // Save users to database
      const result = await this.saveUsersToDB(users, syncProgress);
      
      // Complete sync progress
      await this.completeSyncProgress(syncProgress, true);
      
      console.log(`✅ User sync completed: ${result.savedUsers} users saved`);
      return {
        success: true,
        savedUsers: result.savedUsers,
        savedRights: result.savedRights
      };
    } catch (error) {
      console.error('Error in user sync:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = UserService;
