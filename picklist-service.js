/**
 * Picklist service for interacting with the Picqer API and syncing picklists to Azure SQL
 * Updated to include all fields from the Picqer API documentation
 */
const axios = require("axios");
const sql = require("mssql");
const picklistsSchema = require("./picklists_schema");

class PicklistService {
  constructor(apiKey, baseUrl, sqlConfig) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.sqlConfig = sqlConfig;
    
    // Create Base64 encoded credentials (apiKey + ":")
    const credentials = `${this.apiKey}:`;
    const encodedCredentials = Buffer.from(credentials).toString("base64");
    
    // Create client with Basic Authentication header
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        "Authorization": `Basic ${encodedCredentials}`,
        "Content-Type": "application/json",
        "User-Agent": "PicqerMiddleware (middleware@skapa-global.com)",
      },
    });
    
    // Add request interceptor for debugging
    this.client.interceptors.request.use((request) => {
      console.log("Making request to:", request.baseURL + request.url);
      if (request.params) {
        console.log("Request parameters:", JSON.stringify(request.params));
      }
      return request;
    });
    
    // Add response interceptor for debugging
    this.client.interceptors.response.use(
      (response) => {
        console.log("Response status:", response.status);
        return response;
      },
      (error) => {
        console.error("Request failed:");
        if (error.response) {
          console.error("Response status:", error.response.status);
        } else if (error.request) {
          console.error("No response received");
        } else {
          console.error("Error message:", error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get picklist count from database
   * @returns {Promise<number>} - Number of picklists in database
   */
  async getPicklistCountFromDatabase() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool
        .request()
        .query("SELECT COUNT(*) as count FROM Picklists");
      return result.recordset[0].count;
    } catch (error) {
      console.error("Error getting picklist count from database:", error.message);
      return 0;
    }
  }

  /**
   * Get last sync date for picklists
   * @returns {Promise<Date|null>} - Last sync date or null if never synced
   */
  async getLastSyncDate() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query(`
        SELECT last_sync_date 
        FROM SyncStatus 
        WHERE entity_type = 'picklists'
      `);
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      return null;
    } catch (error) {
      console.error("Error getting last sync date for picklists:", error.message);
      return null;
    }
  }

  /**
   * Initialize the database with picklists schema
   * @returns {Promise<boolean>} - Success status
   */
  async initializePicklistsDatabase() {
    try {
      console.log("Initializing database with picklists schema...");
      const pool = await sql.connect(this.sqlConfig);
      
      // Create Picklists table if it doesn't exist
      await pool.request().query(picklistsSchema.createPicklistsTableSQL);
      
      // Create PicklistProducts table if it doesn't exist
      await pool.request().query(picklistsSchema.createPicklistProductsTableSQL);
      
      // Create PicklistProductLocations table if it doesn't exist
      await pool.request().query(picklistsSchema.createPicklistProductLocationsTableSQL);
      
      // Update Picklists table with any missing columns
      await pool.request().query(picklistsSchema.updatePicklistsTableSQL);
      
      // Check if SyncStatus table exists
      const tableResult = await pool.request().query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'SyncStatus'
      `);
      
      const syncTableExists = tableResult.recordset[0].tableExists > 0;
      
      if (syncTableExists) {
        // Check if picklists record exists
        const recordResult = await pool.request().query(`
          SELECT COUNT(*) AS recordExists 
          FROM SyncStatus 
          WHERE entity_type = 'picklists'
        `);
        
        const picklistsRecordExists = recordResult.recordset[0].recordExists > 0;
        
        if (picklistsRecordExists) {
          // Update existing record
          await pool.request().query(`
            UPDATE SyncStatus 
            SET entity_name = 'picklists' 
            WHERE entity_type = 'picklists'
          `);
          console.log("Updated existing picklists entity in SyncStatus");
        } else {
          // Insert new record
          await pool.request().query(`
            INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
            VALUES ('picklists', 'picklists', '2025-01-01T00:00:00.000Z')
          `);
          console.log("Added picklists record to SyncStatus table");
        }
      } else {
        // Create SyncStatus table
        await pool.request().query(`
          CREATE TABLE SyncStatus (
            id INT IDENTITY(1,1) PRIMARY KEY,
            entity_name NVARCHAR(100) NOT NULL,
            entity_type NVARCHAR(100) NOT NULL,
            last_sync_date DATETIME,
            total_count INT,
            last_sync_count INT
          );
          
          INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
          VALUES ('picklists', 'picklists', '2025-01-01T00:00:00.000Z');
        `);
        console.log("Created SyncStatus table and added picklists record");
      }
      
      console.log("✅ Picklists database schema initialized successfully");
      return true;
    } catch (error) {
      console.error("❌ Error initializing picklists database schema:", error.message);
      throw error;
    }
  }

  /**
   * Get all picklists from Picqer with pagination
   * @param {Date} updatedSince - Only get picklists updated since this date
   * @returns {Promise<Array>} - Array of unique picklists
   */
  async getAllPicklists(updatedSince = null) {
    console.log("Fetching all picklists from Picqer...");
    
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
          const formattedDate = updatedSince
            .toISOString()
            .replace("T", " ")
            .substring(0, 19);
          params.updated_since = formattedDate;
        }
        
        // Make API request
        const response = await this.client.get("/picklists", { params });
        
        // Check if we have data
        if (
          response.data &&
          Array.isArray(response.data) &&
          response.data.length > 0
        ) {
          // Filter out duplicates before adding to our collection
          const newPicklists = response.data.filter((picklist) => {
            if (seenPicklistIds.has(picklist.idpicklist)) {
              return false; // Skip duplicate
            }
            seenPicklistIds.add(picklist.idpicklist);
            return true;
          });
          
          allPicklists = [...allPicklists, ...newPicklists];
          console.log(
            `Retrieved ${newPicklists.length} new picklists (total unique: ${allPicklists.length})`
          );
          
          // Check if we have more picklists
          hasMorePicklists = response.data.length === limit;
          
          // Increment offset for next page
          offset += limit;
          
          // Add a small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 500));
        } else {
          hasMorePicklists = false;
        }
      }
      
      console.log(
        `✅ Retrieved ${allPicklists.length} unique picklists from Picqer`
      );
      return allPicklists;
    } catch (error) {
      console.error("Error fetching picklists from Picqer:", error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log("Rate limit hit, waiting before retrying...");
        
        // Wait for 20 seconds before retrying
        await new Promise((resolve) => setTimeout(resolve, 20000));
        
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
   * Update the sync status for picklists
   * @param {string} lastSyncDate - ISO string of the last sync date
   * @param {number} totalCount - Total count of picklists in database
   * @param {number} lastSyncCount - Count of picklists in last sync
   * @returns {Promise<boolean>} - Success status
   */
  async updatePicklistsSyncStatus(
    lastSyncDate,
    totalCount = null,
    lastSyncCount = null
  ) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if picklists entity exists by entity_type
      const entityTypeResult = await pool.request().query(`
        SELECT COUNT(*) AS entityExists 
        FROM SyncStatus 
        WHERE entity_type = 'picklists'
      `);
      
      const entityTypeExists = entityTypeResult.recordset[0].entityExists > 0;
      
      if (entityTypeExists) {
        // Update existing record by entity_type
        await pool
          .request()
          .input("lastSyncDate", sql.DateTime, new Date(lastSyncDate))
          .input("totalCount", sql.Int, totalCount)
          .input("lastSyncCount", sql.Int, lastSyncCount)
          .query(`
            UPDATE SyncStatus SET
              entity_name = 'picklists',
              last_sync_date = @lastSyncDate,
              total_count = @totalCount,
              last_sync_count = @lastSyncCount
            WHERE entity_type = 'picklists'
          `);
        return true;
      } else {
        // Insert new record if it doesn't exist
        await pool
          .request()
          .input("entityName", sql.NVarChar, "picklists")
          .input("entityType", sql.NVarChar, "picklists")
          .input("lastSyncDate", sql.DateTime, new Date(lastSyncDate))
          .input("totalCount", sql.Int, totalCount)
          .input("lastSyncCount", sql.Int, lastSyncCount)
          .query(`
            INSERT INTO SyncStatus (
              entity_name, entity_type, last_sync_date, total_count, last_sync_count
            )
            VALUES (
              @entityName, @entityType, @lastSyncDate, @totalCount, @lastSyncCount
            )
          `);
        return true;
      }
    } catch (error) {
      console.error("Error updating picklists sync status:", error.message);
      return false;
    }
  }

  /**
   * Get picklist details from Picqer API
   * @param {number} idpicklist - Picklist ID
   * @returns {Promise<Object|null>} - Picklist details or null if not found
   */
  async getPicklistDetails(idpicklist) {
    try {
      console.log(`Fetching details for picklist ${idpicklist}...`);
      
      const response = await this.client.get(`/picklists/${idpicklist}`);
      
      if (response.data) {
        console.log(`Retrieved details for picklist ${idpicklist}`);
        return response.data;
      }
      
      return null;
    } catch (error) {
      console.error(
        `Error fetching details for picklist ${idpicklist}:`,
        error.message
      );
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log("Rate limit hit, waiting before retrying...");
        
        // Wait for 20 seconds before retrying
        await new Promise((resolve) => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getPicklistDetails(idpicklist);
      }
      
      // Return null on error to continue with other picklists
      return null;
    }
  }

  /**
   * Get picklist products from Picqer
   * @param {number} idpicklist - Picklist ID
   * @returns {Promise<Array>} - Array of picklist products
   */
  async getPicklistProducts(idpicklist) {
    try {
      console.log(`Fetching products for picklist ${idpicklist}...`);
      
      const response = await this.client.get(`/picklists/${idpicklist}/products`);
      
      if (response.data && Array.isArray(response.data)) {
        console.log(
          `Retrieved ${response.data.length} products for picklist ${idpicklist}`
        );
        return response.data;
      }
      
      return [];
    } catch (error) {
      console.error(
        `Error fetching products for picklist ${idpicklist}:`,
        error.message
      );
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log("Rate limit hit, waiting before retrying...");
        
        // Wait for 20 seconds before retrying
        await new Promise((resolve) => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getPicklistProducts(idpicklist);
      }
      
      // Return empty array on error to continue with other picklists
      return [];
    }
  }

  /**
   * Save picklist to database
   * @param {Object} picklist - Picklist to save
   * @returns {Promise<boolean>} - Success status
   */
  async savePicklistToDB(picklist) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if picklist already exists
      const checkResult = await pool
        .request()
        .input("idpicklist", sql.Int, picklist.idpicklist)
        .query("SELECT id FROM Picklists WHERE idpicklist = @idpicklist");
      
      const picklistExists = checkResult.recordset.length > 0;
      
      // Prepare request with all possible parameters
      const request = new sql.Request(pool);
      
      // Add parameters with proper null handling
      request.input("idpicklist", sql.Int, picklist.idpicklist);
      request.input("picklistid", sql.NVarChar, picklist.picklistid || "");
      request.input("idcustomer", sql.Int, picklist.idcustomer || null);
      request.input("idorder", sql.Int, picklist.idorder || null);
      request.input("idreturn", sql.Int, picklist.idreturn || null);
      request.input("idwarehouse", sql.Int, picklist.idwarehouse || null);
      request.input("idtemplate", sql.Int, picklist.idtemplate || null);
      request.input("idpicklist_batch", sql.Int, picklist.idpicklist_batch || null);
      request.input("idshippingprovider_profile", sql.Int, picklist.idshippingprovider_profile || null);
      request.input("idfulfilment", sql.Int, picklist.idfulfilment || null);
      request.input("idfulfilment_customer", sql.Int, picklist.idfulfilment_customer || null);
      request.input("iduser_assigned", sql.Int, picklist.iduser_assigned || null);
      request.input("iduser_processed", sql.Int, picklist.iduser_processed || null);
      request.input("iduser_cancelled", sql.Int, picklist.iduser_cancelled || null);
      request.input("deliveryname", sql.NVarChar, picklist.deliveryname || "");
      request.input("deliverycontact", sql.NVarChar, picklist.deliverycontact || null);
      request.input("deliveryaddress", sql.NVarChar, picklist.deliveryaddress || null);
      request.input("deliveryaddress2", sql.NVarChar, picklist.deliveryaddress2 || null);
      request.input("deliveryzipcode", sql.NVarChar, picklist.deliveryzipcode || null);
      request.input("deliverycity", sql.NVarChar, picklist.deliverycity || null);
      request.input("deliveryregion", sql.NVarChar, picklist.deliveryregion || null);
      request.input("deliverycountry", sql.NVarChar, picklist.deliverycountry || null);
      request.input("telephone", sql.NVarChar, picklist.telephone || null);
      request.input("emailaddress", sql.NVarChar, picklist.emailaddress || null);
      request.input("deliveryphone", sql.NVarChar, picklist.deliveryphone || null);
      request.input("deliveryemail", sql.NVarChar, picklist.deliveryemail || null);
      request.input("reference", sql.NVarChar, picklist.reference || null);
      request.input("notes", sql.NVarChar, picklist.notes || null);
      request.input("assigned_to_iduser", sql.Int, picklist.assigned_to_iduser || null);
      request.input("invoiced", sql.Bit, picklist.invoiced || null);
      request.input("urgent", sql.Bit, picklist.urgent || null);
      request.input("preferred_delivery_date", sql.Date, picklist.preferred_delivery_date ? new Date(picklist.preferred_delivery_date) : null);
      request.input("status", sql.NVarChar, picklist.status || "");
      request.input("totalproducts", sql.Int, picklist.totalproducts || null);
      request.input("totalpicked", sql.Int, picklist.totalpicked || null);
      request.input("weight", sql.Int, picklist.weight || null);
      request.input("snoozed_until", sql.DateTime, picklist.snoozed_until ? new Date(picklist.snoozed_until) : null);
      request.input("closed_by_iduser", sql.Int, picklist.closed_by_iduser || null);
      request.input("closed_at", sql.DateTime, picklist.closed_at ? new Date(picklist.closed_at) : null);
      request.input("created", sql.DateTime, picklist.created ? new Date(picklist.created) : null);
      request.input("updated", sql.DateTime, picklist.updated ? new Date(picklist.updated) : null);
      request.input("processed", sql.DateTime, picklist.processed ? new Date(picklist.processed) : null);
      request.input("cancelled", sql.DateTime, picklist.cancelled ? new Date(picklist.cancelled) : null);
      request.input("assigned", sql.DateTime, picklist.assigned ? new Date(picklist.assigned) : null);
      request.input("last_sync_date", sql.DateTime, new Date());
      
      if (picklistExists) {
        // Update existing picklist
        await request.query(`
          UPDATE Picklists 
          SET 
            picklistid = @picklistid,
            idcustomer = @idcustomer,
            idorder = @idorder,
            idreturn = @idreturn,
            idwarehouse = @idwarehouse,
            idtemplate = @idtemplate,
            idpicklist_batch = @idpicklist_batch,
            idshippingprovider_profile = @idshippingprovider_profile,
            idfulfilment = @idfulfilment,
            idfulfilment_customer = @idfulfilment_customer,
            iduser_assigned = @iduser_assigned,
            iduser_processed = @iduser_processed,
            iduser_cancelled = @iduser_cancelled,
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
            deliveryphone = @deliveryphone,
            deliveryemail = @deliveryemail,
            reference = @reference,
            notes = @notes,
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
            processed = @processed,
            cancelled = @cancelled,
            assigned = @assigned,
            last_sync_date = @last_sync_date
          WHERE idpicklist = @idpicklist
        `);
      } else {
        // Insert new picklist
        await request.query(`
          INSERT INTO Picklists (
            idpicklist, picklistid, idcustomer, idorder, idreturn, idwarehouse, idtemplate,
            idpicklist_batch, idshippingprovider_profile, idfulfilment, idfulfilment_customer,
            iduser_assigned, iduser_processed, iduser_cancelled, deliveryname, deliverycontact,
            deliveryaddress, deliveryaddress2, deliveryzipcode, deliverycity, deliveryregion,
            deliverycountry, telephone, emailaddress, deliveryphone, deliveryemail, reference,
            notes, assigned_to_iduser, invoiced, urgent, preferred_delivery_date, status,
            totalproducts, totalpicked, weight, snoozed_until, closed_by_iduser, closed_at,
            created, updated, processed, cancelled, assigned, last_sync_date
          )
          VALUES (
            @idpicklist, @picklistid, @idcustomer, @idorder, @idreturn, @idwarehouse, @idtemplate,
            @idpicklist_batch, @idshippingprovider_profile, @idfulfilment, @idfulfilment_customer,
            @iduser_assigned, @iduser_processed, @iduser_cancelled, @deliveryname, @deliverycontact,
            @deliveryaddress, @deliveryaddress2, @deliveryzipcode, @deliverycity, @deliveryregion,
            @deliverycountry, @telephone, @emailaddress, @deliveryphone, @deliveryemail, @reference,
            @notes, @assigned_to_iduser, @invoiced, @urgent, @preferred_delivery_date, @status,
            @totalproducts, @totalpicked, @weight, @snoozed_until, @closed_by_iduser, @closed_at,
            @created, @updated, @processed, @cancelled, @assigned, @last_sync_date
          )
        `);
      }
      
      return true;
    } catch (error) {
      console.error(
        `Error saving picklist ${picklist.idpicklist} to database:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Save picklist products to database
   * @param {number} idpicklist - Picklist ID
   * @param {Array} products - Array of picklist products
   * @returns {Promise<boolean>} - Success status
   */
  async savePicklistProductsToDB(idpicklist, products) {
    try {
      if (!products || products.length === 0) {
        return true;
      }
      
      const pool = await sql.connect(this.sqlConfig);
      
      // Delete existing products for this picklist
      await pool
        .request()
        .input("idpicklist", sql.Int, idpicklist)
        .query("DELETE FROM PicklistProducts WHERE idpicklist = @idpicklist");
      
      // Delete existing product locations for this picklist
      await pool
        .request()
        .input("idpicklist", sql.Int, idpicklist)
        .query("DELETE FROM PicklistProductLocations WHERE idpicklist = @idpicklist");
      
      // Insert new products
      for (const product of products) {
        // Skip invalid products
        if (!product || !product.idproduct) {
          console.warn("Invalid product data, missing idproduct:", product);
          continue;
        }
        
        const request = new sql.Request(pool);
        
        // Add parameters with proper null handling
        request.input("idpicklist", sql.Int, idpicklist);
        request.input("idpicklist_product", sql.Int, product.idpicklist_product || null);
        request.input("idpicklistproduct", sql.Int, product.idpicklistproduct || null);
        request.input("idproduct", sql.Int, product.idproduct);
        request.input("idorder_product", sql.Int, product.idorder_product || null);
        request.input("idreturn_product_replacement", sql.Int, product.idreturn_product_replacement || null);
        request.input("idvatgroup", sql.Int, product.idvatgroup || null);
        request.input("productcode", sql.NVarChar, product.productcode || "");
        request.input("name", sql.NVarChar, product.name || "");
        request.input("remarks", sql.NVarChar, product.remarks || null);
        request.input("amount", sql.Int, product.amount || 0);
        request.input("amount_picked", sql.Int, product.amount_picked || 0);
        request.input("amount_processed", sql.Int, product.amount_processed || 0);
        request.input("amount_cancelled", sql.Int, product.amount_cancelled || 0);
        request.input("price", sql.Decimal(18, 2), product.price || null);
        request.input("weight", sql.Int, product.weight || null);
        request.input("stocklocation", sql.NVarChar, product.stocklocation || null);
        request.input("partof_idpicklist_product", sql.Int, product.partof_idpicklist_product || null);
        request.input("has_parts", sql.Bit, product.has_parts || null);
        request.input("last_sync_date", sql.DateTime, new Date());
        
        // Insert picklist product
        await request.query(`
          INSERT INTO PicklistProducts (
            idpicklist, idpicklist_product, idpicklistproduct, idproduct, idorder_product,
            idreturn_product_replacement, idvatgroup, productcode, name, remarks,
            amount, amount_picked, amount_processed, amount_cancelled, price, weight,
            stocklocation, partof_idpicklist_product, has_parts, last_sync_date
          )
          VALUES (
            @idpicklist, @idpicklist_product, @idpicklistproduct, @idproduct, @idorder_product,
            @idreturn_product_replacement, @idvatgroup, @productcode, @name, @remarks,
            @amount, @amount_picked, @amount_processed, @amount_cancelled, @price, @weight,
            @stocklocation, @partof_idpicklist_product, @has_parts, @last_sync_date
          )
        `);
        
        // Insert product locations if available
        if (product.locations && Array.isArray(product.locations)) {
          for (const location of product.locations) {
            const locationRequest = new sql.Request(pool);
            
            locationRequest.input("idpicklist", sql.Int, idpicklist);
            locationRequest.input("idpicklist_product", sql.Int, product.idpicklist_product || null);
            locationRequest.input("idpicklistproduct", sql.Int, product.idpicklistproduct || null);
            locationRequest.input("idproduct", sql.Int, product.idproduct);
            locationRequest.input("idlocation", sql.Int, location.idlocation || null);
            locationRequest.input("location", sql.NVarChar, location.location || "");
            locationRequest.input("name", sql.NVarChar, location.name || null);
            locationRequest.input("amount", sql.Int, location.amount || 0);
            locationRequest.input("amount_processed", sql.Int, location.amount_processed || 0);
            locationRequest.input("amount_cancelled", sql.Int, location.amount_cancelled || 0);
            locationRequest.input("last_sync_date", sql.DateTime, new Date());
            
            await locationRequest.query(`
              INSERT INTO PicklistProductLocations (
                idpicklist, idpicklist_product, idpicklistproduct, idproduct, idlocation, location,
                name, amount, amount_processed, amount_cancelled, last_sync_date
              )
              VALUES (
                @idpicklist, @idpicklist_product, @idpicklistproduct, @idproduct, @idlocation, @location,
                @name, @amount, @amount_processed, @amount_cancelled, @last_sync_date
              )
            `);
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error(
        `Error saving products for picklist ${idpicklist} to database:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Sync picklists from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @returns {Promise<Object>} - Results of sync operation
   */
  async syncPicklists(fullSync = false) {
    try {
      console.log(`Starting ${fullSync ? "full" : "incremental"} picklist sync...`);
      
      let picklists;
      if (fullSync) {
        // Full sync: get all picklists
        picklists = await this.getAllPicklists();
      } else {
        // Incremental sync: get picklists updated since last sync
        const lastSyncDate = await this.getLastSyncDate();
        if (lastSyncDate) {
          console.log(`Last sync date: ${lastSyncDate.toISOString()}`);
          picklists = await this.getPicklistsUpdatedSince(lastSyncDate);
        } else {
          console.log("No last sync date found, performing full sync");
          picklists = await this.getAllPicklists();
        }
      }
      
      if (!picklists || picklists.length === 0) {
        console.log("No picklists to sync");
        return { success: true, savedPicklists: 0, savedProducts: 0 };
      }
      
      console.log(`Syncing ${picklists.length} picklists...`);
      
      let savedPicklists = 0;
      let savedProducts = 0;
      
      // Process each picklist
      for (const picklist of picklists) {
        try {
          // Get picklist details
          const picklistDetails = await this.getPicklistDetails(picklist.idpicklist);
          
          if (!picklistDetails) {
            console.warn(
              `Could not get details for picklist ${picklist.idpicklist}, skipping`
            );
            continue;
          }
          
          // Save picklist to database
          await this.savePicklistToDB(picklistDetails);
          savedPicklists++;
          
          // Get and save picklist products
          const products = await this.getPicklistProducts(picklist.idpicklist);
          
          if (products && products.length > 0) {
            await this.savePicklistProductsToDB(picklist.idpicklist, products);
            savedProducts += products.length;
          }
        } catch (picklistError) {
          console.error(
            `Error saving picklist ${picklist.idpicklist}:`,
            picklistError.message
          );
          // Continue with next picklist
        }
      }
      
      // Get total count of picklists in database
      const pool = await sql.connect(this.sqlConfig);
      const countResult = await pool
        .request()
        .query("SELECT COUNT(*) as count FROM Picklists");
      const totalCount = countResult.recordset[0].count;
      
      // Update sync status
      await this.updatePicklistsSyncStatus(
        new Date().toISOString(),
        totalCount,
        savedPicklists
      );
      
      console.log(
        `✅ Picklist sync completed: ${savedPicklists} picklists and ${savedProducts} products saved`
      );
      return {
        success: true,
        savedPicklists,
        savedProducts,
      };
    } catch (error) {
      console.error("Error in picklist sync:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = PicklistService;
