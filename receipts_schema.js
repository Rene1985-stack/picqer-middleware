/**
 * Complete Receipts Schema - Strictly following Picqer API documentation
 * Includes ALL attributes from the Picqer API documentation
 */

// SQL to create Receipts table with all documented fields
const createReceiptsTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Receipts')
BEGIN
  CREATE TABLE Receipts (
    idreceipt INT PRIMARY KEY,
    idwarehouse INT,
    version INT,
    supplier_idsupplier INT,
    supplier_name NVARCHAR(255),
    purchaseorder_idpurchaseorder INT,
    purchaseorder_purchaseorderid NVARCHAR(255),
    receiptid NVARCHAR(255),
    status NVARCHAR(50),
    remarks NVARCHAR(MAX),
    completed_by_iduser INT,
    completed_by_name NVARCHAR(255),
    amount_received INT,
    amount_received_excessive INT,
    completed_at DATETIME,
    created DATETIME,
    last_sync_date DATETIME
  );
  
  CREATE INDEX idx_receipts_idreceipt ON Receipts(idreceipt);
END
`;

// SQL to create ReceiptProducts table
const createReceiptProductsTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ReceiptProducts')
BEGIN
  CREATE TABLE ReceiptProducts (
    idreceipt_product INT PRIMARY KEY,
    idreceipt INT NOT NULL,
    idpurchaseorder_product INT,
    idproduct INT,
    idpurchaseorder INT,
    productcode NVARCHAR(255),
    name NVARCHAR(255),
    amount INT,
    amount_ordered INT,
    amount_previously_received INT,
    added_by_receipt BIT,
    stock_location_v1 NVARCHAR(255),
    location_v2 NVARCHAR(255),
    created_at DATETIME,
    received_by_iduser INT,
    reverted_at DATETIME,
    reverted_by_iduser INT,
    last_sync_date DATETIME,
    FOREIGN KEY (idreceipt) REFERENCES Receipts(idreceipt)
  );
END
`;

module.exports = {
  createReceiptsTableSQL,
  createReceiptProductsTableSQL
};

