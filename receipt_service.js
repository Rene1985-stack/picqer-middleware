/**
 * Receipt Service for Picqer Middleware
 * Handles receipt synchronization from Picqer API to SQL database
 * Based on exact Picqer Receipts API documentation attributes
 */

const sql = require('mssql');

class ReceiptService {
  constructor(sqlConnection, picqerService) {
    this.sql = sqlConnection;
    this.picqerService = picqerService;
    this.sqlConfig = null;
    this.tableName = 'Receipts';
    
    // Initialize database schema
    this.initializeDatabase().catch(err => {
      console.error('Error initializing receipt database schema:', err.message);
    });
  }

  /**
   * Set SQL configuration
   * @param {Object} config - SQL configuration object
   */
  setSqlConfig(config) {
    this.sqlConfig = config;
  }
  
  /**
   * Initialize database schema for receipts
   * @returns {Promise<boolean>} - Success status
   */
  async initializeDatabase() {
    try {
      console.log('Initializing receipt database schema...');
      
      // Import schema module
      const { createReceiptsSchema } = require('./receipts_schema.js');
      
      // Execute schema
      const success = await createReceiptsSchema(this.sql);
      
      if (success) {
        console.log('✅ Receipt database schema initialized successfully');
        return true;
      } else {
        console.error('❌ Failed to initialize receipt database schema');
        return false;
      }
    } catch (error) {
      console.error('Error initializing receipt database schema:', error.message);
      return false;
    }
  }

