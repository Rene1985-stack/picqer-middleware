/**
 * Comprehensive fixed schema for Picqer batches
 * Includes all fields from the Picqer API documentation
 */

const createBatchesTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Batches')
BEGIN
    CREATE TABLE Batches (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idpicklist_batch INT NOT NULL,
        picklist_batchid NVARCHAR(255),
        status NVARCHAR(50),
        created_at DATETIME,
        updated_at DATETIME,
        iduser INT,
        idwarehouse INT,
        idfulfilment_customer INT,
        assigned_to NVARCHAR(255),
        completed_by NVARCHAR(255),
        comment_count INT,
        last_sync_date DATETIME
    );
    
    CREATE UNIQUE INDEX IX_Batches_idpicklist_batch ON Batches(idpicklist_batch);
END
`;

const createBatchProductsTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'BatchProducts')
BEGIN
    CREATE TABLE BatchProducts (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idpicklist_batch INT NOT NULL,
        idproduct INT,
        name NVARCHAR(255),
        productcode NVARCHAR(100),
        productcode_supplier NVARCHAR(100),
        stock_location NVARCHAR(255),
        image NVARCHAR(255),
        barcodes NVARCHAR(MAX),
        amount INT,
        amount_picked INT,
        amount_collected INT,
        last_sync_date DATETIME,
        FOREIGN KEY (idpicklist_batch) REFERENCES Batches(idpicklist_batch) ON DELETE CASCADE
    );
    
    CREATE INDEX IX_BatchProducts_idpicklist_batch ON BatchProducts(idpicklist_batch);
END
`;

const createBatchPicklistsTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'BatchPicklists')
BEGIN
    CREATE TABLE BatchPicklists (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idpicklist_batch INT NOT NULL,
        idpicklist INT,
        picklistid NVARCHAR(100),
        reference NVARCHAR(255),
        status NVARCHAR(50),
        alias NVARCHAR(255),
        picking_container NVARCHAR(100),
        total_products INT,
        delivery_name NVARCHAR(255),
        has_notes BIT,
        has_customer_remarks BIT,
        customer_remarks NVARCHAR(MAX),
        created_at DATETIME,
        last_sync_date DATETIME,
        FOREIGN KEY (idpicklist_batch) REFERENCES Batches(idpicklist_batch) ON DELETE CASCADE
    );
    
    CREATE INDEX IX_BatchPicklists_idpicklist_batch ON BatchPicklists(idpicklist_batch);
END
`;

module.exports = {
    createBatchesTableSQL,
    createBatchProductsTableSQL,
    createBatchPicklistsTableSQL
};
