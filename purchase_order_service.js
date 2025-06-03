/**
 * Purchase Order service for interacting with the Picqer API and syncing purchase orders to Azure SQL
 * Based on the Picqer API documentation: https://picqer.com/en/api/purchaseorders
 * OPTIMIZED VERSION - Uses products data included in purchase orders response
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
      
      // Create PurchaseOrderComments table if it doesn't exist (optional)
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
   * Get all purchase orders from Picqer with pagination (OPTIMIZED VERSION)
   * @param {Date} updatedSince - Only get purchase orders updated since this date
   * @param {Object} syncProgress - Sync progress object for resumable sync
   * @param {Date} cutoffDate - Cutoff date for days parameter filtering
   * @returns {Promise<Array>} - Array of unique purchase orders with products included
   */
  async getAllPurchaseOrders(updatedSince = null, syncProgress = null, cutoffDate = null) {
    console.log("Fetching all purchase orders from Picqer (with products included)...");
    
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
        
        // Make API request - this already includes products in the response!
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
              `Retrieved ${newPurchaseOrders.length} new purchase orders with products (total unique: ${allPurchaseOrders.length})`
            );
          }
          
          // Update sync progress if provided
          if (syncProgress && syncProgress.id) {
            await this.updateSyncProgress(syncProgress.id, offset + limit);
          }
          
          // Check if we have fewer purchase orders than the limit (last page)
          if (response.data.length < limit) {
            hasMorePurchaseOrders = false;
            console.log("Reached last page of purchase orders");
          } else {
            // Move to next page
            offset += limit;
          }
        } else {
          // No more purchase orders
          hasMorePurchaseOrders = false;
          console.log("No more purchase orders to fetch");
        }
      }
      
      console.log(`✅ Fetched ${allPurchaseOrders.length} unique purchase orders with products included`);
      return allPurchaseOrders;
    } catch (error) {
      console.error("❌ Error fetching purchase orders from Picqer:", error.message);
      throw error;
    }
  }

  /**
   * Save purchase orders to database (OPTIMIZED VERSION)
   * @param {Array} purchaseOrders - Array of purchase orders with products included
   * @returns {Promise<boolean>} - Success status
   */
  async savePurchaseOrdersToDatabase(purchaseOrders) {
    if (!purchaseOrders || purchaseOrders.length === 0) {
      console.log("No purchase orders to save");
      return true;
    }

    console.log(`Saving ${purchaseOrders.length} purchase orders to database...`);

    try {
      const pool = await sql.connect(this.sqlConfig);
      let savedPurchaseOrders = 0;
      let savedProducts = 0;

      for (const purchaseOrder of purchaseOrders) {
        try {
          // Save purchase order
          await pool
            .request()
            .input("idpurchaseorder", sql.Int, purchaseOrder.idpurchaseorder)
            .input("idsupplier", sql.Int, purchaseOrder.idsupplier || null)
            .input("idtemplate", sql.Int, purchaseOrder.idtemplate || null)
            .input("idwarehouse", sql.Int, purchaseOrder.idwarehouse || null)
            .input("idfulfillment_customer", sql.Int, purchaseOrder.idfulfillment_customer || null)
            .input("purchaseorderid", sql.NVarChar, purchaseOrder.purchaseorderid || null)
            .input("supplier_name", sql.NVarChar, purchaseOrder.supplier_name || null)
            .input("supplier_orderid", sql.NVarChar, purchaseOrder.supplier_orderid || null)
            .input("status", sql.NVarChar, purchaseOrder.status || null)
            .input("remarks", sql.NVarChar, purchaseOrder.remarks || null)
            .input("delivery_date", sql.DateTime, purchaseOrder.delivery_date ? new Date(purchaseOrder.delivery_date) : null)
            .input("language", sql.NVarChar, purchaseOrder.language || null)
            .input("created", sql.DateTime, purchaseOrder.created ? new Date(purchaseOrder.created) : null)
            .input("updated", sql.DateTime, purchaseOrder.updated ? new Date(purchaseOrder.updated) : null)
            .input("last_sync_date", sql.DateTime, new Date())
            .input("product_count", sql.Int, purchaseOrder.products ? purchaseOrder.products.length : 0)
            .input("comment_count", sql.Int, 0) // We're not fetching comments anymore
            .query(`
              MERGE PurchaseOrders AS target
              USING (SELECT @idpurchaseorder AS idpurchaseorder) AS source
              ON target.idpurchaseorder = source.idpurchaseorder
              WHEN MATCHED THEN
                UPDATE SET
                  idsupplier = @idsupplier,
                  idtemplate = @idtemplate,
                  idwarehouse = @idwarehouse,
                  idfulfillment_customer = @idfulfillment_customer,
                  purchaseorderid = @purchaseorderid,
                  supplier_name = @supplier_name,
                  supplier_orderid = @supplier_orderid,
                  status = @status,
                  remarks = @remarks,
                  delivery_date = @delivery_date,
                  language = @language,
                  created = @created,
                  updated = @updated,
                  last_sync_date = @last_sync_date,
                  product_count = @product_count,
                  comment_count = @comment_count
              WHEN NOT MATCHED THEN
                INSERT (idpurchaseorder, idsupplier, idtemplate, idwarehouse, idfulfillment_customer, 
                       purchaseorderid, supplier_name, supplier_orderid, status, remarks, delivery_date, 
                       language, created, updated, last_sync_date, product_count, comment_count)
                VALUES (@idpurchaseorder, @idsupplier, @idtemplate, @idwarehouse, @idfulfillment_customer,
                       @purchaseorderid, @supplier_name, @supplier_orderid, @status, @remarks, @delivery_date,
                       @language, @created, @updated, @last_sync_date, @product_count, @comment_count);
            `);

          savedPurchaseOrders++;

          // Save products directly from the purchase order response (OPTIMIZED!)
          if (purchaseOrder.products && Array.isArray(purchaseOrder.products)) {
            for (const product of purchaseOrder.products) {
              try {
                await pool
                  .request()
                  .input("idpurchaseorder", sql.Int, purchaseOrder.idpurchaseorder)
                  .input("idproduct", sql.Int, product.idproduct || null)
                  .input("idvatgroup", sql.Int, product.idvatgroup || null)
                  .input("productcode", sql.NVarChar, product.productcode || null)
                  .input("productcode_supplier", sql.NVarChar, product.productcode_supplier || null)
                  .input("name", sql.NVarChar, product.name || null)
                  .input("price", sql.Decimal(10, 2), product.price || null)
                  .input("amount", sql.Int, product.amount || null)
                  .input("amountreceived", sql.Int, product.amountreceived || null)
                  .input("weight", sql.Int, product.weight || null)
                  .input("last_sync_date", sql.DateTime, new Date())
                  .query(`
                    MERGE PurchaseOrderProducts AS target
                    USING (SELECT @idpurchaseorder AS idpurchaseorder, @idproduct AS idproduct) AS source
                    ON target.idpurchaseorder = source.idpurchaseorder AND target.idproduct = source.idproduct
                    WHEN MATCHED THEN
                      UPDATE SET
                        idvatgroup = @idvatgroup,
                        productcode = @productcode,
                        productcode_supplier = @productcode_supplier,
                        name = @name,
                        price = @price,
                        amount = @amount,
                        amountreceived = @amountreceived,
                        weight = @weight,
                        last_sync_date = @last_sync_date
                    WHEN NOT MATCHED THEN
                      INSERT (idpurchaseorder, idproduct, idvatgroup, productcode, productcode_supplier, 
                             name, price, amount, amountreceived, weight, last_sync_date)
                      VALUES (@idpurchaseorder, @idproduct, @idvatgroup, @productcode, @productcode_supplier,
                             @name, @price, @amount, @amountreceived, @weight, @last_sync_date);
                  `);

                savedProducts++;
              } catch (productError) {
                console.error(`Error saving product ${product.idproduct} for purchase order ${purchaseOrder.idpurchaseorder}:`, productError.message);
              }
            }
          }
        } catch (purchaseOrderError) {
          console.error(`Error saving purchase order ${purchaseOrder.idpurchaseorder}:`, purchaseOrderError.message);
        }
      }

      console.log(`✅ Saved ${savedPurchaseOrders} purchase orders and ${savedProducts} products to database`);
      return true;
    } catch (error) {
      console.error("❌ Error saving purchase orders to database:", error.message);
      throw error;
    }
  }

  /**
   * Sync purchase orders incrementally (OPTIMIZED VERSION)
   * @param {number} days - Number of days to sync (optional)
   * @param {boolean} full - Whether to do a full sync
   * @returns {Promise<Object>} - Sync result
   */
  async syncPurchaseOrdersIncremental(days = null, full = false) {
    console.log("Received request to incrementally sync purchase orders");
    
    try {
      // Initialize database first
      await this.initializePurchaseOrdersDatabase();
      
      let updatedSince = null;
      let cutoffDate = null;
      let usesDaysParam = false;
      
      if (days && days > 0) {
        // Use days parameter - sync purchase orders from the last X days
        cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        updatedSince = cutoffDate;
        usesDaysParam = true;
        console.log(`Syncing purchase orders from the last ${days} days (since ${cutoffDate.toISOString()})`);
      } else if (!full) {
        // Get last sync date for incremental sync
        updatedSince = await this.getLastSyncDate();
        if (!updatedSince) {
          // If no last sync date, default to 1 day ago
          updatedSince = new Date();
          updatedSince.setDate(updatedSince.getDate() - 1);
        }
      }
      
      console.log("Starting incremental purchase order sync...");
      
      // Create or get sync progress for resumable sync
      const syncProgress = await this.createOrGetSyncProgress('purchaseorders', full, usesDaysParam);
      console.log(`Last sync date: ${updatedSince ? updatedSince.toISOString() : 'Full sync'}`);
      
      // Get all purchase orders with products included (OPTIMIZED!)
      const purchaseOrders = await this.getAllPurchaseOrders(updatedSince, syncProgress, cutoffDate);
      
      if (purchaseOrders.length === 0) {
        console.log("No purchase orders to sync");
        
        // Mark sync as completed
        if (syncProgress && syncProgress.id) {
          await this.updateSyncProgress(syncProgress.id, 0, 'completed');
        }
        
        return {
          success: true,
          message: "No purchase orders to sync",
          details: {
            purchaseOrdersProcessed: 0,
            productsProcessed: 0,
            commentsProcessed: 0, // Always 0 now
            syncType: full ? 'full' : (days ? `${days} days` : 'incremental'),
            lastSyncDate: updatedSince ? updatedSince.toISOString() : null
          }
        };
      }
      
      console.log(`Syncing ${purchaseOrders.length} purchase orders...`);
      
      // Save purchase orders with products to database (OPTIMIZED!)
      await this.savePurchaseOrdersToDatabase(purchaseOrders);
      
      // Count total products processed
      const totalProducts = purchaseOrders.reduce((sum, po) => {
        return sum + (po.products ? po.products.length : 0);
      }, 0);
      
      // Update last sync date
      const pool = await sql.connect(this.sqlConfig);
      await pool.request().query(`
        UPDATE SyncStatus 
        SET last_sync_date = GETDATE(), 
            last_sync_count = ${purchaseOrders.length},
            total_count = (SELECT COUNT(*) FROM PurchaseOrders)
        WHERE entity_type = 'purchaseorders'
      `);
      
      // Mark sync as completed
      if (syncProgress && syncProgress.id) {
        await this.updateSyncProgress(syncProgress.id, 0, 'completed');
      }
      
      console.log("✅ Purchase order sync completed successfully");
      
      return {
        success: true,
        message: "Purchase orders sync completed",
        details: {
          purchaseOrdersProcessed: purchaseOrders.length,
          productsProcessed: totalProducts,
          commentsProcessed: 0, // We don't fetch comments anymore for performance
          syncType: full ? 'full' : (days ? `${days} days` : 'incremental'),
          lastSyncDate: updatedSince ? updatedSince.toISOString() : null,
          optimized: true // Indicates this is the optimized version
        }
      };
    } catch (error) {
      console.error("❌ Error during purchase order sync:", error.message);
      throw error;
    }
  }

  /**
   * Get all purchase orders from database
   * @returns {Promise<Array>} - Array of purchase orders
   */
  async getAllPurchaseOrdersFromDatabase() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query(`
        SELECT 
          po.*,
          (SELECT COUNT(*) FROM PurchaseOrderProducts pop WHERE pop.idpurchaseorder = po.idpurchaseorder) as product_count,
          (SELECT COUNT(*) FROM PurchaseOrderComments poc WHERE poc.idpurchaseorder = po.idpurchaseorder) as comment_count
        FROM PurchaseOrders po
        ORDER BY po.updated DESC
      `);
      
      return result.recordset;
    } catch (error) {
      console.error("Error getting purchase orders from database:", error.message);
      throw error;
    }
  }

  /**
   * Get purchase order by ID from database with products and comments
   * @param {number} idpurchaseorder - Purchase order ID
   * @returns {Promise<Object|null>} - Purchase order with products and comments
   */
  async getPurchaseOrderByIdFromDatabase(idpurchaseorder) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Get purchase order
      const purchaseOrderResult = await pool.request()
        .input('idpurchaseorder', sql.Int, idpurchaseorder)
        .query(`
          SELECT * FROM PurchaseOrders 
          WHERE idpurchaseorder = @idpurchaseorder
        `);
      
      if (purchaseOrderResult.recordset.length === 0) {
        return null;
      }
      
      const purchaseOrder = purchaseOrderResult.recordset[0];
      
      // Get products
      const productsResult = await pool.request()
        .input('idpurchaseorder', sql.Int, idpurchaseorder)
        .query(`
          SELECT * FROM PurchaseOrderProducts 
          WHERE idpurchaseorder = @idpurchaseorder
          ORDER BY idproduct
        `);
      
      // Get comments
      const commentsResult = await pool.request()
        .input('idpurchaseorder', sql.Int, idpurchaseorder)
        .query(`
          SELECT * FROM PurchaseOrderComments 
          WHERE idpurchaseorder = @idpurchaseorder
          ORDER BY created DESC
        `);
      
      // Combine data
      purchaseOrder.products = productsResult.recordset;
      purchaseOrder.comments = commentsResult.recordset;
      
      return purchaseOrder;
    } catch (error) {
      console.error(`Error getting purchase order ${idpurchaseorder} from database:`, error.message);
      throw error;
    }
  }
}

module.exports = PurchaseOrderService;

