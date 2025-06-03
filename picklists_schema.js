/**
 * Database schema for Picqer picklists
 * Based on the Picqer API documentation: https://picqer.com/en/api/picklists
 * Updated to include all fields from the Picqer API documentation
 */

// SQL script to create Picklists table
const createPicklistsTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Picklists')
BEGIN
    CREATE TABLE Picklists (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idpicklist INT NOT NULL,
        picklistid NVARCHAR(50) NOT NULL,
        idcustomer INT NULL,
        idorder INT NULL,
        idreturn INT NULL,
        idwarehouse INT NULL,
        idtemplate INT NULL,
        idpicklist_batch INT NULL,
        idshippingprovider_profile INT NULL,
        idfulfilment INT NULL,
        idfulfilment_customer INT NULL,
        iduser_assigned INT NULL,
        iduser_processed INT NULL,
        iduser_cancelled INT NULL,
        deliveryname NVARCHAR(255) NULL,
        deliverycontact NVARCHAR(255) NULL,
        deliveryaddress NVARCHAR(255) NULL,
        deliveryaddress2 NVARCHAR(255) NULL,
        deliveryzipcode NVARCHAR(50) NULL,
        deliverycity NVARCHAR(255) NULL,
        deliveryregion NVARCHAR(255) NULL,
        deliverycountry NVARCHAR(2) NULL,
        telephone NVARCHAR(50) NULL,
        emailaddress NVARCHAR(255) NULL,
        deliveryphone NVARCHAR(50) NULL,
        deliveryemail NVARCHAR(255) NULL,
        reference NVARCHAR(255) NULL,
        notes NVARCHAR(MAX) NULL,
        assigned_to_iduser INT NULL,
        invoiced BIT NULL,
        urgent BIT NULL,
        preferred_delivery_date DATE NULL,
        status NVARCHAR(50) NULL,
        totalproducts INT NULL,
        totalpicked INT NULL,
        weight INT NULL,
        snoozed_until DATETIME NULL,
        closed_by_iduser INT NULL,
        closed_at DATETIME NULL,
        created DATETIME NULL,
        updated DATETIME NULL,
        processed DATETIME NULL,
        cancelled DATETIME NULL,
        assigned DATETIME NULL,
        last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Create indexes for better performance
        INDEX IX_Picklists_idpicklist (idpicklist),
        INDEX IX_Picklists_picklistid (picklistid),
        INDEX IX_Picklists_idorder (idorder),
        INDEX IX_Picklists_status (status),
        INDEX IX_Picklists_updated (updated)
    );
END
`;

// SQL script to create PicklistProducts table
const createPicklistProductsTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PicklistProducts')
BEGIN
    CREATE TABLE PicklistProducts (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idpicklist_product INT NOT NULL,
        idpicklistproduct INT NULL,
        idpicklist INT NOT NULL,
        idproduct INT NOT NULL,
        idorder_product INT NULL,
        idreturn_product_replacement INT NULL,
        idvatgroup INT NULL,
        productcode NVARCHAR(100) NULL,
        name NVARCHAR(255) NULL,
        remarks NVARCHAR(MAX) NULL,
        amount INT NULL,
        amount_picked INT NULL,
        amount_processed INT NULL,
        amount_cancelled INT NULL,
        price DECIMAL(18,2) NULL,
        weight INT NULL,
        stocklocation NVARCHAR(255) NULL,
        partof_idpicklist_product INT NULL,
        has_parts BIT NULL,
        last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Create indexes for better performance
        INDEX IX_PicklistProducts_idpicklist_product (idpicklist_product),
        INDEX IX_PicklistProducts_idpicklist (idpicklist),
        INDEX IX_PicklistProducts_idproduct (idproduct)
    );
END
`;

// SQL script to create PicklistProductLocations table
const createPicklistProductLocationsTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PicklistProductLocations')
BEGIN
    CREATE TABLE PicklistProductLocations (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idpicklist INT NOT NULL,
        idpicklistproduct INT NULL,
        idpicklist_product INT NOT NULL,
        idproduct INT NOT NULL,
        idlocation INT NOT NULL,
        location NVARCHAR(255) NULL,
        name NVARCHAR(255) NULL,
        amount INT NULL,
        amount_processed INT NULL,
        amount_cancelled INT NULL,
        last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Create indexes for better performance
        INDEX IX_PicklistProductLocations_idpicklist_product (idpicklist_product),
        INDEX IX_PicklistProductLocations_idlocation (idlocation)
    );
END
`;

// SQL script to update Picklists table with missing columns
const updatePicklistsTableSQL = `
-- Check if 'assigned' column exists and add it if it doesn't
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Picklists' AND COLUMN_NAME = 'assigned')
BEGIN
    ALTER TABLE Picklists ADD assigned DATETIME NULL;
    PRINT 'Added missing column: assigned';
END

-- Check if 'processed' column exists and add it if it doesn't
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Picklists' AND COLUMN_NAME = 'processed')
BEGIN
    ALTER TABLE Picklists ADD processed DATETIME NULL;
    PRINT 'Added missing column: processed';
END

-- Check if 'cancelled' column exists and add it if it doesn't
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Picklists' AND COLUMN_NAME = 'cancelled')
BEGIN
    ALTER TABLE Picklists ADD cancelled DATETIME NULL;
    PRINT 'Added missing column: cancelled';
END

-- Check if 'iduser_assigned' column exists and add it if it doesn't
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Picklists' AND COLUMN_NAME = 'iduser_assigned')
BEGIN
    ALTER TABLE Picklists ADD iduser_assigned INT NULL;
    PRINT 'Added missing column: iduser_assigned';
END

-- Check if 'iduser_processed' column exists and add it if it doesn't
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Picklists' AND COLUMN_NAME = 'iduser_processed')
BEGIN
    ALTER TABLE Picklists ADD iduser_processed INT NULL;
    PRINT 'Added missing column: iduser_processed';
END

-- Check if 'iduser_cancelled' column exists and add it if it doesn't
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Picklists' AND COLUMN_NAME = 'iduser_cancelled')
BEGIN
    ALTER TABLE Picklists ADD iduser_cancelled INT NULL;
    PRINT 'Added missing column: iduser_cancelled';
END

-- Check if 'notes' column exists and add it if it doesn't
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Picklists' AND COLUMN_NAME = 'notes')
BEGIN
    ALTER TABLE Picklists ADD notes NVARCHAR(MAX) NULL;
    PRINT 'Added missing column: notes';
END

-- Check if 'idfulfilment' column exists and add it if it doesn't
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Picklists' AND COLUMN_NAME = 'idfulfilment')
BEGIN
    ALTER TABLE Picklists ADD idfulfilment INT NULL;
    PRINT 'Added missing column: idfulfilment';
END

-- Check if 'deliveryphone' column exists and add it if it doesn't
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Picklists' AND COLUMN_NAME = 'deliveryphone')
BEGIN
    ALTER TABLE Picklists ADD deliveryphone NVARCHAR(50) NULL;
    PRINT 'Added missing column: deliveryphone';
END

-- Check if 'deliveryemail' column exists and add it if it doesn't
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Picklists' AND COLUMN_NAME = 'deliveryemail')
BEGIN
    ALTER TABLE Picklists ADD deliveryemail NVARCHAR(255) NULL;
    PRINT 'Added missing column: deliveryemail';
END

PRINT 'Picklists table update completed';
`;

module.exports = {
    createPicklistsTableSQL,
    createPicklistProductsTableSQL,
    createPicklistProductLocationsTableSQL,
    updatePicklistsTableSQL
};