  /**
   * Main method to sync receipts incrementally
   * @param {number} days - Number of days to sync (optional)
   * @param {boolean} full - Whether to do a full sync
   * @returns {Promise<Object>} - Sync result
   */
  async syncReceiptsIncremental(days = null, full = false) {
    console.log("🧾 Starting API-compliant receipt sync");
    
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

      // Fetch receipts from Picqer API
      console.log("Fetching receipts from Picqer API...");
      const receipts = await this.fetchAllReceiptsFromPicqer(lastSyncDate);
      
      if (receipts.length === 0) {
        console.log("No receipts to sync");
        return {
          success: true,
          message: "No receipts to sync",
          details: {
            receipts_processed: 0,
            products_processed: 0,
            sync_time_ms: Date.now() - startTime
          }
        };
      }

      console.log(`✅ Fetched ${receipts.length} receipts`);

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
   * Get last sync date
   * @returns {Promise<string|null>} - Last sync date or null if never synced
   */
  async getLastSyncDate() {
    try {
      // Check if Receipts table exists
      const tableCheck = await this.sql.query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'Receipts'
      `);
      
      if (tableCheck.recordset[0].tableExists === 0) {
        console.log('Receipts table does not exist yet, initializing database...');
        await this.initializeDatabase();
        
        // Default to 30 days ago if no previous sync
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() - 30);
        return defaultDate.toISOString();
      }
      
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

        console.log(`Making request to: ${this.picqerService.apiUrl}${endpoint}`);
        
        const response = await this.picqerService.makeRequest(endpoint);

        if (!response || !Array.isArray(response)) {
          console.log("No more receipts to fetch or invalid response");
          break;
        }

        if (response.length === 0) {
          console.log("Reached last page of receipts");
          hasMoreData = false;
          break;
        }

        // Add receipts to collection
        allReceipts.push(...response);
        console.log(`Retrieved ${response.length} receipts (total: ${allReceipts.length})`);

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

        // Save receipt products
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
   * Save individual receipt to database - API compliant fields only
   * @param {Object} receipt - Receipt object from Picqer API
   */
  async saveReceiptToDatabase(receipt) {
    const request = new this.sql.Request();
    
    // Use MERGE for upsert operation with exact API fields
    const query = `
      MERGE Receipts AS target
      USING (VALUES (
        @idreceipt, @idwarehouse, @version, @supplier_idsupplier, @supplier_name,
        @purchaseorder_idpurchaseorder, @purchaseorder_purchaseorderid, @receiptid, @status, @remarks,
        @completed_by_iduser, @completed_by_name, @amount_received, @amount_received_excessive,
        @completed_at, @created, @last_sync_date
      )) AS source (
        idreceipt, idwarehouse, version, supplier_idsupplier, supplier_name,
        purchaseorder_idpurchaseorder, purchaseorder_purchaseorderid, receiptid, status, remarks,
        completed_by_iduser, completed_by_name, amount_received, amount_received_excessive,
        completed_at, created, last_sync_date
      )
      ON target.idreceipt = source.idreceipt
      WHEN MATCHED THEN
        UPDATE SET
          idwarehouse = source.idwarehouse,
          version = source.version,
          supplier_idsupplier = source.supplier_idsupplier,
          supplier_name = source.supplier_name,
          purchaseorder_idpurchaseorder = source.purchaseorder_idpurchaseorder,
          purchaseorder_purchaseorderid = source.purchaseorder_purchaseorderid,
          receiptid = source.receiptid,
          status = source.status,
          remarks = source.remarks,
          completed_by_iduser = source.completed_by_iduser,
          completed_by_name = source.completed_by_name,
          amount_received = source.amount_received,
          amount_received_excessive = source.amount_received_excessive,
          completed_at = source.completed_at,
          created = source.created,
          last_sync_date = source.last_sync_date
      WHEN NOT MATCHED THEN
        INSERT (
          idreceipt, idwarehouse, version, supplier_idsupplier, supplier_name,
          purchaseorder_idpurchaseorder, purchaseorder_purchaseorderid, receiptid, status, remarks,
          completed_by_iduser, completed_by_name, amount_received, amount_received_excessive,
          completed_at, created, last_sync_date
        )
        VALUES (
          source.idreceipt, source.idwarehouse, source.version, source.supplier_idsupplier, source.supplier_name,
          source.purchaseorder_idpurchaseorder, source.purchaseorder_purchaseorderid, source.receiptid, source.status, source.remarks,
          source.completed_by_iduser, source.completed_by_name, source.amount_received, source.amount_received_excessive,
          source.completed_at, source.created, source.last_sync_date
        );
    `;

    // Set parameters - exact API fields only
    request.input('idreceipt', this.sql.Int, receipt.idreceipt);
    request.input('idwarehouse', this.sql.Int, receipt.idwarehouse || null);
    request.input('version', this.sql.Int, receipt.version || null);
    request.input('supplier_idsupplier', this.sql.Int, receipt.supplier?.idsupplier || null);
    request.input('supplier_name', this.sql.NVarChar(255), receipt.supplier?.name || null);
    request.input('purchaseorder_idpurchaseorder', this.sql.Int, receipt.purchaseorder?.idpurchaseorder || null);
    request.input('purchaseorder_purchaseorderid', this.sql.NVarChar(100), receipt.purchaseorder?.purchaseorderid || null);
    request.input('receiptid', this.sql.NVarChar(100), receipt.receiptid || null);
    request.input('status', this.sql.NVarChar(50), receipt.status || null);
    request.input('remarks', this.sql.NVarChar(sql.MAX), receipt.remarks || null);
    request.input('completed_by_iduser', this.sql.Int, receipt.completed_by?.iduser || null);
    request.input('completed_by_name', this.sql.NVarChar(255), receipt.completed_by?.name || null);
    request.input('amount_received', this.sql.Int, receipt.amount_received || null);
    request.input('amount_received_excessive', this.sql.Int, receipt.amount_received_excessive || null);
    request.input('completed_at', this.sql.DateTime, receipt.completed_at ? new Date(receipt.completed_at) : null);
    request.input('created', this.sql.DateTime, receipt.created ? new Date(receipt.created) : null);
    request.input('last_sync_date', this.sql.DateTime, new Date());

    await request.query(query);
  }

  /**
   * Save receipt product to database - API compliant fields only
   * @param {number} idreceipt - Receipt ID
   * @param {Object} product - Product object from receipt
   */
  async saveReceiptProductToDatabase(idreceipt, product) {
    const request = new this.sql.Request();
    
    const query = `
      MERGE ReceiptProducts AS target
      USING (VALUES (
        @idreceipt_product, @idreceipt, @idpurchaseorder_product, @idproduct, @idpurchaseorder,
        @productcode, @name, @amount, @amount_ordered, @amount_previously_received,
        @added_by_receipt, @stock_location_v1, @location_v2, @created_at,
        @received_by_iduser, @reverted_at, @reverted_by_iduser
      )) AS source (
        idreceipt_product, idreceipt, idpurchaseorder_product, idproduct, idpurchaseorder,
        productcode, name, amount, amount_ordered, amount_previously_received,
        added_by_receipt, stock_location_v1, location_v2, created_at,
        received_by_iduser, reverted_at, reverted_by_iduser
      )
      ON target.idreceipt_product = source.idreceipt_product
      WHEN MATCHED THEN
        UPDATE SET
          idreceipt = source.idreceipt,
          idpurchaseorder_product = source.idpurchaseorder_product,
          idproduct = source.idproduct,
          idpurchaseorder = source.idpurchaseorder,
          productcode = source.productcode,
          name = source.name,
          amount = source.amount,
          amount_ordered = source.amount_ordered,
          amount_previously_received = source.amount_previously_received,
          added_by_receipt = source.added_by_receipt,
          stock_location_v1 = source.stock_location_v1,
          location_v2 = source.location_v2,
          created_at = source.created_at,
          received_by_iduser = source.received_by_iduser,
          reverted_at = source.reverted_at,
          reverted_by_iduser = source.reverted_by_iduser
      WHEN NOT MATCHED THEN
        INSERT (
          idreceipt_product, idreceipt, idpurchaseorder_product, idproduct, idpurchaseorder,
          productcode, name, amount, amount_ordered, amount_previously_received,
          added_by_receipt, stock_location_v1, location_v2, created_at,
          received_by_iduser, reverted_at, reverted_by_iduser
        )
        VALUES (
          source.idreceipt_product, source.idreceipt, source.idpurchaseorder_product, source.idproduct, source.idpurchaseorder,
          source.productcode, source.name, source.amount, source.amount_ordered, source.amount_previously_received,
          source.added_by_receipt, source.stock_location_v1, source.location_v2, source.created_at,
          source.received_by_iduser, source.reverted_at, source.reverted_by_iduser
        );
    `;

    // Set parameters - exact API fields only
    request.input('idreceipt_product', this.sql.Int, product.idreceipt_product);
    request.input('idreceipt', this.sql.Int, idreceipt);
    request.input('idpurchaseorder_product', this.sql.Int, product.idpurchaseorder_product || null);
    request.input('idproduct', this.sql.Int, product.idproduct || null);
    request.input('idpurchaseorder', this.sql.Int, product.idpurchaseorder || null);
    request.input('productcode', this.sql.NVarChar(100), product.productcode || null);
    request.input('name', this.sql.NVarChar(255), product.name || null);
    request.input('amount', this.sql.Int, product.amount || null);
    request.input('amount_ordered', this.sql.Int, product.amount_ordered || null);
    request.input('amount_previously_received', this.sql.Int, product.amount_previously_received || null);
    request.input('added_by_receipt', this.sql.Bit, product.added_by_receipt || null);
    request.input('stock_location_v1', this.sql.NVarChar(255), product.stock_location || null);
    request.input('location_v2', this.sql.NVarChar(255), product.location || null);
    request.input('created_at', this.sql.DateTime, product.created_at ? new Date(product.created_at) : null);
    request.input('received_by_iduser', this.sql.Int, product.received_by_iduser || null);
    request.input('reverted_at', this.sql.DateTime, product.reverted_at ? new Date(product.reverted_at) : null);
    request.input('reverted_by_iduser', this.sql.Int, product.reverted_by_iduser || null);

    await request.query(query);
  }

  /**
   * Get all receipts from database
   * @returns {Promise<Array>} - Array of receipts
   */
  async getAllReceiptsFromDatabase() {
    try {
      // Check if Receipts table exists
      const tableCheck = await this.sql.query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'Receipts'
      `);
      
      if (tableCheck.recordset[0].tableExists === 0) {
        console.log('Receipts table does not exist yet, initializing database...');
        await this.initializeDatabase();
        return [];
      }
      
      const request = new this.sql.Request();
      const query = `
        SELECT 
          idreceipt, idwarehouse, version, supplier_idsupplier, supplier_name,
          purchaseorder_idpurchaseorder, purchaseorder_purchaseorderid, receiptid, status, remarks,
          completed_by_iduser, completed_by_name, amount_received, amount_received_excessive,
          completed_at, created, last_sync_date
        FROM Receipts 
        ORDER BY created DESC
      `;
      
      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      console.error('Error fetching receipts:', error);
      throw error;
    }
  }

