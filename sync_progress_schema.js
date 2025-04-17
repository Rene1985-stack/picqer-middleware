/**
 * Schema for SyncProgress table to track and resume sync operations
 */

const createSyncProgressTableSQL = `
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SyncProgress')
BEGIN
    CREATE TABLE SyncProgress (
        id INT IDENTITY(1,1) PRIMARY KEY,
        entity_type NVARCHAR(50) NOT NULL,
        sync_id NVARCHAR(100) NOT NULL,
        current_offset INT NOT NULL DEFAULT 0,
        batch_number INT NOT NULL DEFAULT 0,
        total_batches INT,
        items_processed INT NOT NULL DEFAULT 0,
        total_items INT,
        status NVARCHAR(50) NOT NULL DEFAULT 'in_progress',
        started_at DATETIME NOT NULL,
        last_updated DATETIME NOT NULL,
        completed_at DATETIME,
        CONSTRAINT UC_SyncProgress_entity_type_sync_id UNIQUE (entity_type, sync_id)
    );
    
    CREATE INDEX IX_SyncProgress_entity_type ON SyncProgress (entity_type);
    CREATE INDEX IX_SyncProgress_status ON SyncProgress (status);
    CREATE INDEX IX_SyncProgress_started_at ON SyncProgress (started_at);
END
`;

module.exports = {
    createSyncProgressTableSQL
};
