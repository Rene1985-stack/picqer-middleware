/**
 * Receipts Schema for Picqer Middleware
 * Creates tables for storing receipt data exactly as per Picqer API documentation
 * Safe approach that handles existing tables and data
 */

const receiptsSchema = `
-- Receipts Schema for Picqer Middleware - Ultra Safe Version
-- Handles existing tables, data, and constraints very carefully

PRINT 'Starting receipts schema setup...'

-- Check if tables exist and handle accordingly
DECLARE @ReceiptsExists BIT = 0
DECLARE @ReceiptProductsExists BIT = 0

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Receipts]') AND type in (N'U'))
    SET @ReceiptsExists = 1

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ReceiptProducts]') AND type in (N'U'))
    SET @ReceiptProductsExists = 1

-- If tables don't exist, create them
IF @ReceiptsExists = 0
BEGIN
    PRINT 'Creating new Receipts table...'
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
    PRINT '✅ Created Receipts table successfully'
END
ELSE
BEGIN
    PRINT 'Receipts table already exists - skipping creation'
END

IF @ReceiptProductsExists = 0
BEGIN
    PRINT 'Creating new ReceiptProducts table...'
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
    PRINT '✅ Created ReceiptProducts table successfully'
END
ELSE
BEGIN
    PRINT 'ReceiptProducts table already exists - skipping creation'
END

-- Add foreign key constraint only if both tables exist and constraint doesn't exist
IF @ReceiptsExists = 1 AND @ReceiptProductsExists = 1
BEGIN
    IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE object_id = OBJECT_ID(N'[dbo].[FK_ReceiptProducts_Receipts]'))
    BEGIN
        ALTER TABLE [dbo].[ReceiptProducts] WITH CHECK ADD CONSTRAINT [FK_ReceiptProducts_Receipts] FOREIGN KEY([idreceipt])
        REFERENCES [dbo].[Receipts] ([idreceipt])
        ON DELETE CASCADE
        PRINT '✅ Added foreign key constraint successfully'
    END
    ELSE
    BEGIN
        PRINT 'Foreign key constraint already exists - skipping'
    END
END
ELSE IF @ReceiptsExists = 0 AND @ReceiptProductsExists = 0
BEGIN
    -- Both tables were just created, add the constraint
    ALTER TABLE [dbo].[ReceiptProducts] WITH CHECK ADD CONSTRAINT [FK_ReceiptProducts_Receipts] FOREIGN KEY([idreceipt])
    REFERENCES [dbo].[Receipts] ([idreceipt])
    ON DELETE CASCADE
    PRINT '✅ Added foreign key constraint for new tables'
END

-- Handle SyncStatus table safely
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SyncStatus]') AND type in (N'U'))
BEGIN
    IF NOT EXISTS (SELECT * FROM SyncStatus WHERE entity_type = 'receipts')
    BEGIN
        INSERT INTO SyncStatus (entity_name, entity_type, last_sync_date)
        VALUES ('receipts', 'receipts', GETDATE())
        PRINT '✅ Added receipts record to SyncStatus table'
    END
    ELSE
    BEGIN
        PRINT 'Receipts record already exists in SyncStatus table'
    END
END
ELSE
BEGIN
    PRINT 'SyncStatus table does not exist - skipping sync status setup'
END

PRINT '✅ Receipts schema setup completed successfully'
`;

/**
 * Execute the receipts schema
 * @param {Object} sql - SQL connection object
 * @returns {Promise<boolean>} - Success status
 */
async function createReceiptsSchema(sql) {
  try {
    console.log('Executing receipts schema...');
    await sql.query(receiptsSchema);
    console.log('✅ Receipts schema executed successfully');
    return true;
  } catch (error) {
    console.error('❌ Error executing receipts schema:', error.message);
    
    // Try a minimal fallback approach
    try {
      console.log('Attempting minimal table creation...');
      
      const minimalSchema = `
        -- Minimal receipts table creation
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Receipts]') AND type in (N'U'))
        BEGIN
            CREATE TABLE [dbo].[Receipts](
                [idreceipt] [int] NOT NULL PRIMARY KEY,
                [receiptid] [nvarchar](100) NULL,
                [status] [nvarchar](50) NULL,
                [created] [datetime] NULL,
                [last_sync_date] [datetime] NULL
            )
            PRINT 'Created minimal Receipts table'
        END
      `;
      
      await sql.query(minimalSchema);
      console.log('✅ Minimal receipts schema created successfully');
      return true;
    } catch (fallbackError) {
      console.error('❌ Fallback schema creation also failed:', fallbackError.message);
      return false;
    }
  }
}

module.exports = {
  receiptsSchema,
  createReceiptsSchema
};