  /**
   * Get receipt by ID with products
   * @param {number} id - Receipt ID
   * @returns {Promise<Object>} - Receipt with products
   */
  async getReceiptByIdFromDatabase(id) {
    try {
      // Check if Receipts table exists
      const tableCheck = await this.sql.query(`
        SELECT COUNT(*) AS tableExists 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'Receipts'
      `);
      
      if (tableCheck.recordset[0].tableExists === 0) {
        console.log('Receipts table does not exist yet, initializing database...');
        await this.initializeDatabase();
        return null;
      }
      
      const request = new this.sql.Request();
      
      // Get receipt
      request.input('id', this.sql.Int, id);
      const receiptQuery = `
        SELECT 
          idreceipt, idwarehouse, version, supplier_idsupplier, supplier_name,
          purchaseorder_idpurchaseorder, purchaseorder_purchaseorderid, receiptid, status, remarks,
          completed_by_iduser, completed_by_name, amount_received, amount_received_excessive,
          completed_at, created, last_sync_date
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
          idreceipt_product, idreceipt, idpurchaseorder_product, idproduct, idpurchaseorder,
          productcode, name, amount, amount_ordered, amount_previously_received,
          added_by_receipt, stock_location_v1, location_v2, created_at,
          received_by_iduser, reverted_at, reverted_by_iduser
        FROM ReceiptProducts 
        WHERE idreceipt = @id
      `;
      
      const productsResult = await request.query(productsQuery);
      receipt.products = productsResult.recordset;
      
      return receipt;
    } catch (error) {
      console.error('Error fetching receipt by ID:', error);
      throw error;
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

