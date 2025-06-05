class ReceiptService {
  constructor(sql, picqerService) {
    this.sql = sql;
    this.picqerService = picqerService;
    this.tableName = 'Receipts';
    this.productsTableName = 'ReceiptProducts';
  }

  /**
   * Sync receipts from Picqer API to database
   */
  async syncReceipts() {
    try {
      console.log('Starting receipts sync...');
      
      // Get last sync date
      const lastSyncDate = await this.getLastSyncDate();
      
      // Fetch receipts from Picqer API
      const receipts = await this.picqerService.getReceipts(lastSyncDate);
      
      if (!receipts || receipts.length === 0) {
        console.log('No new receipts to sync');
        return { success: true, synced: 0, message: 'No new receipts' };
      }

      // Process and save receipts
      let syncedCount = 0;
      for (const receipt of receipts) {
        await this.saveReceipt(receipt);
        syncedCount++;
      }

      console.log(`Successfully synced ${syncedCount} receipts`);
      return { 
        success: true, 
        synced: syncedCount, 
        message: `Synced ${syncedCount} receipts` 
      };

    } catch (error) {
      console.error('Error syncing receipts:', error);
      throw error;
    }
  }

  /**
   * Save or update a receipt in the database
   */
  async saveReceipt(receiptData) {
    try {
      const request = new this.sql.Request();
      
      // Check if receipt exists
      const existingQuery = `
        SELECT idreceipt FROM ${this.tableName} 
        WHERE idreceipt = @idreceipt
      `;
      
      request.input('idreceipt', this.sql.Int, receiptData.idreceipt);
      const existingResult = await request.query(existingQuery);

      if (existingResult.recordset.length > 0) {
        // Update existing receipt
        await this.updateReceipt(receiptData);
      } else {
        // Insert new receipt
        await this.insertReceipt(receiptData);
      }

      // Save receipt products if they exist
      if (receiptData.products && Array.isArray(receiptData.products)) {
        for (const product of receiptData.products) {
          await this.saveReceiptProduct(receiptData.idreceipt, product);
        }
      }

    } catch (error) {
      console.error('Error saving receipt:', error);
      throw error;
    }
  }

  /**
   * Insert new receipt
   */
  async insertReceipt(data) {
    const request = new this.sql.Request();
    
    const insertQuery = `
      INSERT INTO ${this.tableName} (
        idreceipt, idwarehouse, version, supplier_idsupplier, supplier_name,
        purchaseorder_idpurchaseorder, purchaseorder_purchaseorderid, receiptid, status, remarks,
        completed_by_iduser, completed_by_name, amount_received, amount_received_excessive,
        completed_at, created, last_sync_date
      ) VALUES (
        @idreceipt, @idwarehouse, @version, @supplier_idsupplier, @supplier_name,
        @purchaseorder_idpurchaseorder, @purchaseorder_purchaseorderid, @receiptid, @status, @remarks,
        @completed_by_iduser, @completed_by_name, @amount_received, @amount_received_excessive,
        @completed_at, @created, @last_sync_date
      )
    `;

    const last_sync_date = new Date();

    request.input('idreceipt', this.sql.Int, data.idreceipt);
    request.input('idwarehouse', this.sql.Int, data.idwarehouse || null);
    request.input('version', this.sql.Int, data.version || null);
    request.input('supplier_idsupplier', this.sql.Int, data.supplier?.idsupplier || null);
    request.input('supplier_name', this.sql.NVarChar, data.supplier?.name || null);
    request.input('purchaseorder_idpurchaseorder', this.sql.Int, data.purchaseorder?.idpurchaseorder || null);
    request.input('purchaseorder_purchaseorderid', this.sql.NVarChar, data.purchaseorder?.purchaseorderid || null);
    request.input('receiptid', this.sql.NVarChar, data.receiptid || null);
    request.input('status', this.sql.NVarChar, data.status || null);
    request.input('remarks', this.sql.NVarChar, data.remarks || null);
    request.input('completed_by_iduser', this.sql.Int, data.completed_by?.iduser || null);
    request.input('completed_by_name', this.sql.NVarChar, data.completed_by?.name || null);
    request.input('amount_received', this.sql.Int, data.amount_received || null);
    request.input('amount_received_excessive', this.sql.Int, data.amount_received_excessive || null);
    request.input('completed_at', this.sql.DateTime, data.completed_at ? new Date(data.completed_at) : null);
    request.input('created', this.sql.DateTime, data.created ? new Date(data.created) : null);
    request.input('last_sync_date', this.sql.DateTime, last_sync_date);

    await request.query(insertQuery);
  }

  /**
   * Update existing receipt
   */
  async updateReceipt(data) {
    const request = new this.sql.Request();
    
    const updateQuery = `
      UPDATE ${this.tableName} SET
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
        last_sync_date = @last_sync_date
      WHERE idreceipt = @idreceipt
    `;

    const last_sync_date = new Date();

    request.input('idreceipt', this.sql.Int, data.idreceipt);
    request.input('idwarehouse', this.sql.Int, data.idwarehouse || null);
    request.input('version', this.sql.Int, data.version || null);
    request.input('supplier_idsupplier', this.sql.Int, data.supplier?.idsupplier || null);
    request.input('supplier_name', this.sql.NVarChar, data.supplier?.name || null);
    request.input('purchaseorder_idpurchaseorder', this.sql.Int, data.purchaseorder?.idpurchaseorder || null);
    request.input('purchaseorder_purchaseorderid', this.sql.NVarChar, data.purchaseorder?.purchaseorderid || null);
    request.input('receiptid', this.sql.NVarChar, data.receiptid || null);
    request.input('status', this.sql.NVarChar, data.status || null);
    request.input('remarks', this.sql.NVarChar, data.remarks || null);
    request.input('completed_by_iduser', this.sql.Int, data.completed_by?.iduser || null);
    request.input('completed_by_name', this.sql.NVarChar, data.completed_by?.name || null);
    request.input('amount_received', this.sql.Int, data.amount_received || null);
    request.input('amount_received_excessive', this.sql.Int, data.amount_received_excessive || null);
    request.input('completed_at', this.sql.DateTime, data.completed_at ? new Date(data.completed_at) : null);
    request.input('created', this.sql.DateTime, data.created ? new Date(data.created) : null);
    request.input('last_sync_date', this.sql.DateTime, last_sync_date);

    await request.query(updateQuery);
  }

  /**
   * Save or update a receipt product
   */
  async saveReceiptProduct(idreceipt, productData) {
    try {
      const request = new this.sql.Request();
      
      // Check if product exists
      const existingQuery = `
        SELECT idreceipt_product FROM ${this.productsTableName} 
        WHERE idreceipt_product = @idreceipt_product
      `;
      
      request.input('idreceipt_product', this.sql.Int, productData.idreceipt_product);
      const existingResult = await request.query(existingQuery);

      if (existingResult.recordset.length > 0) {
        // Update existing product
        await this.updateReceiptProduct(idreceipt, productData);
      } else {
        // Insert new product
        await this.insertReceiptProduct(idreceipt, productData);
      }

    } catch (error) {
      console.error('Error saving receipt product:', error);
      throw error;
    }
  }

  /**
   * Insert new receipt product
   */
  async insertReceiptProduct(idreceipt, data) {
    const request = new this.sql.Request();
    
    const insertQuery = `
      INSERT INTO ${this.productsTableName} (
        idreceipt_product, idreceipt, idpurchaseorder_product, idproduct, idpurchaseorder,
        productcode, name, amount, amount_ordered, amount_previously_received,
        added_by_receipt, stock_location_v1, location_v2, created_at,
        received_by_iduser, reverted_at, reverted_by_iduser, last_sync_date
      ) VALUES (
        @idreceipt_product, @idreceipt, @idpurchaseorder_product, @idproduct, @idpurchaseorder,
        @productcode, @name, @amount, @amount_ordered, @amount_previously_received,
        @added_by_receipt, @stock_location_v1, @location_v2, @created_at,
        @received_by_iduser, @reverted_at, @reverted_by_iduser, @last_sync_date
      )
    `;

    const last_sync_date = new Date();

    request.input('idreceipt_product', this.sql.Int, data.idreceipt_product);
    request.input('idreceipt', this.sql.Int, idreceipt);
    request.input('idpurchaseorder_product', this.sql.Int, data.idpurchaseorder_product || null);
    request.input('idproduct', this.sql.Int, data.idproduct || null);
    request.input('idpurchaseorder', this.sql.Int, data.idpurchaseorder || null);
    request.input('productcode', this.sql.NVarChar, data.productcode || null);
    request.input('name', this.sql.NVarChar, data.name || null);
    request.input('amount', this.sql.Int, data.amount || null);
    request.input('amount_ordered', this.sql.Int, data.amount_ordered || null);
    request.input('amount_previously_received', this.sql.Int, data.amount_previously_received || null);
    request.input('added_by_receipt', this.sql.Bit, data.added_by_receipt || null);
    request.input('stock_location_v1', this.sql.NVarChar, data.stock_location || null);
    request.input('location_v2', this.sql.NVarChar, data.location || null);
    request.input('created_at', this.sql.DateTime, data.created_at ? new Date(data.created_at) : null);
    request.input('received_by_iduser', this.sql.Int, data.received_by_iduser || null);
    request.input('reverted_at', this.sql.DateTime, data.reverted_at ? new Date(data.reverted_at) : null);
    request.input('reverted_by_iduser', this.sql.Int, data.reverted_by_iduser || null);
    request.input('last_sync_date', this.sql.DateTime, last_sync_date);

    await request.query(insertQuery);
  }

  /**
   * Update existing receipt product
   */
  async updateReceiptProduct(idreceipt, data) {
    const request = new this.sql.Request();
    
    const updateQuery = `
      UPDATE ${this.productsTableName} SET
        idreceipt = @idreceipt,
        idpurchaseorder_product = @idpurchaseorder_product,
        idproduct = @idproduct,
        idpurchaseorder = @idpurchaseorder,
        productcode = @productcode,
        name = @name,
        amount = @amount,
        amount_ordered = @amount_ordered,
        amount_previously_received = @amount_previously_received,
        added_by_receipt = @added_by_receipt,
        stock_location_v1 = @stock_location_v1,
        location_v2 = @location_v2,
        created_at = @created_at,
        received_by_iduser = @received_by_iduser,
        reverted_at = @reverted_at,
        reverted_by_iduser = @reverted_by_iduser,
        last_sync_date = @last_sync_date
      WHERE idreceipt_product = @idreceipt_product
    `;

    const last_sync_date = new Date();

    request.input('idreceipt_product', this.sql.Int, data.idreceipt_product);
    request.input('idreceipt', this.sql.Int, idreceipt);
    request.input('idpurchaseorder_product', this.sql.Int, data.idpurchaseorder_product || null);
    request.input('idproduct', this.sql.Int, data.idproduct || null);
    request.input('idpurchaseorder', this.sql.Int, data.idpurchaseorder || null);
    request.input('productcode', this.sql.NVarChar, data.productcode || null);
    request.input('name', this.sql.NVarChar, data.name || null);
    request.input('amount', this.sql.Int, data.amount || null);
    request.input('amount_ordered', this.sql.Int, data.amount_ordered || null);
    request.input('amount_previously_received', this.sql.Int, data.amount_previously_received || null);
    request.input('added_by_receipt', this.sql.Bit, data.added_by_receipt || null);
    request.input('stock_location_v1', this.sql.NVarChar, data.stock_location || null);
    request.input('location_v2', this.sql.NVarChar, data.location || null);
    request.input('created_at', this.sql.DateTime, data.created_at ? new Date(data.created_at) : null);
    request.input('received_by_iduser', this.sql.Int, data.received_by_iduser || null);
    request.input('reverted_at', this.sql.DateTime, data.reverted_at ? new Date(data.reverted_at) : null);
    request.input('reverted_by_iduser', this.sql.Int, data.reverted_by_iduser || null);
    request.input('last_sync_date', this.sql.DateTime, last_sync_date);

    await request.query(updateQuery);
  }

  /**
   * Get all receipts from database
   */
  async getAllReceipts() {
    try {
      const request = new this.sql.Request();
      const query = `SELECT * FROM ${this.tableName} ORDER BY created DESC`;
      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      console.error('Error getting all receipts:', error);
      throw error;
    }
  }

  /**
   * Get receipt by ID with products
   */
  async getReceiptById(id) {
    try {
      const request = new this.sql.Request();
      
      // Get receipt
      const receiptQuery = `SELECT * FROM ${this.tableName} WHERE idreceipt = @id`;
      request.input('id', this.sql.Int, id);
      const receiptResult = await request.query(receiptQuery);
      
      if (receiptResult.recordset.length === 0) {
        return null;
      }
      
      const receipt = receiptResult.recordset[0];
      
      // Get receipt products
      const productsQuery = `SELECT * FROM ${this.productsTableName} WHERE idreceipt = @id`;
      const productsResult = await request.query(productsQuery);
      receipt.products = productsResult.recordset;
      
      return receipt;
    } catch (error) {
      console.error('Error getting receipt by ID:', error);
      throw error;
    }
  }

  /**
   * Get last sync date for incremental sync
   */
  async getLastSyncDate() {
    try {
      const request = new this.sql.Request();
      const query = `
        SELECT MAX(last_sync_date) as last_sync_date 
        FROM ${this.tableName}
      `;
      const result = await request.query(query);
      return result.recordset[0]?.last_sync_date || null;
    } catch (error) {
      console.error('Error getting last sync date:', error);
      return null;
    }
  }
}

module.exports = ReceiptService;

