/**
 * Database schema for Picqer picklists
 * Based on the Picqer API documentation: https://picqer.com/en/api/picklists
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
        reference NVARCHAR(255) NULL,
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
        idfulfilment_customer INT NULL,
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
        idpicklist_product INT NOT NULL,
        idlocation INT NOT NULL,
        name NVARCHAR(255) NULL,
        amount INT NULL,
        last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Create indexes for better performance
        INDEX IX_PicklistProductLocations_idpicklist_product (idpicklist_product),
        INDEX IX_PicklistProductLocations_idlocation (idlocation)
    );
END
`;

module.exports = {
    createPicklistsTableSQL,
    createPicklistProductsTableSQL,
    createPicklistProductLocationsTableSQL
};
