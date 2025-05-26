/**
 * Adaptive Database schema for Picqer batches
 * Automatically handles schema changes and missing columns
 * Based on the Picqer API documentation: https://picqer.com/en/api/picklists/batches
 */

// SQL script to create Batches table with core fields
const createBatchesTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Batches')
BEGIN
    CREATE TABLE Batches (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idpicklist_batch INT NOT NULL,
        picklist_batchid NVARCHAR(100) NOT NULL,
        status NVARCHAR(50) NULL,
        created_at DATETIME NULL,
        updated_at DATETIME NULL,
        last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Create indexes for better performance
        INDEX IX_Batches_idpicklist_batch (idpicklist_batch),
        INDEX IX_Batches_picklist_batchid (picklist_batchid),
        INDEX IX_Batches_status (status),
        INDEX IX_Batches_updated_at (updated_at)
    );
END
`;

// SQL script to create BatchProducts table with core fields
const createBatchProductsTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'BatchProducts')
BEGIN
    CREATE TABLE BatchProducts (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idpicklist_batch INT NOT NULL,
        idproduct INT NULL,
        productcode NVARCHAR(100) NULL,
        name NVARCHAR(255) NULL,
        amount INT NULL,
        last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Create indexes for better performance
        INDEX IX_BatchProducts_idpicklist_batch (idpicklist_batch),
        INDEX IX_BatchProducts_idproduct (idproduct)
    );
END
`;

// SQL script to create BatchPicklists table with core fields
const createBatchPicklistsTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'BatchPicklists')
BEGIN
    CREATE TABLE BatchPicklists (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idpicklist_batch INT NOT NULL,
        idpicklist INT NULL,
        picklistid NVARCHAR(100) NULL,
        last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Create indexes for better performance
        INDEX IX_BatchPicklists_idpicklist_batch (idpicklist_batch),
        INDEX IX_BatchPicklists_idpicklist (idpicklist)
    );
