/**
 * Database schema for Picqer batches
 * Based on the Picqer API documentation: https://picqer.com/en/api/picklists/batches
 */

// SQL script to create Batches table
const createBatchesTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Batches')
BEGIN
    CREATE TABLE Batches (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idpicklist_batch INT NOT NULL,
        picklist_batchid NVARCHAR(50) NOT NULL,
        idwarehouse INT NULL,
        iduser_created INT NULL,
        iduser_assigned INT NULL,
        iduser_processed INT NULL,
        iduser_cancelled INT NULL,
        status NVARCHAR(50) NULL,
        created DATETIME NULL,
        updated DATETIME NULL,
        processed DATETIME NULL,
        cancelled DATETIME NULL,
        assigned DATETIME NULL,
        last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Create indexes for better performance
        INDEX IX_Batches_idpicklist_batch (idpicklist_batch),
        INDEX IX_Batches_picklist_batchid (picklist_batchid),
        INDEX IX_Batches_idwarehouse (idwarehouse),
        INDEX IX_Batches_status (status),
        INDEX IX_Batches_updated (updated)
    );
END
ELSE
BEGIN
    -- Check if idfulfilment_customer column exists and add it if it doesn't
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Batches' AND COLUMN_NAME = 'idfulfilment_customer')
    BEGIN
        ALTER TABLE Batches ADD idfulfilment_customer INT NULL;
        PRINT 'Added missing idfulfilment_customer column to Batches table';
    END
END
`;

// SQL script to create BatchProducts table
const createBatchProductsTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'BatchProducts')
BEGIN
    CREATE TABLE BatchProducts (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idpicklist_batch INT NOT NULL,
        idproduct INT NOT NULL,
        name NVARCHAR(255) NULL,
        productcode NVARCHAR(100) NULL,
        productcode_supplier NVARCHAR(100) NULL,
        stock_location NVARCHAR(255) NULL,
        image NVARCHAR(255) NULL,
        barcodes NVARCHAR(MAX) NULL,
        amount INT NULL,
        amount_picked INT NULL,
        amount_collected INT NULL,
        last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Create indexes for better performance
        INDEX IX_BatchProducts_idpicklist_batch (idpicklist_batch),
        INDEX IX_BatchProducts_idproduct (idproduct)
    );
END
`;

// SQL script to create BatchPicklists table
const createBatchPicklistsTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'BatchPicklists')
BEGIN
    CREATE TABLE BatchPicklists (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idpicklist_batch INT NOT NULL,
        idpicklist INT NOT NULL,
        picklistid NVARCHAR(50) NULL,
        reference NVARCHAR(255) NULL,
        status NVARCHAR(50) NULL,
        alias NVARCHAR(50) NULL,
        picking_container NVARCHAR(100) NULL,
        total_products INT NULL,
        delivery_name NVARCHAR(255) NULL,
        has_notes BIT NULL,
        has_customer_remarks BIT NULL,
        customer_remarks NVARCHAR(MAX) NULL,
        created_at DATETIME NULL,
        last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Create indexes for better performance
        INDEX IX_BatchPicklists_idpicklist_batch (idpicklist_batch),
        INDEX IX_BatchPicklists_idpicklist (idpicklist)
    );
END
`;

module.exports = {
    createBatchesTableSQL,
    createBatchProductsTableSQL,
    createBatchPicklistsTableSQL
};
