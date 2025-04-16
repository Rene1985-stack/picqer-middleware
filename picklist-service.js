/**
 * Picklist service for interacting with the Picqer API and syncing picklists to Azure SQL
 * Following the same pattern as the product sync functionality
 */
const axios = require('axios');
const sql = require('mssql');
const picklistsSchema = require('./picklists_schema');

class PicklistService {
  constructor(apiKey, baseUrl, sqlConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.sqlConfig = sqlConfig;
    
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
   * Initialize the database with picklists schema
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
      
      // Check if SyncStatus table exists and add picklists entity if needed
      const tableResult = await pool.request().query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'SyncStatus'
      `);
      
      const syncTableExists = tableResult.recordset[0].tableExists > 0;
      
      if (syncTableExists) {
        // Check if picklists entity exists in SyncStatus
        const entityResult = await pool.request().query(`
          SELECT COUNT(*) AS entityExists 
          FROM SyncStatus 
          WHERE entity_name = 'picklists'
        `);
        
        const entityExists = entityResult.recordset[0].entityExists > 0;
        
        if (!entityExists) {
          // Add picklists entity to SyncStatus
          await pool.request().query(`
            INSERT INTO SyncStatus (entity_name, last_sync_date)
            VALUES ('picklists', '2025-01-01T00:00:00.000Z');
          `);
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
   * Get all picklists from Picqer with pagination
   * @param {Date} updatedSince - Only get picklists updated since this date
   * @returns {Promise<Array>} - Array of unique picklists
   */
  async getAllPicklists(updatedSince = null) {
    console.log('Fetching all picklists from Picqer...');
    
    let allPicklists = [];
    let offset = 0;
    const limit = 100; // Picqer's default page size
    let hasMorePicklists = true;
    
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
          
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          hasMorePicklists = false;
        }
      }
      
      console.log(`✅ Retrieved ${allPicklists.length} unique picklists from Picqer`);
      return allPicklists;
    } catch (error) {
      console.error('Error fetching picklists from Picqer:', error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log('Rate limit hit, waiting before retrying...');
        
        // Wait for 20 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getAllPicklists(updatedSince);
      }
      
      throw error;
    }
  }

  /**
   * Get picklists updated since a specific date
   * @param {Date} date - The date to check updates from
   * @returns {Promise<Array>} - Array of updated picklists
   */
  async getPicklistsUpdatedSince(date) {
    return this.getAllPicklists(date);
  }

  /**
   * Get the last sync date for picklists
   * @returns {Promise<Date|null>} - Last sync date or null if not found
   */
  async getLastPicklistsSyncDate() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Get last sync date for picklists from SyncStatus table
      const result = await pool.request()
        .input('entityName', sql.NVarChar, 'picklists')
        .query('SELECT last_sync_date FROM SyncStatus WHERE entity_name = @entityName');
      
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
      
      // Check if picklists entity exists in SyncStatus
      const result = await pool.request()
        .input('entityName', sql.NVarChar, 'picklists')
        .query('SELECT COUNT(*) AS count FROM SyncStatus WHERE entity_name = @entityName');
      
      if (result.recordset[0].count > 0) {
        // Update existing record
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
      } else {
        // Insert new record
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
   * Save picklists to the database
   * @param {Array} picklists - Array of picklists from Picqer API
   * @returns {Promise<number>} - Number of picklists saved
   */
  async savePicklistsToDatabase(picklists) {
    if (!picklists || picklists.length === 0) {
      console.log('No picklists to save.');
      return 0;
    }
    
    console.log(`Saving ${picklists.length} picklists to database...`);
    let savedCount = 0;
    
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Process picklists in batches of 20 for better performance
      const batchSize = 20;
      for (let i = 0; i < picklists.length; i += batchSize) {
        const batch = picklists.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(picklists.length / batchSize)}...`);
        
