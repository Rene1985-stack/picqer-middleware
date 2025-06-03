/**
 * Database schema for Picqer purchase orders
 * Based on the Picqer API documentation: https://picqer.com/en/api/purchaseorders
 * Captures all fields from the Picqer API documentation
 */

// SQL script to create PurchaseOrders table
const createPurchaseOrdersTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PurchaseOrders')
BEGIN
    CREATE TABLE PurchaseOrders (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idpurchaseorder INT NOT NULL,
        idsupplier INT NULL,
        idtemplate INT NULL,
        idwarehouse INT NULL,
        idfulfilment_customer INT NULL,
        purchaseorderid NVARCHAR(50) NOT NULL,
        supplier_name NVARCHAR(255) NULL,
        supplier_orderid NVARCHAR(100) NULL,
        status NVARCHAR(50) NOT NULL,
        remarks NVARCHAR(MAX) NULL,
        delivery_date DATE NULL,
        language NVARCHAR(10) NULL,
        created DATETIME NULL,
        updated DATETIME NULL,
        last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Create indexes for better performance
        INDEX IX_PurchaseOrders_idpurchaseorder (idpurchaseorder),
        INDEX IX_PurchaseOrders_purchaseorderid (purchaseorderid),
        INDEX IX_PurchaseOrders_idsupplier (idsupplier),
        INDEX IX_PurchaseOrders_status (status),
        INDEX IX_PurchaseOrders_updated (updated)
    );
END
`;

// SQL script to create PurchaseOrderProducts table
const createPurchaseOrderProductsTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PurchaseOrderProducts')
BEGIN
    CREATE TABLE PurchaseOrderProducts (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idpurchaseorder_product INT NULL,
        idpurchaseorder INT NOT NULL,
        idproduct INT NOT NULL,
        idvatgroup INT NULL,
        productcode NVARCHAR(100) NULL,
        productcode_supplier NVARCHAR(100) NULL,
        name NVARCHAR(255) NULL,
        price DECIMAL(18,2) NULL,
        amount INT NOT NULL,
        amountreceived INT NULL,
        delivery_date DATE NULL,
        weight INT NULL,
        last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Create indexes for better performance
        INDEX IX_PurchaseOrderProducts_idpurchaseorder (idpurchaseorder),
        INDEX IX_PurchaseOrderProducts_idproduct (idproduct)
    );
END
`;

// SQL script to create PurchaseOrderComments table
const createPurchaseOrderCommentsTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PurchaseOrderComments')
BEGIN
    CREATE TABLE PurchaseOrderComments (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idpurchaseorder_comment INT NOT NULL,
        idpurchaseorder INT NOT NULL,
        iduser INT NULL,
        user_fullname NVARCHAR(255) NULL,
        comment NVARCHAR(MAX) NULL,
        created DATETIME NULL,
        last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Create indexes for better performance
        INDEX IX_PurchaseOrderComments_idpurchaseorder (idpurchaseorder),
        INDEX IX_PurchaseOrderComments_iduser (iduser)
    );
END
`;

// SQL script to update PurchaseOrders table with missing columns
const updatePurchaseOrdersTableSQL = `
-- Check if any columns need to be added to PurchaseOrders table
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'PurchaseOrders' AND COLUMN_NAME = 'idfulfilment_customer')
BEGIN
    ALTER TABLE PurchaseOrders ADD idfulfilment_customer INT NULL;
    PRINT 'Added missing column: idfulfilment_customer';
END

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'PurchaseOrders' AND COLUMN_NAME = 'language')
BEGIN
    ALTER TABLE PurchaseOrders ADD language NVARCHAR(10) NULL;
    PRINT 'Added missing column: language';
END

-- Check if any columns need to be added to PurchaseOrderProducts table
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'PurchaseOrderProducts' AND COLUMN_NAME = 'delivery_date')
BEGIN
    ALTER TABLE PurchaseOrderProducts ADD delivery_date DATE NULL;
    PRINT 'Added missing column: delivery_date to PurchaseOrderProducts';
END

PRINT 'PurchaseOrders schema update completed';
`;

module.exports = {
    createPurchaseOrdersTableSQL,
    createPurchaseOrderProductsTableSQL,
    createPurchaseOrderCommentsTableSQL,
    updatePurchaseOrdersTableSQL
};
