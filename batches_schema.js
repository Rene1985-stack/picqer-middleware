/**
 * Complete Batches Schema - Strictly following Picqer API documentation
 * Includes ALL attributes from the Picqer API documentation
 */

// SQL to create Batches table with all documented fields
const createBatchesTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Batches')
BEGIN
  CREATE TABLE Batches (
    idbatch INT IDENTITY(1,1) PRIMARY KEY,
    idpicklist_batch INT NOT NULL,
    picklist_batchid NVARCHAR(255),
    idwarehouse INT,
    type NVARCHAR(50),
    status NVARCHAR(50),
    assigned_to NVARCHAR(MAX),
    completed_by NVARCHAR(MAX),
    total_products INT,
    total_picklists INT,
    completed_at DATETIME,
    created_at DATETIME,
    updated_at DATETIME,
    iduser INT,
    idfulfilment_customer INT,
    comment_count INT,
    last_sync_date DATETIME
  );
  
  CREATE UNIQUE INDEX idx_batches_idpicklist_batch ON Batches(idpicklist_batch);
END
`;

// SQL to create BatchProducts table
const createBatchProductsTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'BatchProducts')
BEGIN
  CREATE TABLE BatchProducts (
    id INT IDENTITY(1,1) PRIMARY KEY,
    idpicklist_batch INT NOT NULL,
    idproduct INT,
    name NVARCHAR(255),
    productcode NVARCHAR(255),
    productcode_supplier NVARCHAR(255),
    stock_location NVARCHAR(255),
    image NVARCHAR(MAX),
    barcodes NVARCHAR(MAX),
    amount INT,
    amount_picked INT,
    amount_collected INT,
    last_sync_date DATETIME,
    FOREIGN KEY (idpicklist_batch) REFERENCES Batches(idpicklist_batch)
  );
END
`;

// SQL to create BatchPicklists table
const createBatchPicklistsTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'BatchPicklists')
BEGIN
  CREATE TABLE BatchPicklists (
    id INT IDENTITY(1,1) PRIMARY KEY,
    idpicklist_batch INT NOT NULL,
    idpicklist INT,
    picklistid NVARCHAR(255),
    reference NVARCHAR(255),
    status NVARCHAR(50),
    alias NVARCHAR(255),
    picking_container NVARCHAR(255),
    total_products INT,
    delivery_name NVARCHAR(255),
    has_notes BIT,
    has_customer_remarks BIT,
    customer_remarks NVARCHAR(MAX),
    created_at DATETIME,
    last_sync_date DATETIME,
    FOREIGN KEY (idpicklist_batch) REFERENCES Batches(idpicklist_batch)
  );
END
`;

module.exports = {
  createBatchesTableSQL,
  createBatchProductsTableSQL,
  createBatchPicklistsTableSQL
};
