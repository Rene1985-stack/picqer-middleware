/**
 * Database schema for Picqer warehouses
 * Based on the Picqer API documentation: https://picqer.com/en/api/warehouses
 */

// SQL script to create Warehouses table
const createWarehousesTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Warehouses')
BEGIN
    CREATE TABLE Warehouses (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idwarehouse INT NOT NULL,
        name NVARCHAR(255) NOT NULL,
        accept_orders BIT NOT NULL,
        counts_for_general_stock BIT NOT NULL,
        priority INT NOT NULL,
        active BIT NOT NULL,
        last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Create indexes for better performance
        INDEX IX_Warehouses_idwarehouse (idwarehouse),
        INDEX IX_Warehouses_name (name),
        INDEX IX_Warehouses_active (active)
    );
END
`;

// SQL script to create WarehouseStock table for warehouse-specific stock information
const createWarehouseStockTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'WarehouseStock')
BEGIN
    CREATE TABLE WarehouseStock (
        id INT IDENTITY(1,1) PRIMARY KEY,
        idwarehouse INT NOT NULL,
        idproduct INT NOT NULL,
        productcode NVARCHAR(100) NULL,
        stock INT NOT NULL DEFAULT 0,
        reserved INT NOT NULL DEFAULT 0,
        reservedbackorders INT NOT NULL DEFAULT 0,
        reservedpicklists INT NOT NULL DEFAULT 0,
        reservedallocations INT NOT NULL DEFAULT 0,
        freestock INT NOT NULL DEFAULT 0,
        last_sync_date DATETIME NOT NULL DEFAULT GETDATE(),
        
        -- Create indexes for better performance
        INDEX IX_WarehouseStock_idwarehouse (idwarehouse),
        INDEX IX_WarehouseStock_idproduct (idproduct),
        INDEX IX_WarehouseStock_productcode (productcode),
        CONSTRAINT UC_WarehouseStock_warehouse_product UNIQUE (idwarehouse, idproduct)
    );
END
`;

module.exports = {
    createWarehousesTableSQL,
    createWarehouseStockTableSQL
};
