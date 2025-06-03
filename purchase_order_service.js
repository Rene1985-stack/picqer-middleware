/**
 * Purchase Order service for interacting with the Picqer API and syncing purchase orders to Azure SQL
 * Based on the Picqer API documentation: https://picqer.com/en/api/purchaseorders
 */
const axios = require("axios");
const sql = require("mssql");
const purchaseOrdersSchema = require("./purchase_orders_schema");

class PurchaseOrderService {
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
   * Get purchase order count from database
   * @returns {Promise<number>} - Number of purchase orders in database
   */
  async getPurchaseOrderCountFromDatabase() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool
        .request()
        .query("SELECT COUNT(*) as count FROM PurchaseOrders");
      return result.recordset[0].count;
    } catch (error) {
      console.error("Error getting purchase order count from database:", error.message);
      return 0;
    }
  }

  /**
   * Get last sync date for purchase orders
   * @returns {Promise<Date|null>} - Last sync date or null if never synced
   */
  async getLastSyncDate() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query(`
        SELECT last_sync_date 
        FROM SyncStatus 
        WHERE entity_type = 'purchaseorders'
      `);
      
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return new Date(result.recordset[0].last_sync_date);
      }
      
      return null;
    } catch (error) {
      console.error("Error getting last sync date for purchase orders:", error.message);
      return null;
    }
  }

  /**
   * Initialize the database with purchase orders schema
   * @returns {Promise<boolean>} - Success status
   */
  async initializePurchaseOrdersDatabase() {
    try {
      console.log("Initializing database with purchase orders schema...");
      const pool = await sql.connect(this.sqlConfig);
      
      // Create PurchaseOrders table if it doesn't exist
      await pool.request().query(purchaseOrdersSchema.createPurchaseOrdersTableSQL);
      
      // Create PurchaseOrderProducts table if it doesn't exist
      await pool.request().query(purchaseOrdersSchema.createPurchaseOrderProductsTableSQL);
      
      // Create PurchaseOrderComments table if it doesn't exist
      await pool.request().query(purchaseOrdersSchema.createPurchaseOrderCommentsTableSQL);
      
      // Update PurchaseOrders table with any missing columns
      await pool.request().query(purchaseOrdersSchema.updatePurchaseOrdersTableSQL);
      
      // Check if SyncStatus table exists
      const tableResult = await pool.request().query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'SyncStatus'
      `);
      
      const syncTableExists = tableResult.recordset[0].tableExists > 0;
      
      if (syncTableExists) {
        // Check if purchaseorders record exists
        const recordResult = await pool.request().query(`
          SELECT COUNT(*) AS recordExists 
          FROM SyncStatus 
          WHERE entity_type = 'purchaseorders'
        `);
        
        const purchaseOrdersRecordExists = recordResult.recordset[0].recordExists > 0;
        
        if (purchaseOrdersRecordExists) {
          // Update existing record
          await pool.request().query(`
            UPDATE SyncStatus 
            SET entity_name = 'purchaseorders' 
            WHERE entity_type = 'purchaseorders'
          `);
          console.log("Updated existing purchaseorders entity in SyncStatus");
        } else {
          // Insert new record
          await pool.request().query(`
            INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
            VALUES ('purchaseorders', 'purchaseorders', '2025-01-01T00:00:00.000Z')
          `);
          console.log("Added purchaseorders record to SyncStatus table");
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
          VALUES ('purchaseorders', 'purchaseorders', '2025-01-01T00:00:00.000Z');
        `);
        console.log("Created SyncStatus table and added purchaseorders record");
      }
      
      console.log("✅ Purchase orders database schema initialized successfully");
      return true;
    } catch (error) {
      console.error("❌ Error initializing purchase orders database schema:", error.message);
      throw error;
    }
  }

  /**
   * Create or get sync progress for resumable sync
   * @param {string} entityType - Entity type for sync progress
   * @param {boolean} isFullSync - Whether this is a full sync
   * @param {boolean} usesDaysParam - Whether days parameter is used
   * @returns {Promise<Object>} - Sync progress object
   */
  async createOrGetSyncProgress(entityType, isFullSync = false, usesDaysParam = false) {
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
        
        // Create a new sync progress record starting from offset 0
        const insertResult = await pool.request()
          .input('entityType', sql.NVarChar, entityType)
          .input('status', sql.NVarChar, 'in_progress')
          .input('offset', sql.Int, 0)
          .input('created', sql.DateTime, new Date())
          .input('lastUpdated', sql.DateTime, new Date())
          .query(`
            INSERT INTO SyncProgress (entity_type, status, offset, created, last_updated)
            OUTPUT INSERTED.id, INSERTED.entity_type, INSERTED.status, INSERTED.offset
            VALUES (@entityType, @status, @offset, @created, @lastUpdated)
          `);
        
        if (insertResult.recordset.length > 0) {
          const syncProgress = insertResult.recordset[0];
          console.log(`Created new sync progress record for ${entityType} with ID ${syncProgress.id} (starting from offset ${syncProgress.offset})`);
          return syncProgress;
        }
      } else {
        // For incremental sync, check if there's an in-progress sync
        const result = await pool.request()
          .input('entityType', sql.NVarChar, entityType)
          .query(`
            SELECT id, entity_type, status, offset
            FROM SyncProgress
            WHERE entity_type = @entityType AND status = 'in_progress'
            ORDER BY created DESC
          `);
        
        if (result.recordset.length > 0) {
          const syncProgress = result.recordset[0];
          console.log(`Found in-progress sync for ${entityType} with ID ${syncProgress.id} (resuming from offset ${syncProgress.offset})`);
          return syncProgress;
        } else {
          // No in-progress sync, create a new one
          const insertResult = await pool.request()
            .input('entityType', sql.NVarChar, entityType)
            .input('status', sql.NVarChar, 'in_progress')
            .input('offset', sql.Int, 0)
            .input('created', sql.DateTime, new Date())
            .input('lastUpdated', sql.DateTime, new Date())
            .query(`
              INSERT INTO SyncProgress (entity_type, status, offset, created, last_updated)
              OUTPUT INSERTED.id, INSERTED.entity_type, INSERTED.status, INSERTED.offset
              VALUES (@entityType, @status, @offset, @created, @lastUpdated)
            `);
          
          if (insertResult.recordset.length > 0) {
            const syncProgress = insertResult.recordset[0];
            console.log(`Created new sync progress record for ${entityType} with ID ${syncProgress.id} (starting from offset ${syncProgress.offset})`);
            return syncProgress;
          }
        }
      }
      
      // If we get here, something went wrong
      console.warn(`Could not create or get sync progress for ${entityType}, creating default`);
      return { id: null, entity_type: entityType, status: 'in_progress', offset: 0 };
    } catch (error) {
      console.error(`Error creating or getting sync progress for ${entityType}:`, error.message);
      return { id: null, entity_type: entityType, status: 'in_progress', offset: 0 };
    }
  }

  /**
   * Update sync progress
   * @param {string} id - Sync progress ID
   * @param {number} offset - Current offset
   * @param {string} status - Current status
   * @returns {Promise<boolean>} - Success status
   */
  async updateSyncProgress(id, offset, status = 'in_progress') {
    if (!id) return false;
    
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      await pool.request()
        .input('id', sql.NVarChar, id)
        .input('offset', sql.Int, offset)
        .input('status', sql.NVarChar, status)
        .input('lastUpdated', sql.DateTime, new Date())
        .query(`
          UPDATE SyncProgress
          SET offset = @offset, status = @status, last_updated = @lastUpdated
          WHERE id = @id
        `);
      
      return true;
    } catch (error) {
      console.error(`Error updating sync progress ${id}:`, error.message);
      return false;
    }
  }

  /**
   * Get all purchase orders from Picqer with pagination
   * @param {Date} updatedSince - Only get purchase orders updated since this date
   * @param {Object} syncProgress - Sync progress object for resumable sync
   * @param {Date} cutoffDate - Cutoff date for days parameter filtering
   * @returns {Promise<Array>} - Array of unique purchase orders
   */
  async getAllPurchaseOrders(updatedSince = null, syncProgress = null, cutoffDate = null) {
    console.log("Fetching all purchase orders from Picqer...");
    
    let allPurchaseOrders = [];
    let offset = syncProgress ? syncProgress.offset : 0;
    const limit = 100; // Picqer's default page size
    let hasMorePurchaseOrders = true;
    let foundOlderPurchaseOrder = false;
    
    // Track unique purchase order IDs to prevent duplicates
    const seenPurchaseOrderIds = new Set();
    
    try {
      while (hasMorePurchaseOrders && !foundOlderPurchaseOrder) {
        console.log(`Fetching purchase orders with offset ${offset}...`);
        
        // Build query parameters - use offset and limit
        const params = { offset, limit };
        
        // Add updated_since parameter if provided
        if (updatedSince) {
          const formattedDate = updatedSince
            .toISOString()
            .replace("T", " ")
            .substring(0, 19);
          params.updated_after = formattedDate;
        }
        
        // Make API request
        const response = await this.client.get("/purchaseorders", { params });
        
        // Check if we have data
        if (
          response.data &&
          Array.isArray(response.data) &&
          response.data.length > 0
        ) {
          // Filter out duplicates before adding to our collection
          const newPurchaseOrders = response.data.filter((purchaseOrder) => {
            if (seenPurchaseOrderIds.has(purchaseOrder.idpurchaseorder)) {
              return false; // Skip duplicate
            }
            seenPurchaseOrderIds.add(purchaseOrder.idpurchaseorder);
            return true;
          });
          
          // If we have a cutoff date (days parameter), check if we've reached older purchase orders
          if (cutoffDate && newPurchaseOrders.length > 0) {
            // Sort purchase orders by updated date (newest first)
            newPurchaseOrders.sort((a, b) => {
              return new Date(b.updated) - new Date(a.updated);
            });
            
            // Check if the oldest purchase order in this page is older than cutoff date
            const oldestPurchaseOrderInPage = newPurchaseOrders[newPurchaseOrders.length - 1];
            if (oldestPurchaseOrderInPage && oldestPurchaseOrderInPage.updated) {
              const oldestDate = new Date(oldestPurchaseOrderInPage.updated);
              if (oldestDate < cutoffDate) {
                console.log(`Found purchase order older than cutoff date (${oldestPurchaseOrderInPage.updated}), stopping pagination`);
                
                // Filter out purchase orders older than cutoff date
                const recentPurchaseOrders = newPurchaseOrders.filter(purchaseOrder => {
                  if (!purchaseOrder.updated) return false;
                  const purchaseOrderDate = new Date(purchaseOrder.updated);
                  return purchaseOrderDate >= cutoffDate;
                });
                
                // Add only recent purchase orders to our collection
                allPurchaseOrders = [...allPurchaseOrders, ...recentPurchaseOrders];
                
                console.log(`Added ${recentPurchaseOrders.length} recent purchase orders (filtered out ${newPurchaseOrders.length - recentPurchaseOrders.length} older purchase orders)`);
                
                // Stop pagination
                foundOlderPurchaseOrder = true;
                hasMorePurchaseOrders = false;
                break;
              }
            }
          }
          
          // If we're not filtering by date or all purchase orders are recent enough, add them all
          if (!foundOlderPurchaseOrder) {
            allPurchaseOrders = [...allPurchaseOrders, ...newPurchaseOrders];
            console.log(
              `Retrieved ${newPurchaseOrders.length} new purchase orders (total unique: ${allPurchaseOrders.length})`
            );
          }
          
          // Update sync progress if provided
          if (syncProgress && syncProgress.id) {
            await this.updateSyncProgress(syncProgress.id, offset + limit);
          }
          
          // Check if we have more purchase orders
          hasMorePurchaseOrders = response.data.length === limit;
          
          // Increment offset for next page
          offset += limit;
          
          // Add a small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 500));
        } else {
          hasMorePurchaseOrders = false;
        }
      }
      
      // Mark sync progress as completed if provided
      if (syncProgress && syncProgress.id) {
        await this.updateSyncProgress(syncProgress.id, offset, 'completed');
      }
      
      console.log(
        `✅ Retrieved ${allPurchaseOrders.length} unique purchase orders from Picqer`
      );
      return allPurchaseOrders;
    } catch (error) {
      console.error("Error fetching purchase orders from Picqer:", error.message);
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log("Rate limit hit, waiting before retrying...");
        
        // Wait for 20 seconds before retrying
        await new Promise((resolve) => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getAllPurchaseOrders(updatedSince, syncProgress, cutoffDate);
      }
      
      throw error;
    }
  }

  /**
   * Get purchase orders updated since a specific date
   * @param {Date} date - The date to check updates from
   * @param {Object} syncProgress - Sync progress object for resumable sync
   * @param {Date} cutoffDate - Cutoff date for days parameter filtering
   * @returns {Promise<Array>} - Array of updated purchase orders
   */
  async getPurchaseOrdersUpdatedSince(date, syncProgress = null, cutoffDate = null) {
    return this.getAllPurchaseOrders(date, syncProgress, cutoffDate);
  }

  /**
   * Update the sync status for purchase orders
   * @param {string} lastSyncDate - ISO string of the last sync date
   * @param {number} totalCount - Total count of purchase orders in database
   * @param {number} lastSyncCount - Count of purchase orders in last sync
   * @returns {Promise<boolean>} - Success status
   */
  async updatePurchaseOrdersSyncStatus(
    lastSyncDate,
    totalCount = null,
    lastSyncCount = null
  ) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if purchase orders entity exists by entity_type
      const entityTypeResult = await pool.request().query(`
        SELECT COUNT(*) AS entityExists 
        FROM SyncStatus 
        WHERE entity_type = 'purchaseorders'
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
              entity_name = 'purchaseorders',
              last_sync_date = @lastSyncDate,
              total_count = @totalCount,
              last_sync_count = @lastSyncCount
            WHERE entity_type = 'purchaseorders'
          `);
        return true;
      } else {
        // Insert new record if it doesn't exist
        await pool
          .request()
          .input("entityName", sql.NVarChar, "purchaseorders")
          .input("entityType", sql.NVarChar, "purchaseorders")
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
      console.error("Error updating purchase orders sync status:", error.message);
      return false;
    }
  }

  /**
   * Get purchase order details from Picqer API
   * @param {number} idpurchaseorder - Purchase Order ID
   * @returns {Promise<Object|null>} - Purchase order details or null if not found
   */
  async getPurchaseOrderDetails(idpurchaseorder) {
    try {
      console.log(`Fetching details for purchase order ${idpurchaseorder}...`);
      
      const response = await this.client.get(`/purchaseorders/${idpurchaseorder}`);
      
      if (response.data) {
        console.log(`Retrieved details for purchase order ${idpurchaseorder}`);
        return response.data;
      }
      
      return null;
    } catch (error) {
      console.error(
        `Error fetching details for purchase order ${idpurchaseorder}:`,
        error.message
      );
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log("Rate limit hit, waiting before retrying...");
        
        // Wait for 20 seconds before retrying
        await new Promise((resolve) => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getPurchaseOrderDetails(idpurchaseorder);
      }
      
      // Return null on error to continue with other purchase orders
      return null;
    }
  }

  /**
   * Get purchase order comments from Picqer
   * @param {number} idpurchaseorder - Purchase Order ID
   * @returns {Promise<Array>} - Array of purchase order comments
   */
  async getPurchaseOrderComments(idpurchaseorder) {
    try {
      console.log(`Fetching comments for purchase order ${idpurchaseorder}...`);
      
      const response = await this.client.get(`/purchaseorders/${idpurchaseorder}/comments`);
      
      if (response.data && Array.isArray(response.data)) {
        console.log(
          `Retrieved ${response.data.length} comments for purchase order ${idpurchaseorder}`
        );
        return response.data;
      }
      
      return [];
    } catch (error) {
      console.error(
        `Error fetching comments for purchase order ${idpurchaseorder}:`,
        error.message
      );
      
      // Handle rate limiting (429 Too Many Requests)
      if (error.response && error.response.status === 429) {
        console.log("Rate limit hit, waiting before retrying...");
        
        // Wait for 20 seconds before retrying
        await new Promise((resolve) => setTimeout(resolve, 20000));
        
        // Retry the request
        return this.getPurchaseOrderComments(idpurchaseorder);
      }
      
      // Return empty array on error to continue with other purchase orders
      return [];
    }
  }

  /**
   * Save purchase order to database
   * @param {Object} purchaseOrder - Purchase order to save
   * @returns {Promise<boolean>} - Success status
   */
  async savePurchaseOrderToDB(purchaseOrder) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Check if purchase order already exists
      const checkResult = await pool
        .request()
        .input("idpurchaseorder", sql.Int, purchaseOrder.idpurchaseorder)
        .query("SELECT id FROM PurchaseOrders WHERE idpurchaseorder = @idpurchaseorder");
      
      const purchaseOrderExists = checkResult.recordset.length > 0;
      
      // Prepare request with all possible parameters
      const request = new sql.Request(pool);
      
      // Add parameters with proper null handling
      request.input("idpurchaseorder", sql.Int, purchaseOrder.idpurchaseorder);
      request.input("idsupplier", sql.Int, purchaseOrder.idsupplier || null);
      request.input("idtemplate", sql.Int, purchaseOrder.idtemplate || null);
      request.input("idwarehouse", sql.Int, purchaseOrder.idwarehouse || null);
      request.input("idfulfilment_customer", sql.Int, purchaseOrder.idfulfilment_customer || null);
      request.input("purchaseorderid", sql.NVarChar, purchaseOrder.purchaseorderid || "");
      request.input("supplier_name", sql.NVarChar, purchaseOrder.supplier_name || null);
      request.input("supplier_orderid", sql.NVarChar, purchaseOrder.supplier_orderid || null);
      request.input("status", sql.NVarChar, purchaseOrder.status || "");
      request.input("remarks", sql.NVarChar, purchaseOrder.remarks || null);
      request.input("delivery_date", sql.Date, purchaseOrder.delivery_date ? new Date(purchaseOrder.delivery_date) : null);
      request.input("language", sql.NVarChar, purchaseOrder.language || null);
      request.input("created", sql.DateTime, purchaseOrder.created ? new Date(purchaseOrder.created) : null);
      request.input("updated", sql.DateTime, purchaseOrder.updated ? new Date(purchaseOrder.updated) : null);
      request.input("last_sync_date", sql.DateTime, new Date());
      
      if (purchaseOrderExists) {
        // Update existing purchase order
        await request.query(`
          UPDATE PurchaseOrders 
          SET 
            idsupplier = @idsupplier,
            idtemplate = @idtemplate,
            idwarehouse = @idwarehouse,
            idfulfilment_customer = @idfulfilment_customer,
            purchaseorderid = @purchaseorderid,
            supplier_name = @supplier_name,
            supplier_orderid = @supplier_orderid,
            status = @status,
            remarks = @remarks,
            delivery_date = @delivery_date,
            language = @language,
            created = @created,
            updated = @updated,
            last_sync_date = @last_sync_date
          WHERE idpurchaseorder = @idpurchaseorder
        `);
      } else {
        // Insert new purchase order
        await request.query(`
          INSERT INTO PurchaseOrders (
            idpurchaseorder, idsupplier, idtemplate, idwarehouse, idfulfilment_customer,
            purchaseorderid, supplier_name, supplier_orderid, status, remarks,
            delivery_date, language, created, updated, last_sync_date
          )
          VALUES (
            @idpurchaseorder, @idsupplier, @idtemplate, @idwarehouse, @idfulfilment_customer,
            @purchaseorderid, @supplier_name, @supplier_orderid, @status, @remarks,
            @delivery_date, @language, @created, @updated, @last_sync_date
          )
        `);
      }
      
      return true;
    } catch (error) {
      console.error(
        `Error saving purchase order ${purchaseOrder.idpurchaseorder} to database:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Save purchase order products to database
   * @param {number} idpurchaseorder - Purchase Order ID
   * @param {Array} products - Array of purchase order products
   * @returns {Promise<boolean>} - Success status
   */
  async savePurchaseOrderProductsToDB(idpurchaseorder, products) {
    try {
      if (!products || products.length === 0) {
        return true;
      }
      
      const pool = await sql.connect(this.sqlConfig);
      
      // Delete existing products for this purchase order
      await pool
        .request()
        .input("idpurchaseorder", sql.Int, idpurchaseorder)
        .query("DELETE FROM PurchaseOrderProducts WHERE idpurchaseorder = @idpurchaseorder");
      
      // Insert new products
      for (const product of products) {
        // Skip invalid products
        if (!product || !product.idproduct) {
          console.warn("Invalid product data, missing idproduct:", product);
          continue;
        }
        
        const request = new sql.Request(pool);
        
        // Add parameters with proper null handling
        request.input("idpurchaseorder", sql.Int, idpurchaseorder);
        request.input("idpurchaseorder_product", sql.Int, product.idpurchaseorder_product || null);
        request.input("idproduct", sql.Int, product.idproduct);
        request.input("idvatgroup", sql.Int, product.idvatgroup || null);
        request.input("productcode", sql.NVarChar, product.productcode || "");
        request.input("productcode_supplier", sql.NVarChar, product.productcode_supplier || null);
        request.input("name", sql.NVarChar, product.name || "");
        request.input("price", sql.Decimal(18, 2), product.price || null);
        request.input("amount", sql.Int, product.amount || 0);
        request.input("amountreceived", sql.Int, product.amountreceived || 0);
        request.input("delivery_date", sql.Date, product.delivery_date ? new Date(product.delivery_date) : null);
        request.input("weight", sql.Int, product.weight || null);
        request.input("last_sync_date", sql.DateTime, new Date());
        
        // Insert purchase order product
        await request.query(`
          INSERT INTO PurchaseOrderProducts (
            idpurchaseorder, idpurchaseorder_product, idproduct, idvatgroup,
            productcode, productcode_supplier, name, price, amount, amountreceived,
            delivery_date, weight, last_sync_date
          )
          VALUES (
            @idpurchaseorder, @idpurchaseorder_product, @idproduct, @idvatgroup,
            @productcode, @productcode_supplier, @name, @price, @amount, @amountreceived,
            @delivery_date, @weight, @last_sync_date
          )
        `);
      }
      
      return true;
    } catch (error) {
      console.error(
        `Error saving products for purchase order ${idpurchaseorder} to database:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Save purchase order comments to database
   * @param {number} idpurchaseorder - Purchase Order ID
   * @param {Array} comments - Array of purchase order comments
   * @returns {Promise<boolean>} - Success status
   */
  async savePurchaseOrderCommentsToDB(idpurchaseorder, comments) {
    try {
      if (!comments || comments.length === 0) {
        return true;
      }
      
      const pool = await sql.connect(this.sqlConfig);
      
      // Delete existing comments for this purchase order
      await pool
        .request()
        .input("idpurchaseorder", sql.Int, idpurchaseorder)
        .query("DELETE FROM PurchaseOrderComments WHERE idpurchaseorder = @idpurchaseorder");
      
      // Insert new comments
      for (const comment of comments) {
        // Skip invalid comments
        if (!comment || !comment.idpurchaseorder_comment) {
          console.warn("Invalid comment data, missing idpurchaseorder_comment:", comment);
          continue;
        }
        
        const request = new sql.Request(pool);
        
        // Add parameters with proper null handling
        request.input("idpurchaseorder", sql.Int, idpurchaseorder);
        request.input("idpurchaseorder_comment", sql.Int, comment.idpurchaseorder_comment);
        request.input("iduser", sql.Int, comment.iduser || null);
        request.input("user_fullname", sql.NVarChar, comment.user_fullname || null);
        request.input("comment", sql.NVarChar, comment.comment || null);
        request.input("created", sql.DateTime, comment.created ? new Date(comment.created) : null);
        request.input("last_sync_date", sql.DateTime, new Date());
        
        // Insert purchase order comment
        await request.query(`
          INSERT INTO PurchaseOrderComments (
            idpurchaseorder, idpurchaseorder_comment, iduser, user_fullname,
            comment, created, last_sync_date
          )
          VALUES (
            @idpurchaseorder, @idpurchaseorder_comment, @iduser, @user_fullname,
            @comment, @created, @last_sync_date
          )
        `);
      }
      
      return true;
    } catch (error) {
      console.error(
        `Error saving comments for purchase order ${idpurchaseorder} to database:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Sync purchase orders from Picqer to database
   * @param {boolean} fullSync - Whether to perform a full sync
   * @param {number} days - Number of days to sync (optional)
   * @returns {Promise<Object>} - Results of sync operation
   */
  async syncPurchaseOrders(fullSync = false, days = null) {
    try {
      // Determine if we're using the days parameter
      const usesDaysParam = days !== null && !isNaN(days) && days > 0;
      
      // Calculate cutoff date if days parameter is provided
      let cutoffDate = null;
      if (usesDaysParam) {
        cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        cutoffDate.setHours(0, 0, 0, 0); // Start of the day
        console.log(`Using cutoff date for optimization: ${cutoffDate.toISOString()}`);
        console.log(`Syncing purchase orders from the last ${days} days using PurchaseOrderService directly`);
      }
      
      console.log(`Starting ${fullSync ? "full" : "incremental"} purchase order sync...`);
      
      // Create or get sync progress for resumable sync
      const syncProgress = await this.createOrGetSyncProgress('purchaseorders', fullSync, usesDaysParam);
      
      let purchaseOrders;
      if (fullSync) {
        // Full sync: get all purchase orders
        purchaseOrders = await this.getAllPurchaseOrders(null, syncProgress, cutoffDate);
      } else if (usesDaysParam) {
        // Days parameter sync: get purchase orders updated since cutoff date
        console.log(`Starting incremental purchase order sync for last ${days} days...`);
        console.log(`Using custom date range: syncing purchase orders updated since ${cutoffDate.toISOString()}`);
        purchaseOrders = await this.getAllPurchaseOrders(cutoffDate, syncProgress, cutoffDate);
      } else {
        // Incremental sync: get purchase orders updated since last sync
        const lastSyncDate = await this.getLastSyncDate();
        if (lastSyncDate) {
          console.log(`Last sync date: ${lastSyncDate.toISOString()}`);
          purchaseOrders = await this.getPurchaseOrdersUpdatedSince(lastSyncDate, syncProgress);
        } else {
          console.log("No last sync date found, performing full sync");
          purchaseOrders = await this.getAllPurchaseOrders(null, syncProgress);
        }
      }
      
      if (!purchaseOrders || purchaseOrders.length === 0) {
        console.log("No purchase orders to sync");
        return { success: true, savedPurchaseOrders: 0, savedProducts: 0, savedComments: 0 };
      }
      
      console.log(`Syncing ${purchaseOrders.length} purchase orders...`);
      
      let savedPurchaseOrders = 0;
      let savedProducts = 0;
      let savedComments = 0;
      
      // Process each purchase order
      for (const purchaseOrder of purchaseOrders) {
        try {
          // Get purchase order details if products array is not included
          let purchaseOrderDetails = purchaseOrder;
          if (!purchaseOrder.products || !Array.isArray(purchaseOrder.products)) {
            purchaseOrderDetails = await this.getPurchaseOrderDetails(purchaseOrder.idpurchaseorder);
            
            if (!purchaseOrderDetails) {
              console.warn(
                `Could not get details for purchase order ${purchaseOrder.idpurchaseorder}, skipping`
              );
              continue;
            }
          }
          
          // Save purchase order to database
          await this.savePurchaseOrderToDB(purchaseOrderDetails);
          savedPurchaseOrders++;
          
          // Save purchase order products
          if (purchaseOrderDetails.products && purchaseOrderDetails.products.length > 0) {
            await this.savePurchaseOrderProductsToDB(purchaseOrderDetails.idpurchaseorder, purchaseOrderDetails.products);
            savedProducts += purchaseOrderDetails.products.length;
          }
          
          // Get and save purchase order comments
          const comments = await this.getPurchaseOrderComments(purchaseOrderDetails.idpurchaseorder);
          
          if (comments && comments.length > 0) {
            await this.savePurchaseOrderCommentsToDB(purchaseOrderDetails.idpurchaseorder, comments);
            savedComments += comments.length;
          }
        } catch (purchaseOrderError) {
          console.error(
            `Error saving purchase order ${purchaseOrder.idpurchaseorder}:`,
            purchaseOrderError.message
          );
          // Continue with next purchase order
        }
      }
      
      // Get total count of purchase orders in database
      const pool = await sql.connect(this.sqlConfig);
      const countResult = await pool
        .request()
        .query("SELECT COUNT(*) as count FROM PurchaseOrders");
      const totalCount = countResult.recordset[0].count;
      
      // Update sync status
      await this.updatePurchaseOrdersSyncStatus(
        new Date().toISOString(),
        totalCount,
        savedPurchaseOrders
      );
      
      console.log(
        `✅ Purchase order sync completed: ${savedPurchaseOrders} purchase orders, ${savedProducts} products, and ${savedComments} comments saved`
      );
      return {
        success: true,
        savedPurchaseOrders,
        savedProducts,
        savedComments
      };
    } catch (error) {
      console.error("Error in purchase order sync:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = PurchaseOrderService;