        // Process each picklist in the batch
        for (const picklist of batch) {
          try {
            // Begin transaction
            const transaction = new sql.Transaction(pool);
            await transaction.begin();
            
            try {
              // Check if picklist already exists
              const checkResult = await new sql.Request(transaction)
                .input('idpicklist', sql.Int, picklist.idpicklist)
                .query('SELECT COUNT(*) AS count FROM Picklists WHERE idpicklist = @idpicklist');
              
              const exists = checkResult.recordset[0].count > 0;
              
              // Prepare picklist data
              const request = new sql.Request(transaction)
                .input('idpicklist', sql.Int, picklist.idpicklist)
                .input('picklistid', sql.NVarChar, picklist.picklistid || '')
                .input('idcustomer', sql.Int, picklist.idcustomer || null)
                .input('idorder', sql.Int, picklist.idorder || null)
                .input('idreturn', sql.Int, picklist.idreturn || null)
                .input('idwarehouse', sql.Int, picklist.idwarehouse || null)
                .input('idtemplate', sql.Int, picklist.idtemplate || null)
                .input('idpicklist_batch', sql.Int, picklist.idpicklist_batch || null)
                .input('idshippingprovider_profile', sql.Int, picklist.idshippingprovider_profile || null)
                .input('deliveryname', sql.NVarChar, picklist.deliveryname || null)
                .input('deliverycontact', sql.NVarChar, picklist.deliverycontact || null)
                .input('deliveryaddress', sql.NVarChar, picklist.deliveryaddress || null)
                .input('deliveryaddress2', sql.NVarChar, picklist.deliveryaddress2 || null)
                .input('deliveryzipcode', sql.NVarChar, picklist.deliveryzipcode || null)
                .input('deliverycity', sql.NVarChar, picklist.deliverycity || null)
                .input('deliveryregion', sql.NVarChar, picklist.deliveryregion || null)
                .input('deliverycountry', sql.NVarChar, picklist.deliverycountry || null)
                .input('telephone', sql.NVarChar, picklist.telephone || null)
                .input('emailaddress', sql.NVarChar, picklist.emailaddress || null)
                .input('reference', sql.NVarChar, picklist.reference || null)
                .input('assigned_to_iduser', sql.Int, picklist.assigned_to_iduser || null)
                .input('invoiced', sql.Bit, picklist.invoiced ? 1 : 0)
                .input('urgent', sql.Bit, picklist.urgent ? 1 : 0)
                .input('preferred_delivery_date', sql.Date, picklist.preferred_delivery_date ? new Date(picklist.preferred_delivery_date) : null)
                .input('status', sql.NVarChar, picklist.status || null)
                .input('totalproducts', sql.Int, picklist.totalproducts || 0)
                .input('totalpicked', sql.Int, picklist.totalpicked || 0)
                .input('weight', sql.Int, picklist.weight || 0)
                .input('snoozed_until', sql.DateTime, picklist.snoozed_until ? new Date(picklist.snoozed_until) : null)
                .input('closed_by_iduser', sql.Int, picklist.closed_by_iduser || null)
                .input('closed_at', sql.DateTime, picklist.closed_at ? new Date(picklist.closed_at) : null)
                .input('created', sql.DateTime, picklist.created ? new Date(picklist.created) : null)
                .input('updated', sql.DateTime, picklist.updated ? new Date(picklist.updated) : null)
                .input('idfulfilment_customer', sql.Int, picklist.idfulfilment_customer || null)
                .input('last_sync_date', sql.DateTime, new Date());
              
              // Execute query based on whether picklist exists
              let picklistId;
              if (exists) {
                // Update existing picklist
                await request.query(`
                  UPDATE Picklists SET
                    picklistid = @picklistid,
                    idcustomer = @idcustomer,
                    idorder = @idorder,
                    idreturn = @idreturn,
                    idwarehouse = @idwarehouse,
                    idtemplate = @idtemplate,
                    idpicklist_batch = @idpicklist_batch,
                    idshippingprovider_profile = @idshippingprovider_profile,
                    deliveryname = @deliveryname,
                    deliverycontact = @deliverycontact,
                    deliveryaddress = @deliveryaddress,
                    deliveryaddress2 = @deliveryaddress2,
                    deliveryzipcode = @deliveryzipcode,
                    deliverycity = @deliverycity,
                    deliveryregion = @deliveryregion,
                    deliverycountry = @deliverycountry,
                    telephone = @telephone,
                    emailaddress = @emailaddress,
                    reference = @reference,
                    assigned_to_iduser = @assigned_to_iduser,
                    invoiced = @invoiced,
                    urgent = @urgent,
                    preferred_delivery_date = @preferred_delivery_date,
                    status = @status,
                    totalproducts = @totalproducts,
                    totalpicked = @totalpicked,
                    weight = @weight,
                    snoozed_until = @snoozed_until,
                    closed_by_iduser = @closed_by_iduser,
                    closed_at = @closed_at,
                    created = @created,
                    updated = @updated,
                    idfulfilment_customer = @idfulfilment_customer,
                    last_sync_date = @last_sync_date
                  WHERE idpicklist = @idpicklist
                `);
                
                // Get the ID of the updated picklist
                const idResult = await new sql.Request(transaction)
                  .input('idpicklist', sql.Int, picklist.idpicklist)
                  .query('SELECT id FROM Picklists WHERE idpicklist = @idpicklist');
                
                picklistId = idResult.recordset[0].id;
              } else {
                // Insert new picklist
                const insertResult = await request.query(`
                  INSERT INTO Picklists (
                    idpicklist, picklistid, idcustomer, idorder, idreturn, idwarehouse, idtemplate,
                    idpicklist_batch, idshippingprovider_profile, deliveryname, deliverycontact,
                    deliveryaddress, deliveryaddress2, deliveryzipcode, deliverycity, deliveryregion,
                    deliverycountry, telephone, emailaddress, reference, assigned_to_iduser,
                    invoiced, urgent, preferred_delivery_date, status, totalproducts, totalpicked,
                    weight, snoozed_until, closed_by_iduser, closed_at, created, updated,
                    idfulfilment_customer, last_sync_date
                  )
                  VALUES (
                    @idpicklist, @picklistid, @idcustomer, @idorder, @idreturn, @idwarehouse, @idtemplate,
                    @idpicklist_batch, @idshippingprovider_profile, @deliveryname, @deliverycontact,
                    @deliveryaddress, @deliveryaddress2, @deliveryzipcode, @deliverycity, @deliveryregion,
                    @deliverycountry, @telephone, @emailaddress, @reference, @assigned_to_iduser,
                    @invoiced, @urgent, @preferred_delivery_date, @status, @totalproducts, @totalpicked,
                    @weight, @snoozed_until, @closed_by_iduser, @closed_at, @created, @updated,
                    @idfulfilment_customer, @last_sync_date
                  );
                  SELECT SCOPE_IDENTITY() AS id;
                `);
                
                picklistId = insertResult.recordset[0].id;
              }
              
              // Delete existing picklist products and locations
              await new sql.Request(transaction)
                .input('idpicklist', sql.Int, picklist.idpicklist)
                .query('DELETE FROM PicklistProductLocations WHERE idpicklist_product IN (SELECT idpicklist_product FROM PicklistProducts WHERE idpicklist = @idpicklist)');
              
              await new sql.Request(transaction)
                .input('idpicklist', sql.Int, picklist.idpicklist)
                .query('DELETE FROM PicklistProducts WHERE idpicklist = @idpicklist');
              
              // Save picklist products
              if (picklist.products && Array.isArray(picklist.products)) {
                for (const product of picklist.products) {
                  // Insert picklist product
                  const productRequest = new sql.Request(transaction)
                    .input('idpicklist_product', sql.Int, product.idpicklist_product || 0)
                    .input('idpicklist', sql.Int, picklist.idpicklist)
                    .input('idproduct', sql.Int, product.idproduct || 0)
                    .input('idorder_product', sql.Int, product.idorder_product || null)
                    .input('idreturn_product_replacement', sql.Int, product.idreturn_product_replacement || null)
                    .input('idvatgroup', sql.Int, product.idvatgroup || null)
                    .input('productcode', sql.NVarChar, product.productcode || null)
                    .input('name', sql.NVarChar, product.name || null)
                    .input('remarks', sql.NVarChar, product.remarks || null)
                    .input('amount', sql.Int, product.amount || 0)
                    .input('amount_picked', sql.Int, product.amount_picked || 0)
                    .input('price', sql.Decimal(18, 2), product.price || 0)
                    .input('weight', sql.Int, product.weight || 0)
                    .input('stocklocation', sql.NVarChar, product.stocklocation || null)
                    .input('partof_idpicklist_product', sql.Int, product.partof_idpicklist_product || null)
                    .input('has_parts', sql.Bit, product.has_parts ? 1 : 0)
                    .input('last_sync_date', sql.DateTime, new Date());
                  
                  const productResult = await productRequest.query(`
                    INSERT INTO PicklistProducts (
                      idpicklist_product, idpicklist, idproduct, idorder_product, idreturn_product_replacement,
                      idvatgroup, productcode, name, remarks, amount, amount_picked, price, weight,
                      stocklocation, partof_idpicklist_product, has_parts, last_sync_date
                    )
                    VALUES (
                      @idpicklist_product, @idpicklist, @idproduct, @idorder_product, @idreturn_product_replacement,
                      @idvatgroup, @productcode, @name, @remarks, @amount, @amount_picked, @price, @weight,
                      @stocklocation, @partof_idpicklist_product, @has_parts, @last_sync_date
                    );
                    SELECT SCOPE_IDENTITY() AS id;
                  `);
                  
                  // Save pick locations for this product
                  if (product.pick_locations && Array.isArray(product.pick_locations)) {
                    for (const location of product.pick_locations) {
                      await new sql.Request(transaction)
                        .input('idpicklist_product', sql.Int, product.idpicklist_product)
                        .input('idlocation', sql.Int, location.idlocation || 0)
                        .input('name', sql.NVarChar, location.name || null)
                        .input('amount', sql.Int, location.amount || 0)
                        .input('last_sync_date', sql.DateTime, new Date())
                        .query(`
                          INSERT INTO PicklistProductLocations (
                            idpicklist_product, idlocation, name, amount, last_sync_date
                          )
                          VALUES (
                            @idpicklist_product, @idlocation, @name, @amount, @last_sync_date
                          )
                        `);
                    }
                  }
                }
              }
              
              // Commit transaction
              await transaction.commit();
              savedCount++;
            } catch (transactionError) {
              // Rollback transaction on error
              await transaction.rollback();
              console.error(`Error saving picklist ${picklist.idpicklist}:`, transactionError.message);
            }
          } catch (picklistError) {
            console.error(`Error processing picklist ${picklist.idpicklist}:`, picklistError.message);
            // Continue with next picklist even if this one fails
          }
        }
      }
      
      console.log(`✅ Saved ${savedCount} picklists to database`);
      return savedCount;
    } catch (error) {
      console.error('❌ Error saving picklists to database:', error.message);
      throw error;
    }
  }

  /**
   * Perform a full sync of all picklists
   * @returns {Promise<Object>} - Sync result
   */
  async performFullPicklistsSync() {
    try {
      console.log('Starting full picklists sync...');
      
      // Get all picklists from Picqer
      const picklists = await this.getAllPicklists();
      console.log(`Retrieved ${picklists.length} picklists from Picqer`);
      
      // Save picklists to database
      const savedCount = await this.savePicklistsToDatabase(picklists);
      
      // Update sync status
      const totalCount = await this.getPicklistCountFromDatabase();
      await this.updatePicklistsSyncStatus(new Date().toISOString(), totalCount, savedCount);
      
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
   * @returns {Promise<Object>} - Sync result
   */
  async performIncrementalPicklistsSync() {
    try {
      console.log('Starting incremental picklists sync...');
      
      // Get last sync date
      const lastSyncDate = await this.getLastPicklistsSyncDate();
      console.log(`Last picklists sync date: ${lastSyncDate.toISOString()}`);
      
      // Get picklists updated since last sync
      const picklists = await this.getPicklistsUpdatedSince(lastSyncDate);
      console.log(`Retrieved ${picklists.length} updated picklists from Picqer`);
      
      // Save picklists to database
      const savedCount = await this.savePicklistsToDatabase(picklists);
      
      // Update sync status
      const totalCount = await this.getPicklistCountFromDatabase();
      await this.updatePicklistsSyncStatus(new Date().toISOString(), totalCount, savedCount);
      
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
}

module.exports = PicklistService;
