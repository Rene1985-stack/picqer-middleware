/**
 * Receipt service for interacting with the Picqer API and syncing receipts to Azure SQL
 * Based on the official Picqer API documentation: https://picqer.com/en/api/receipts
 * CLEAN VERSION - Only uses fields from official Picqer API
 */
const axios = require("axios");
const sql = require("mssql");

class ReceiptService {
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
   * Sync receipts from Picqer API (CLEAN VERSION - API fields only)
   * @param {number} days - Number of days to sync (optional)
   * @param {boolean} full - Whether to do a full sync
   * @returns {Promise<Object>} - Sync result
   */
  async syncReceiptsIncremental(days = null, full = false) {
    console.log("Received request to incrementally sync receipts");
    
    try {
      console.log("Starting incremental receipt sync...");
      
      // Determine sync parameters
      let updatedAfter = null;
      if (!full && days) {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - days);
        updatedAfter = daysAgo.toISOString().slice(0, 19).replace('T', ' ');
      }
      
      console.log("Last sync date:", updatedAfter || "Full sync");
      
      // Fetch receipts from Picqer API
      console.log("Fetching all receipts from Picqer (with products included)...");
      const receipts = await this.fetchAllReceipts(updatedAfter);
      
      console.log(`✅ Fetched ${receipts.length} unique receipts with products included`);
      
      // Save to database
      console.log(`Syncing ${receipts.length} receipts...`);
      const saveResult = await this.saveReceiptsToDatabase(receipts);
      
      const result = {
        success: true,
        message: "Receipts sync completed successfully",
        details: {
          total_fetched: receipts.length,
          saved_receipts: saveResult.receipts,
          saved_products: saveResult.products,
          sync_type: full ? "full" : "incremental",
          days_synced: days,
          optimized: true,
          api_compliant: true
        }
      };
      
      console.log("✅ Receipts sync completed successfully");
      console.log("Sync details:", JSON.stringify(result.details, null, 2));
      
      return result;
      
    } catch (error) {
      console.error("Error syncing receipts:", error.message);
      throw error;
    }
  }

  /**
   * Fetch all receipts from Picqer API with pagination
   * @param {string} updatedAfter - ISO date string for incremental sync
   * @returns {Promise<Array>} - Array of receipts with products
   */
  async fetchAllReceipts(updatedAfter = null) {
    const allReceipts = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;
    
    while (hasMore) {
      console.log(`Fetching receipts with offset ${offset}...`);
      
      const params = {
        offset: offset,
        limit: limit
      };
      
      if (updatedAfter) {
        params.updated_after = updatedAfter;
      }
      
      try {
        const response = await this.client.get('/receipts', { params });
        const receipts = response.data;
        
        if (receipts && receipts.length > 0) {
          // Add unique receipts (avoid duplicates)
          const uniqueNewReceipts = receipts.filter(receipt => 
            !allReceipts.some(existing => existing.idreceipt === receipt.idreceipt)
          );
          
          allReceipts.push(...uniqueNewReceipts);
          console.log(`Retrieved ${uniqueNewReceipts.length} new receipts with products (total unique: ${allReceipts.length})`);
          
          // Check if we've reached the end
          if (receipts.length < limit) {
            hasMore = false;
            console.log("Reached last page of receipts");
          } else {
            offset += limit;
          }
        } else {
          hasMore = false;
          console.log("No more receipts to fetch");
        }
      } catch (error) {
        console.error(`Error fetching receipts at offset ${offset}:`, error.message);
        throw error;
      }
    }
    
    return allReceipts;
  }

  /**
   * Save receipts to database (CLEAN VERSION - API fields only)
   * @param {Array} receipts - Array of receipts from Picqer API
   * @returns {Promise<Object>} - Save result with counts
   */
  async saveReceiptsToDatabase(receipts) {
    console.log(`Saving ${receipts.length} receipts to database...`);
    
    let savedReceipts = 0;
    let savedProducts = 0;
    
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      for (const receipt of receipts) {
        try {
          // Save receipt (only API fields)
          await pool.request()
            .input('idreceipt', sql.Int, receipt.idreceipt)
            .input('idwarehouse', sql.Int, receipt.idwarehouse || null)
            .input('version', sql.Int, receipt.version || null)
            .input('supplier_idsupplier', sql.Int, receipt.supplier?.idsupplier || null)
            .input('supplier_name', sql.NVarChar(255), receipt.supplier?.name || null)
            .input('purchaseorder_idpurchaseorder', sql.Int, receipt.purchaseorder?.idpurchaseorder || null)
            .input('purchaseorder_purchaseorderid', sql.NVarChar(50), receipt.purchaseorder?.purchaseorderid || null)
            .input('receiptid', sql.NVarChar(50), receipt.receiptid || null)
            .input('status', sql.NVarChar(50), receipt.status || null)
            .input('remarks', sql.NVarChar(sql.MAX), receipt.remarks || null)
            .input('completed_by_iduser', sql.Int, receipt.completed_by?.iduser || null)
            .input('completed_by_name', sql.NVarChar(255), receipt.completed_by?.name || null)
            .input('amount_received', sql.Int, receipt.amount_received || null)
            .input('amount_received_excessive', sql.Int, receipt.amount_received_excessive || null)
            .input('completed_at', sql.DateTime, receipt.completed_at ? new Date(receipt.completed_at) : null)
            .input('created', sql.DateTime, receipt.created ? new Date(receipt.created) : null)
            .input('updated', sql.DateTime, receipt.updated ? new Date(receipt.updated) : null)
            .query(`
              MERGE Receipts AS target
              USING (SELECT @idreceipt AS idreceipt) AS source
              ON target.idreceipt = source.idreceipt
              WHEN MATCHED THEN
                UPDATE SET
                  idwarehouse = @idwarehouse,
                  version = @version,
                  supplier_idsupplier = @supplier_idsupplier,
                  supplier_name = @supplier_name,
                  purchaseorder_idpurchaseorder = @purchaseorder_idpurchaseorder,
                  purchaseorder_purchaseorderid = @purchaseorder_purchaseorderid,
                  receiptid = @receiptid,
                  status = @status,
                  remarks = @remarks,
                  completed_by_iduser = @completed_by_iduser,
                  completed_by_name = @completed_by_name,
                  amount_received = @amount_received,
                  amount_received_excessive = @amount_received_excessive,
                  completed_at = @completed_at,
                  created = @created,
                  updated = @updated,
                  last_sync_date = GETDATE()
              WHEN NOT MATCHED THEN
                INSERT (idreceipt, idwarehouse, version, supplier_idsupplier, supplier_name, purchaseorder_idpurchaseorder, purchaseorder_purchaseorderid, receiptid, status, remarks, completed_by_iduser, completed_by_name, amount_received, amount_received_excessive, completed_at, created, updated, last_sync_date)
                VALUES (@idreceipt, @idwarehouse, @version, @supplier_idsupplier, @supplier_name, @purchaseorder_idpurchaseorder, @purchaseorder_purchaseorderid, @receiptid, @status, @remarks, @completed_by_iduser, @completed_by_name, @amount_received, @amount_received_excessive, @completed_at, @created, @updated, GETDATE());
            `);
          
          savedReceipts++;
          
          // Save products (only API fields)
          if (receipt.products && receipt.products.length > 0) {
            // First, delete existing products for this receipt
            await pool.request()
              .input('idreceipt', sql.Int, receipt.idreceipt)
              .query('DELETE FROM ReceiptProducts WHERE idreceipt = @idreceipt');
            
            // Insert new products
            for (const product of receipt.products) {
              await pool.request()
                .input('idreceipt', sql.Int, receipt.idreceipt)
                .input('idreceipt_product', sql.Int, product.idreceipt_product || null)
                .input('idpurchaseorder_product', sql.Int, product.idpurchaseorder_product || null)
                .input('idproduct', sql.Int, product.idproduct || null)
                .input('idpurchaseorder', sql.Int, product.idpurchaseorder || null)
                .input('productcode', sql.NVarChar(100), product.productcode || null)
                .input('productcode_supplier', sql.NVarChar(100), product.productcode_supplier || null)
                .input('name', sql.NVarChar(255), product.name || null)
                .input('barcode', sql.NVarChar(100), product.barcode || null)
                .input('amount', sql.Int, product.amount || null)
                .input('amount_ordered', sql.Int, product.amount_ordered || null)
                .input('amount_receiving', sql.Int, product.amount_receiving || null)
                .input('added_by_receipt', sql.Bit, product.added_by_receipt || false)
                .input('abc_classification', sql.NVarChar(10), product.abc_classification || null)
                .query(`
                  INSERT INTO ReceiptProducts 
                  (idreceipt, idreceipt_product, idpurchaseorder_product, idproduct, idpurchaseorder, productcode, productcode_supplier, name, barcode, amount, amount_ordered, amount_receiving, added_by_receipt, abc_classification)
                  VALUES (@idreceipt, @idreceipt_product, @idpurchaseorder_product, @idproduct, @idpurchaseorder, @productcode, @productcode_supplier, @name, @barcode, @amount, @amount_ordered, @amount_receiving, @added_by_receipt, @abc_classification)
                `);
              
              savedProducts++;
            }
          }
          
        } catch (error) {
          console.error(`Error saving receipt ${receipt.idreceipt}:`, error.message);
          // Continue with other receipts instead of failing completely
        }
      }
      
      console.log(`✅ Successfully saved ${savedReceipts} receipts and ${savedProducts} products`);
      
      return {
        receipts: savedReceipts,
        products: savedProducts
      };
      
    } catch (error) {
      console.error("Error connecting to database:", error.message);
      throw error;
    }
  }

  /**
   * Get all receipts from database
   * @returns {Promise<Array>} - Array of receipts
   */
  async getAllReceiptsFromDatabase() {
    try {
      const pool = await sql.connect(this.sqlConfig);
      const result = await pool.request().query(`
        SELECT * FROM Receipts 
        ORDER BY created DESC
      `);
      return result.recordset;
    } catch (error) {
      console.error("Error getting receipts from database:", error.message);
      throw error;
    }
  }

  /**
   * Get receipt by ID from database with products
   * @param {number} idreceipt - Receipt ID
   * @returns {Promise<Object|null>} - Receipt with products
   */
  async getReceiptByIdFromDatabase(idreceipt) {
    try {
      const pool = await sql.connect(this.sqlConfig);
      
      // Get receipt
      const receiptResult = await pool.request()
        .input('idreceipt', sql.Int, idreceipt)
        .query(`
          SELECT * FROM Receipts 
          WHERE idreceipt = @idreceipt
        `);
      
      if (receiptResult.recordset.length === 0) {
        return null;
      }
      
      const receipt = receiptResult.recordset[0];
      
      // Get products
      const productsResult = await pool.request()
        .input('idreceipt', sql.Int, idreceipt)
        .query(`
          SELECT * FROM ReceiptProducts 
          WHERE idreceipt = @idreceipt
          ORDER BY idproduct
        `);
      
      // Combine data
      receipt.products = productsResult.recordset;
      
      return receipt;
    } catch (error) {
      console.error(`Error getting receipt ${idreceipt} from database:`, error.message);
      throw error;
    }
  }

  /**
   * Compatibility method - alias for syncReceiptsIncremental
   * @param {number} days - Number of days to sync (optional)
   * @param {boolean} full - Whether to do a full sync
   * @returns {Promise<Object>} - Sync result
   */
  async syncReceipts(days = null, full = false) {
    console.log("Using compatibility method syncReceipts -> syncReceiptsIncremental");
    return await this.syncReceiptsIncremental(days, full);
  }
}

module.exports = ReceiptService;

