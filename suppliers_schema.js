/**
 * Database schema for Picqer suppliers
 * Based on the Picqer API documentation: https://picqer.com/en/api/suppliers
 */

// SQL script to create Suppliers table
const createSuppliersTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Suppliers')
BEGIN
    CREATE TABLE Suppliers (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idsupplier INT NOT NULL,
        name NVARCHAR(255) NOT NULL,
        contactname NVARCHAR(255) NULL,
        address NVARCHAR(255) NULL,
        address2 NVARCHAR(255) NULL,
        zipcode NVARCHAR(50) NULL,
        city NVARCHAR(255) NULL,
        region NVARCHAR(255) NULL,
        country NVARCHAR(2) NULL,
        telephone NVARCHAR(50) NULL,
        emailaddress NVARCHAR(255) NULL,
        remarks NVARCHAR(MAX) NULL,
        language NVARCHAR(10) NULL,
        active BIT NOT NULL DEFAULT 1,
        last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Create indexes for better performance
        INDEX IX_Suppliers_idsupplier (idsupplier),
        INDEX IX_Suppliers_name (name),
        INDEX IX_Suppliers_active (active)
    );
END
`;

// SQL script to create SupplierProducts table for products linked to suppliers
const createSupplierProductsTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SupplierProducts')
BEGIN
    CREATE TABLE SupplierProducts (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idsupplier INT NOT NULL,
        idproduct INT NOT NULL,
        supplier_productcode NVARCHAR(100) NULL,
        purchase_price DECIMAL(18,4) NULL,
        purchase_price_currency NVARCHAR(3) NULL,
        delivery_time_days INT NULL,
        minimum_purchase_quantity INT NULL,
        purchase_in_quantities_of INT NULL,
        last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Create indexes for better performance
        INDEX IX_SupplierProducts_idsupplier (idsupplier),
        INDEX IX_SupplierProducts_idproduct (idproduct),
        CONSTRAINT UC_SupplierProducts_supplier_product UNIQUE (idsupplier, idproduct)
    );
END
`;

module.exports = {
    createSuppliersTableSQL,
    createSupplierProductsTableSQL
};