END
`;

// Known Picqer API fields for Batches
const knownBatchFields = [
    { apiField: 'idpicklist_batch', dbColumn: 'idpicklist_batch', sqlType: 'INT' },
    { apiField: 'picklist_batchid', dbColumn: 'picklist_batchid', sqlType: 'NVARCHAR(100)' },
    { apiField: 'idwarehouse', dbColumn: 'idwarehouse', sqlType: 'INT' },
    { apiField: 'warehouse_id', dbColumn: 'warehouse_id', sqlType: 'INT' },
    { apiField: 'type', dbColumn: 'type', sqlType: 'NVARCHAR(50)' },
    { apiField: 'status', dbColumn: 'status', sqlType: 'NVARCHAR(50)' },
    { apiField: 'iduser', dbColumn: 'iduser', sqlType: 'INT' },
    { apiField: 'assigned_to_iduser', dbColumn: 'assigned_to_iduser', sqlType: 'INT' },
    { apiField: 'assigned_to_name', dbColumn: 'assigned_to_name', sqlType: 'NVARCHAR(255)' },
    { apiField: 'assigned_to_full_name', dbColumn: 'assigned_to_full_name', sqlType: 'NVARCHAR(255)' },
    { apiField: 'assigned_to_username', dbColumn: 'assigned_to_username', sqlType: 'NVARCHAR(100)' },
    { apiField: 'completed_by_iduser', dbColumn: 'completed_by_iduser', sqlType: 'INT' },
    { apiField: 'completed_by_name', dbColumn: 'completed_by_name', sqlType: 'NVARCHAR(255)' },
    { apiField: 'completed_by_full_name', dbColumn: 'completed_by_full_name', sqlType: 'NVARCHAR(255)' },
    { apiField: 'completed_by_username', dbColumn: 'completed_by_username', sqlType: 'NVARCHAR(100)' },
    { apiField: 'total_products', dbColumn: 'total_products', sqlType: 'INT' },
    { apiField: 'total_picklists', dbColumn: 'total_picklists', sqlType: 'INT' },
    { apiField: 'completed_at', dbColumn: 'completed_at', sqlType: 'DATETIME' },
    { apiField: 'created_at', dbColumn: 'created_at', sqlType: 'DATETIME' },
    { apiField: 'updated_at', dbColumn: 'updated_at', sqlType: 'DATETIME' },
    { apiField: 'idfulfilment_customer', dbColumn: 'idfulfilment_customer', sqlType: 'INT' },
    { apiField: 'notes', dbColumn: 'notes', sqlType: 'NVARCHAR(MAX)' },
    { apiField: 'batch_number', dbColumn: 'batch_number', sqlType: 'NVARCHAR(50)' },
    { apiField: 'closed_at', dbColumn: 'closed_at', sqlType: 'DATETIME' },
    { apiField: 'closed_by_iduser', dbColumn: 'closed_by_iduser', sqlType: 'INT' },
    { apiField: 'packing_started_at', dbColumn: 'packing_started_at', sqlType: 'DATETIME' },
    { apiField: 'picking_completed_at', dbColumn: 'picking_completed_at', sqlType: 'DATETIME' },
    { apiField: 'picking_started_at', dbColumn: 'picking_started_at', sqlType: 'DATETIME' }
];

// Known Picqer API fields for BatchProducts
const knownBatchProductFields = [
    { apiField: 'idpicklist_batch', dbColumn: 'idpicklist_batch', sqlType: 'INT' },
    { apiField: 'idproduct', dbColumn: 'idproduct', sqlType: 'INT' },
    { apiField: 'name', dbColumn: 'name', sqlType: 'NVARCHAR(255)' },
    { apiField: 'productcode', dbColumn: 'productcode', sqlType: 'NVARCHAR(100)' },
    { apiField: 'productcode_supplier', dbColumn: 'productcode_supplier', sqlType: 'NVARCHAR(100)' },
    { apiField: 'stock_location', dbColumn: 'stock_location', sqlType: 'NVARCHAR(255)' },
    { apiField: 'image', dbColumn: 'image', sqlType: 'NVARCHAR(255)' },
    { apiField: 'barcodes', dbColumn: 'barcodes', sqlType: 'NVARCHAR(MAX)' },
    { apiField: 'amount', dbColumn: 'amount', sqlType: 'INT' },
    { apiField: 'amount_picked', dbColumn: 'amount_picked', sqlType: 'INT' },
    { apiField: 'amount_collected', dbColumn: 'amount_collected', sqlType: 'INT' }
];

// Known Picqer API fields for BatchPicklists
const knownBatchPicklistFields = [
    { apiField: 'idpicklist_batch', dbColumn: 'idpicklist_batch', sqlType: 'INT' },
    { apiField: 'idpicklist', dbColumn: 'idpicklist', sqlType: 'INT' },
    { apiField: 'picklistid', dbColumn: 'picklistid', sqlType: 'NVARCHAR(100)' },
    { apiField: 'reference', dbColumn: 'reference', sqlType: 'NVARCHAR(255)' },
    { apiField: 'status', dbColumn: 'status', sqlType: 'NVARCHAR(50)' },
    { apiField: 'alias', dbColumn: 'alias', sqlType: 'NVARCHAR(50)' },
    { apiField: 'picking_container', dbColumn: 'picking_container', sqlType: 'NVARCHAR(100)' },
    { apiField: 'total_products', dbColumn: 'total_products', sqlType: 'INT' },
    { apiField: 'delivery_name', dbColumn: 'delivery_name', sqlType: 'NVARCHAR(255)' },
    { apiField: 'has_notes', dbColumn: 'has_notes', sqlType: 'BIT' },
    { apiField: 'has_customer_remarks', dbColumn: 'has_customer_remarks', sqlType: 'BIT' },
    { apiField: 'customer_remarks', dbColumn: 'customer_remarks', sqlType: 'NVARCHAR(MAX)' },
    { apiField: 'created_at', dbColumn: 'created_at', sqlType: 'DATETIME' }
];

// Generate SQL to check and add missing columns
const generateAddColumnSQL = (tableName, columnName, sqlType) => {
    return `
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = '${tableName}' AND COLUMN_NAME = '${columnName}'
)
BEGIN
    ALTER TABLE ${tableName} ADD ${columnName} ${sqlType};
    PRINT 'Added column ${columnName} to ${tableName}';
END
`;
};

// Generate SQL to check and add all known columns for a table
const generateAddAllColumnsSQL = (tableName, knownFields) => {
    let sql = '';
    
    for (const field of knownFields) {
        sql += generateAddColumnSQL(tableName, field.dbColumn, field.sqlType);
    }
    
    return sql;
};

// SQL to ensure all known batch fields exist
const ensureBatchColumnsSQL = generateAddAllColumnsSQL('Batches', knownBatchFields);

// SQL to ensure all known batch product fields exist
const ensureBatchProductColumnsSQL = generateAddAllColumnsSQL('BatchProducts', knownBatchProductFields);

// SQL to ensure all known batch picklist fields exist
const ensureBatchPicklistColumnsSQL = generateAddAllColumnsSQL('BatchPicklists', knownBatchPicklistFields);

module.exports = {
    createBatchesTableSQL,
    createBatchProductsTableSQL,
    createBatchPicklistsTableSQL,
    ensureBatchColumnsSQL,
    ensureBatchProductColumnsSQL,
    ensureBatchPicklistColumnsSQL,
    knownBatchFields,
    knownBatchProductFields,
    knownBatchPicklistFields
};
