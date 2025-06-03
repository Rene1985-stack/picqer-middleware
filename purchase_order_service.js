/**
 * Purchase Order service for interacting with the Picqer API and syncing purchase orders to Azure SQL
 * Based on the official Picqer API documentation: https://picqer.com/en/api/purchaseorders
 * CLEAN VERSION - Only uses fields from official Picqer API (no comments, no extra fields)
 */
const axios = require("axios");
const sql = require("mssql");

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
          console.error("Response data:", error.response.data);
        } else if (error.request) {
          console.error("No response received");
        } else {
          console.error("Error:", error.message);
        }
        throw error;
      }
    );
  }

  /**
   * Sync purchase orders from Picqer API (CLEAN VERSION - API fields only)
   * @param {number} days - Number of days to sync (optional)
   * @param {boolean} full - Whether to do a full sync
   * @returns {Promise<Object>} - Sync result
   */
  async syncPurchaseOrdersIncremental(days = null, full = false) {
    console.log("Received request to incrementally sync purchase orders");
    
    try {
      console.log("Starting incremental purchase order sync...");
      
      // Determine sync parameters
      let updatedAfter = null;
      if (!full && days) {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - days);
        updatedAfter = daysAgo.toISOString().slice(0, 19).replace('T', ' ');
      }
      
      console.log("Last sync date:", updatedAfter || "Full sync");
      
      // Fetch purchase orders from Picqer API
      console.log("Fetching all purchase orders from Picqer (with products included)...");
      const purchaseOrders = await this.fetchAllPurchaseOrders(updatedAfter);
      
      console.log(`✅ Fetched ${purchaseOrders.length} unique purchase orders with products included`);
      
      // Save to database
      console.log(`Syncing ${purchaseOrders.length} purchase orders...`);
      const saveResult = await this.savePurchaseOrdersToDatabase(purchaseOrders);
      
      const result = {
        success: true,
        message: "Purchase orders sync completed successfully",
        details: {
          total_fetched: purchaseOrders.length,
          saved_purchase_orders: saveResult.purchaseOrders,
          saved_products: saveResult.products,
          sync_type: full ? "full" : "incremental",
          days_synced: days,
          optimized: true,
          api_compliant: true
        }
      };
      
      console.log("✅ Purchase orders sync completed successfully");
      console.log("Sync details:", JSON.stringify(result.details, null, 2));
      
      return result;
      
    } catch (error) {
      console.error("Error syncing purchase orders:", error.message);
      throw error;
    }
  }

  /**
   * Fetch all purchase orders from Picqer API with pagination
   * @param {string} updatedAfter - ISO date string for incremental sync
   * @returns {Promise<Array>} - Array of purchase orders with products
   */
  async fetchAllPurchaseOrders(updatedAfter = null) {
    const allPurchaseOrders = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;
    
    while (hasMore) {
      console.log(`Fetching purchase orders with offset ${offset}...`);
      
      const params = {
        offset: offset,
        limit: limit
      };
      
      if (updatedAfter) {
        params.updated_after = updatedAfter;
      }
      
      try {
        const response = await this.client.get('/purchaseorders', { params });
        const purchaseOrders = response.data;
        
        if (purchaseOrders && purchaseOrders.length > 0) {
          // Add unique purchase orders (avoid duplicates)
          const uniqueNewOrders = purchaseOrders.filter(po => 
            !allPurchaseOrders.some(existing => existing.idpurchaseorder === po.idpurchaseorder)
          );
          
          allPurchaseOrders.push(...uniqueNewOrders);
          console.log(`Retrieved ${uniqueNewOrders.length} new purchase orders with products (total unique: ${allPurchaseOrders.length})`);
          
          // Check if we've reached the end
          if (purchaseOrders.length < limit) {
            hasMore = false;
            console.log("Reached last page of purchase orders");
          } else {
            offset += limit;
          }
        } else {
          hasMore = false;
          console.log("No more purchase orders to fetch");
        }
      } catch (error) {
        console.error(`Error fetching purchase orders at offset ${offset}:`, error.message);
        throw error;
      }
    }
    
    return allPurchaseOrders;
  }

  /**
   * Save purchase orders to database (CLEAN VERSION - API fields only)
   * @param {Array} purchaseOrders - Array of purchase orders from Picqer API
   * @returns {Promise<Object>} - Save result with counts
   */
  async savePurchaseOrdersToDatabase(purchaseOrders) {
    console.log(`Saving ${purchaseOrders.length} purchase orders to database...`);
    
    let savedPurchaseOrders = 0;
    let savedProducts = 0;
    
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      for (const purchaseOrder of purchaseOrders) {
        try {
          // Save purchase order (only API fields)
          await pool.request()
            .input('idpurchaseorder', sql.Int, purchaseOrder.idpurchaseorder)
            .input('idsupplier', sql.Int, purchaseOrder.idsupplier || null)
            .input('idwarehouse', sql.Int, purchaseOrder.idwarehouse || null)
            .input('purchaseorderid', sql.NVarChar(50), purchaseOrder.purchaseorderid || null)
            .input('supplier_name', sql.NVarChar(255), purchaseOrder.supplier_name || null)
            .input('supplier_orderid', sql.NVarChar(100), purchaseOrder.supplier_orderid || null)
            .input('status', sql.NVarChar(50), purchaseOrder.status || null)
            .input('remarks', sql.NVarChar(sql.MAX), purchaseOrder.remarks || null)
            .input('delivery_date', sql.Date, purchaseOrder.delivery_date || null)
            .input('language', sql.NVarChar(10), purchaseOrder.language || null)
            .input('created', sql.DateTime, purchaseOrder.created ? new Date(purchaseOrder.created) : null)
            .input('updated', sql.DateTime, purchaseOrder.updated ? new Date(purchaseOrder.updated) : null)
            .query(`
              MERGE PurchaseOrders AS target
              USING (SELECT @idpurchaseorder AS idpurchaseorder) AS source
              ON target.idpurchaseorder = source.idpurchaseorder
              WHEN MATCHED THEN
                UPDATE SET
                  idsupplier = @idsupplier,
                  idwarehouse = @idwarehouse,
                  purchaseorderid = @purchaseorderid,
                  supplier_name = @supplier_name,
                  supplier_orderid = @supplier_orderid,
                  status = @status,
                  remarks = @remarks,
                  delivery_date = @delivery_date,
                  language = @language,
                  created = @created,
                  updated = @updated,
                  last_sync_date = GETDATE()
              WHEN NOT MATCHED THEN
                INSERT (idpurchaseorder, idsupplier, idwarehouse, purchaseorderid, supplier_name, supplier_orderid, status, remarks, delivery_date, language, created, updated, last_sync_date)
                VALUES (@idpurchaseorder, @idsupplier, @idwarehouse, @purchaseorderid, @supplier_name, @supplier_orderid, @status, @remarks, @delivery_date, @language, @created, @updated, GETDATE());
            `);
          
          savedPurchaseOrders++;
          
          // Save products (only API fields)
          if (purchaseOrder.products && purchaseOrder.products.length > 0) {
            // First, delete existing products for this purchase order
            await pool.request()
              .input('idpurchaseorder', sql.Int, purchaseOrder.idpurchaseorder)
              .query('DELETE FROM PurchaseOrderProducts WHERE idpurchaseorder = @idpurchaseorder');
            
            // Insert new products
            for (const product of purchaseOrder.products) {
              await pool.request()
                .input('idpurchaseorder', sql.Int, purchaseOrder.idpurchaseorder)
                .input('idproduct', sql.Int, product.idproduct || null)
                .input('idvatgroup', sql.Int, product.idvatgroup || null)
                .input('productcode', sql.NVarChar(100), product.productcode || null)
                .input('productcode_supplier', sql.NVarChar(100), product.productcode_supplier || null)
                .input('name', sql.NVarChar(255), product.name || null)
                .input('price', sql.Decimal(10, 2), product.price || null)
                .input('amount', sql.Int, product.amount || null)
                .input('amountreceived', sql.Int, product.amountreceived || null)
                .input('weight', sql.Int, product.weight || null)
                .query(`
                  INSERT INTO PurchaseOrderProducts 
                  (idpurchaseorder, idproduct, idvatgroup, productcode, productcode_supplier, name, price, amount, amountreceived, weight)
                  VALUES (@idpurchaseorder, @idproduct, @idvatgroup, @productcode, @productcode_supplier, @name, @price, @amount, @amountreceived, @weight)
                `);
              
              savedProducts++;
            }
          }
          
        } catch (error) {
          console.error(`Error saving purchase order ${purchaseOrder.idpurchaseorder}:`, error.message);
          // Continue with other purchase orders instead of failing completely
        }
      }
      
      console.log(`✅ Successfully saved ${savedPurchaseOrders} purchase orders and ${savedProducts} products`);
      
      return {
        purchaseOrders: savedPurchaseOrders,
        products: savedProducts
      };
      
    } catch (error) {
      console.error("Error connecting to database:", error.message);
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
        SELECT * FROM PurchaseOrders 
        ORDER BY created DESC
      `);
      return result.recordset;
    } catch (error) {
      console.error("Error getting purchase orders from database:", error.message);
      throw error;
    }
  }

  /**
   * Get purchase order by ID from database with products
   * @param {number} idpurchaseorder - Purchase order ID
   * @returns {Promise<Object|null>} - Purchase order with products
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
      
      // Combine data
      purchaseOrder.products = productsResult.recordset;
      
      return purchaseOrder;
    } catch (error) {
      console.error(`Error getting purchase order ${idpurchaseorder} from database:`, error.message);
      throw error;
    }
  }

  /**
   * Compatibility method - alias for syncPurchaseOrdersIncremental
   * @param {number} days - Number of days to sync (optional)
   * @param {boolean} full - Whether to do a full sync
   * @returns {Promise<Object>} - Sync result
   */
  async syncPurchaseOrders(days = null, full = false) {
    console.log("Using compatibility method syncPurchaseOrders -> syncPurchaseOrdersIncremental");
    return await this.syncPurchaseOrdersIncremental(days, full);
  }
}

module.exports = PurchaseOrderService;

