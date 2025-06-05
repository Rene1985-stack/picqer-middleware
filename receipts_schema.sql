-- Receipts Schema for Picqer Middleware - API Documentation Compliant
-- Creates tables for storing receipt data exactly as per Picqer API documentation

-- Create Receipts table with exact API attributes
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Receipts]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Receipts](
        [idreceipt] [int] NOT NULL PRIMARY KEY,
        [idwarehouse] [int] NULL,
        [version] [int] NULL,
        [supplier_idsupplier] [int] NULL,
        [supplier_name] [nvarchar](255) NULL,
        [purchaseorder_idpurchaseorder] [int] NULL,
        [purchaseorder_purchaseorderid] [nvarchar](100) NULL,
        [receiptid] [nvarchar](100) NULL,
        [status] [nvarchar](50) NULL,
        [remarks] [nvarchar](max) NULL,
        [completed_by_iduser] [int] NULL,
        [completed_by_name] [nvarchar](255) NULL,
        [amount_received] [int] NULL,
        [amount_received_excessive] [int] NULL,
        [completed_at] [datetime] NULL,
        [created] [datetime] NULL,
        [last_sync_date] [datetime] NULL
    )
    PRINT 'Created Receipts table with API-compliant schema'
END
ELSE
BEGIN
    PRINT 'Receipts table already exists'
END

-- Create ReceiptProducts table with exact API attributes
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ReceiptProducts]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[ReceiptProducts](
        [idreceipt_product] [int] NOT NULL PRIMARY KEY,
        [idreceipt] [int] NOT NULL,
        [idpurchaseorder_product] [int] NULL,
        [idproduct] [int] NULL,
        [idpurchaseorder] [int] NULL,
        [productcode] [nvarchar](100) NULL,
        [name] [nvarchar](255) NULL,
        [amount] [int] NULL,
        [amount_ordered] [int] NULL,
        [amount_previously_received] [int] NULL,
        [added_by_receipt] [bit] NULL,
        [stock_location_v1] [nvarchar](255) NULL,
        [location_v2] [nvarchar](255) NULL,
        [created_at] [datetime] NULL,
        [received_by_iduser] [int] NULL,
        [reverted_at] [datetime] NULL,
        [reverted_by_iduser] [int] NULL
    )
    PRINT 'Created ReceiptProducts table with API-compliant schema'
END
ELSE
BEGIN
    PRINT 'ReceiptProducts table already exists'
END

-- Add foreign key constraint if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE object_id = OBJECT_ID(N'[dbo].[FK_ReceiptProducts_Receipts]') AND parent_object_id = OBJECT_ID(N'[dbo].[ReceiptProducts]'))
BEGIN
    ALTER TABLE [dbo].[ReceiptProducts] WITH CHECK ADD CONSTRAINT [FK_ReceiptProducts_Receipts] FOREIGN KEY([idreceipt])
    REFERENCES [dbo].[Receipts] ([idreceipt])
    ON DELETE CASCADE
    PRINT 'Added foreign key constraint FK_ReceiptProducts_Receipts'
END
ELSE
BEGIN
    PRINT 'Foreign key constraint FK_ReceiptProducts_Receipts already exists'
END

-- Update SyncStatus table to include receipts if needed
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SyncStatus]') AND type in (N'U'))
BEGIN
    IF NOT EXISTS (SELECT * FROM SyncStatus WHERE entity_type = 'receipts')
    BEGIN
        INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
        VALUES ('receipts', 'receipts', GETDATE())
        PRINT 'Added receipts record to SyncStatus table'
    END
    ELSE
    BEGIN
        PRINT 'Receipts record already exists in SyncStatus table'
    END
END
ELSE
BEGIN
    PRINT 'SyncStatus table does not exist'
END

PRINT 'API-compliant receipts schema setup completed'

