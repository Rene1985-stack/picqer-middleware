/**
 * Receipt Service for Picqer Middleware
 * Handles receipt synchronization from Picqer API to SQL database
 * Based on official Picqer Receipts API documentation
 */

const sql = require('mssql');

class ReceiptService {
  constructor(sqlConnection, picqerService) {
    this.sql = sqlConnection;
    this.picqerService = picqerService;
    this.sqlConfig = null;
  }

  /**
   * Set SQL configuration
   * @param {Object} config - SQL configuration object
   */
  setSqlConfig(config) {
    this.sqlConfig = config;
  }

  /**
   * Main method to sync receipts incrementally
   * @param {number} days - Number of days to sync (optional)
   * @param {boolean} full - Whether to do a full sync
   * @returns {Promise<Object>} - Sync result
   */
  async syncReceiptsIncremental(days = null, full = false) {
    console.log("🧾 Starting optimized receipt sync (API compliant: true)");
    
    try {
      const startTime = Date.now();
      
      // Determine sync date
      let lastSyncDate;
      if (full) {
        lastSyncDate = null;
        console.log("Starting full receipt sync...");
      } else {
        if (days) {
          const daysAgo = new Date();
          daysAgo.setDate(daysAgo.getDate() - days);
          lastSyncDate = daysAgo.toISOString().split('T')[0] + ' 00:00:00';
          console.log(`Starting incremental receipt sync for the last ${days} days`);
        } else {
          lastSyncDate = await this.getLastSyncDate();
          console.log("Starting incremental receipt sync...");
        }
      }

      console.log("Last sync date:", lastSyncDate || "Full sync");

      // Fetch receipts from Picqer API (with products included)
      console.log("Fetching all receipts from Picqer (with products included)...");
      const receipts = await this.fetchAllReceiptsFromPicqer(lastSyncDate);
      
      if (receipts.length === 0) {
        console.log("No receipts to sync");
        return {
          success: true,
          message: "No receipts to sync",
          details: {
            receipts_processed: 0,
            products_processed: 0,
            sync_time_ms: Date.now() - startTime,
            optimized: true,
            api_compliant: true
          }
        };
      }

      console.log(`✅ Fetched ${receipts.length} unique receipts with products included`);

      // Save receipts to database
      console.log(`Syncing ${receipts.length} receipts...`);
      const syncResult = await this.saveReceiptsToDatabase(receipts);

      // Update last sync date
      await this.updateLastSyncDate();

      const endTime = Date.now();
      const syncTimeMs = endTime - startTime;

      console.log(`✅ Receipt sync completed successfully in ${syncTimeMs}ms`);

      return {
        success: true,
        message: "Receipt sync completed successfully",
        details: {
          receipts_processed: syncResult.receipts_saved,
          products_processed: syncResult.products_saved,
          sync_time_ms: syncTimeMs,
          optimized: true,
          api_compliant: true,
          last_sync_date: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error("Error syncing receipts:", error);
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

  /**
   * Fetch all receipts from Picqer API with pagination
   * @param {string} lastSyncDate - Last sync date for incremental sync
   * @returns {Promise<Array>} - Array of receipts with products
   */
  async fetchAllReceiptsFromPicqer(lastSyncDate = null) {
    const allReceipts = [];
    let offset = 0;
    const limit = 100;
    let hasMoreData = true;

    while (hasMoreData) {
      console.log(`Fetching receipts with offset ${offset}...`);
      
      try {
        // Build API endpoint
        let endpoint = `/receipts?offset=${offset}&limit=${limit}`;
        
        // Add date filter for incremental sync
        if (lastSyncDate) {
          const formattedDate = lastSyncDate.replace('T', ' ').replace('Z', '');
          endpoint += `&updated_after=${encodeURIComponent(formattedDate)}`;
        }

        console.log(`Making request to: ${this.picqerService.baseUrl}${endpoint}`);
        
        const response = await this.picqerService.makeRequest(endpoint);
        console.log(`Response status: ${response.status || 'unknown'}`);

        if (!response || !Array.isArray(response)) {
          console.log("No more receipts to fetch or invalid response");
          break;
        }

        if (response.length === 0) {
          console.log("Reached last page of receipts");
          hasMoreData = false;
          break;
        }

        // Add receipts to collection (products are already included in API response)
        allReceipts.push(...response);
        console.log(`Retrieved ${response.length} new receipts with products (total unique: ${allReceipts.length})`);

        // Check if we got less than the limit (last page)
        if (response.length < limit) {
          console.log("Reached last page of receipts");
          hasMoreData = false;
        } else {
          offset += limit;
        }

      } catch (error) {
        console.error(`Error fetching receipts at offset ${offset}:`, error);
        // Continue with next batch instead of failing completely
        offset += limit;
        if (offset > 10000) { // Safety limit
          console.log("Reached safety limit, stopping fetch");
          break;
        }
      }
    }

    return allReceipts;
  }

  /**
   * Save receipts and their products to database
   * @param {Array} receipts - Array of receipts with products
   * @returns {Promise<Object>} - Save result statistics
   */
  async saveReceiptsToDatabase(receipts) {
    console.log(`Saving ${receipts.length} receipts to database...`);
    
    let receiptsSaved = 0;
    let productsSaved = 0;

    for (const receipt of receipts) {
      try {
        // Save receipt
        await this.saveReceiptToDatabase(receipt);
        receiptsSaved++;

        // Save receipt products (included in API response)
        if (receipt.products && Array.isArray(receipt.products)) {
          for (const product of receipt.products) {
            await this.saveReceiptProductToDatabase(receipt.idreceipt, product);
            productsSaved++;
          }
        }

      } catch (error) {
        console.error(`Error saving receipt ${receipt.idreceipt}:`, error.message);
        // Continue processing other receipts
      }
    }

    console.log(`✅ Saved ${receiptsSaved} receipts and ${productsSaved} products to database`);
    
    return {
      receipts_saved: receiptsSaved,
      products_saved: productsSaved
    };
  }

  /**
   * Save individual receipt to database
   * @param {Object} receipt - Receipt object from Picqer API
   */
  async saveReceiptToDatabase(receipt) {
    const request = new this.sql.Request();
    
    // Use MERGE for upsert operation
    const query = `
      MERGE Receipts AS target
      USING (VALUES (
        @idreceipt, @idwarehouse, @version, @idsupplier, @supplier_name,
        @idpurchaseorder, @purchaseorderid, @receiptid, @status, @remarks,
        @iduser_completed_by, @completed_by_name, @amount_received, @amount_received_excessive,
        @completed_at, @created, @updated, @last_sync_date
      )) AS source (
        idreceipt, idwarehouse, version, idsupplier, supplier_name,
        idpurchaseorder, purchaseorderid, receiptid, status, remarks,
        iduser_completed_by, completed_by_name, amount_received, amount_received_excessive,
        completed_at, created, updated, last_sync_date
      )
      ON target.idreceipt = source.idreceipt
      WHEN MATCHED THEN
        UPDATE SET
          idwarehouse = source.idwarehouse,
          version = source.version,
          idsupplier = source.idsupplier,
          supplier_name = source.supplier_name,
          idpurchaseorder = source.idpurchaseorder,
          purchaseorderid = source.purchaseorderid,
          receiptid = source.receiptid,
          status = source.status,
          remarks = source.remarks,
          iduser_completed_by = source.iduser_completed_by,
          completed_by_name = source.completed_by_name,
          amount_received = source.amount_received,
          amount_received_excessive = source.amount_received_excessive,
          completed_at = source.completed_at,
          created = source.created,
          updated = source.updated,
          last_sync_date = source.last_sync_date
      WHEN NOT MATCHED THEN
        INSERT (
          idreceipt, idwarehouse, version, idsupplier, supplier_name,
          idpurchaseorder, purchaseorderid, receiptid, status, remarks,
          iduser_completed_by, completed_by_name, amount_received, amount_received_excessive,
          completed_at, created, updated, last_sync_date
        )
        VALUES (
          source.idreceipt, source.idwarehouse, source.version, source.idsupplier, source.supplier_name,
          source.idpurchaseorder, source.purchaseorderid, source.receiptid, source.status, source.remarks,
          source.iduser_completed_by, source.completed_by_name, source.amount_received, source.amount_received_excessive,
          source.completed_at, source.created, source.updated, source.last_sync_date
        );
    `;

    // Set parameters (all official API fields)
    request.input('idreceipt', this.sql.Int, receipt.idreceipt);
    request.input('idwarehouse', this.sql.Int, receipt.idwarehouse);
    request.input('version', this.sql.Int, receipt.version);
    request.input('idsupplier', this.sql.Int, receipt.supplier?.idsupplier || null);
    request.input('supplier_name', this.sql.NVarChar(255), receipt.supplier?.name || null);
    request.input('idpurchaseorder', this.sql.Int, receipt.purchaseorder?.idpurchaseorder || null);
    request.input('purchaseorderid', this.sql.NVarChar(100), receipt.purchaseorder?.purchaseorderid || null);
    request.input('receiptid', this.sql.NVarChar(100), receipt.receiptid);
    request.input('status', this.sql.NVarChar(50), receipt.status);
    request.input('remarks', this.sql.NVarChar(sql.MAX), receipt.remarks || '');
    request.input('iduser_completed_by', this.sql.Int, receipt.completed_by?.iduser || null);
    request.input('completed_by_name', this.sql.NVarChar(255), receipt.completed_by?.name || null);
    request.input('amount_received', this.sql.Int, receipt.amount_received || 0);
    request.input('amount_received_excessive', this.sql.Int, receipt.amount_received_excessive || 0);
    request.input('completed_at', this.sql.DateTime, receipt.completed_at ? new Date(receipt.completed_at) : null);
    request.input('created', this.sql.DateTime, receipt.created ? new Date(receipt.created) : null);
    request.input('updated', this.sql.DateTime, receipt.updated ? new Date(receipt.updated) : null);
    request.input('last_sync_date', this.sql.DateTime, new Date());

    await request.query(query);
  }

  /**
   * Save receipt product to database
   * @param {number} idreceipt - Receipt ID
   * @param {Object} product - Product object from receipt
   */
  async saveReceiptProductToDatabase(idreceipt, product) {
    const request = new this.sql.Request();
    
    const query = `
      MERGE ReceiptProducts AS target
      USING (VALUES (
        @idreceipt_product, @idreceipt, @idpurchaseorder_product, @idproduct,
        @productcode, @productcode_supplier, @name, @barcode,
        @amount, @amount_ordered, @amount_receiving, @added_by_receipt, @abc_classification
      )) AS source (
        idreceipt_product, idreceipt, idpurchaseorder_product, idproduct,
        productcode, productcode_supplier, name, barcode,
        amount, amount_ordered, amount_receiving, added_by_receipt, abc_classification
      )
      ON target.idreceipt_product = source.idreceipt_product
      WHEN MATCHED THEN
        UPDATE SET
          idreceipt = source.idreceipt,
          idpurchaseorder_product = source.idpurchaseorder_product,
          idproduct = source.idproduct,
          productcode = source.productcode,
          productcode_supplier = source.productcode_supplier,
          name = source.name,
          barcode = source.barcode,
          amount = source.amount,
          amount_ordered = source.amount_ordered,
          amount_receiving = source.amount_receiving,
          added_by_receipt = source.added_by_receipt,
          abc_classification = source.abc_classification
      WHEN NOT MATCHED THEN
        INSERT (
          idreceipt_product, idreceipt, idpurchaseorder_product, idproduct,
          productcode, productcode_supplier, name, barcode,
          amount, amount_ordered, amount_receiving, added_by_receipt, abc_classification
        )
        VALUES (
          source.idreceipt_product, source.idreceipt, source.idpurchaseorder_product, source.idproduct,
          source.productcode, source.productcode_supplier, source.name, source.barcode,
          source.amount, source.amount_ordered, source.amount_receiving, source.added_by_receipt, source.abc_classification
        );
    `;

    // Set parameters (all official API fields)
    request.input('idreceipt_product', this.sql.Int, product.idreceipt_product);
    request.input('idreceipt', this.sql.Int, idreceipt);
    request.input('idpurchaseorder_product', this.sql.Int, product.idpurchaseorder_product || null);
    request.input('idproduct', this.sql.Int, product.idproduct);
    request.input('productcode', this.sql.NVarChar(100), product.productcode || '');
    request.input('productcode_supplier', this.sql.NVarChar(100), product.productcode_supplier || '');
    request.input('name', this.sql.NVarChar(255), product.name || '');
    request.input('barcode', this.sql.NVarChar(100), product.barcode || '');
    request.input('amount', this.sql.Int, product.amount || 0);
    request.input('amount_ordered', this.sql.Int, product.amount_ordered || 0);
    request.input('amount_receiving', this.sql.Int, product.amount_receiving || 0);
    request.input('added_by_receipt', this.sql.Bit, product.added_by_receipt || false);
    request.input('abc_classification', this.sql.NVarChar(10), product.abc_classification || null);

    await request.query(query);
  }

  /**
   * Get all receipts from database
   * @returns {Promise<Array>} - Array of receipts
   */
  async getAllReceiptsFromDatabase() {
    const request = new this.sql.Request();
    const query = `
      SELECT 
        idreceipt, idwarehouse, version, idsupplier, supplier_name,
        idpurchaseorder, purchaseorderid, receiptid, status, remarks,
        iduser_completed_by, completed_by_name, amount_received, amount_received_excessive,
        completed_at, created, updated, last_sync_date
      FROM Receipts 
      ORDER BY created DESC
    `;
    
    const result = await request.query(query);
    return result.recordset;
  }

  /**
   * Get receipt by ID with products
   * @param {number} id - Receipt ID
   * @returns {Promise<Object>} - Receipt with products
   */
  async getReceiptByIdFromDatabase(id) {
    const request = new this.sql.Request();
    
    // Get receipt
    request.input('id', this.sql.Int, id);
    const receiptQuery = `
      SELECT 
        idreceipt, idwarehouse, version, idsupplier, supplier_name,
        idpurchaseorder, purchaseorderid, receiptid, status, remarks,
        iduser_completed_by, completed_by_name, amount_received, amount_received_excessive,
        completed_at, created, updated, last_sync_date
      FROM Receipts 
      WHERE idreceipt = @id
    `;
    
    const receiptResult = await request.query(receiptQuery);
    if (receiptResult.recordset.length === 0) {
      return null;
    }
    
    const receipt = receiptResult.recordset[0];
    
    // Get receipt products
    const productsQuery = `
      SELECT 
        idreceipt_product, idpurchaseorder_product, idproduct,
        productcode, productcode_supplier, name, barcode,
        amount, amount_ordered, amount_receiving, added_by_receipt, abc_classification
      FROM ReceiptProducts 
      WHERE idreceipt = @id
      ORDER BY idreceipt_product
    `;
    
    const productsResult = await request.query(productsQuery);
    receipt.products = productsResult.recordset;
    
    return receipt;
  }

  /**
   * Get last sync date for incremental sync
   * @returns {Promise<string>} - Last sync date
   */
  async getLastSyncDate() {
    try {
      const request = new this.sql.Request();
      const query = `
        SELECT TOP 1 last_sync_date 
        FROM Receipts 
        WHERE last_sync_date IS NOT NULL 
        ORDER BY last_sync_date DESC
      `;
      
      const result = await request.query(query);
      if (result.recordset.length > 0 && result.recordset[0].last_sync_date) {
        return result.recordset[0].last_sync_date.toISOString();
      }
      
      // Default to 30 days ago if no previous sync
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() - 30);
      return defaultDate.toISOString();
      
    } catch (error) {
      console.error("Error getting last sync date:", error);
      // Default to 30 days ago on error
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() - 30);
      return defaultDate.toISOString();
    }
  }

  /**
   * Update last sync date
   */
  async updateLastSyncDate() {
    try {
      const request = new this.sql.Request();
      const query = `
        UPDATE Receipts 
        SET last_sync_date = @syncDate 
        WHERE last_sync_date IS NULL OR last_sync_date < @syncDate
      `;
      
      request.input('syncDate', this.sql.DateTime, new Date());
      await request.query(query);
      
    } catch (error) {
      console.error("Error updating last sync date:", error);
      // Non-critical error, continue
    }
  }
}

module.exports = ReceiptService;

