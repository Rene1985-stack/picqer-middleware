/**
 * Database schema for sync progress tracking
 * Enables resumable sync functionality for all entity types
 */

// SQL script to create SyncProgress table
const createSyncProgressTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SyncProgress')
BEGIN
    CREATE TABLE SyncProgress (
        id INT IDENTITY(1,1) PRIMARY KEY,
        entity_type NVARCHAR(50) NOT NULL,
        sync_id NVARCHAR(36) NOT NULL,
        current_offset INT NOT NULL DEFAULT 0,
        batch_number INT NOT NULL DEFAULT 0,
        total_batches INT NULL,
        items_processed INT NOT NULL DEFAULT 0,
        total_items INT NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'in_progress',
        started_at DATETIME NOT NULL DEFAULT GETDATE(),
        last_updated DATETIME NOT NULL DEFAULT GETDATE(),
        completed_at DATETIME NULL,
        
        -- Create indexes for better performance
        INDEX IX_SyncProgress_entity_type (entity_type),
        INDEX IX_SyncProgress_sync_id (sync_id),
        INDEX IX_SyncProgress_status (status),
        CONSTRAINT UC_SyncProgress_entity_type_sync_id UNIQUE (entity_type, sync_id)
    );
END
`;

module.exports = {
    createSyncProgressTableSQL
};
