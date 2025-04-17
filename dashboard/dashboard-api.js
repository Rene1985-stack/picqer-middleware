// enhanced-dashboard-api.js - Enhanced backend API for the middleware dashboard with entity-specific functionality

const express = require('express');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const sql = require('mssql');
const router = express.Router();

// Import services
const PicqerService = require('../optimized_product_service');
const PicklistService = require('../resumable_picklist-service');
const WarehouseService = require('../warehouse_service');
const UserService = require('../user_service');
const SupplierService = require('../supplier_service');

// In-memory storage for logs and sync history (replace with database in production)
let logs = [];
let syncHistory = [];
let emailSettings = {
    email: '',
    notifyErrors: false,
    notifySync: false
};

// Constants
const MAX_LOGS = 100;
const LOGS_FILE = path.join(__dirname, 'logs.json');
const HISTORY_FILE = path.join(__dirname, 'history.json');
const EMAIL_SETTINGS_FILE = path.join(__dirname, 'email-settings.json');

// Initialize data from files if they exist
try {
    if (fs.existsSync(LOGS_FILE)) {
        logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
    }
    if (fs.existsSync(HISTORY_FILE)) {
        syncHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    }
    if (fs.existsSync(EMAIL_SETTINGS_FILE)) {
        emailSettings = JSON.parse(fs.readFileSync(EMAIL_SETTINGS_FILE, 'utf8'));
    }
} catch (error) {
    console.error('Error loading dashboard data:', error);
}

// Save data to files
function saveLogs() {
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs), 'utf8');
}

function saveHistory() {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(syncHistory), 'utf8');
}

function saveEmailSettings() {
    fs.writeFileSync(EMAIL_SETTINGS_FILE, JSON.stringify(emailSettings), 'utf8');
}

// Logging functions
function addLog(level, message) {
    const log = {
        timestamp: new Date().toISOString(),
        level,
        message
    };
    
    logs.unshift(log); // Add to beginning for newest first
    
    // Limit log size
    if (logs.length > MAX_LOGS) {
        logs = logs.slice(0, MAX_LOGS);
    }
    
    saveLogs();
    
    // Send email notification for errors if enabled
    if (level === 'error' && emailSettings.notifyErrors && emailSettings.email) {
        sendEmailNotification(
            'Picqer Middleware Error Alert',
            `An error occurred in your Picqer middleware:\n\n${message}\n\nTimestamp: ${log.timestamp}`
        );
    }
    
    return log;
}

// Add sync record to history
function addSyncRecord(success, entity_type = 'all', count = null, message = null, sync_id = null) {
    const record = {
        timestamp: new Date().toISOString(),
        success,
        entity_type,
        count,
        message,
        sync_id
    };
    
    syncHistory.unshift(record); // Add to beginning for newest first
    
    // Limit history size
    if (syncHistory.length > 50) {
        syncHistory = syncHistory.slice(0, 50);
    }
    
    saveHistory();
    
    // Send email notification for successful syncs if enabled
    if (success && emailSettings.notifySync && emailSettings.email) {
        sendEmailNotification(
            `Picqer Middleware ${entity_type.charAt(0).toUpperCase() + entity_type.slice(1)} Sync Completed`,
            `A ${entity_type} synchronization has completed successfully:\n\n${count ? `${count} items synchronized` : 'Synchronization completed'}\n\nTimestamp: ${record.timestamp}`
        );
    }
    
    return record;
}

// Email notification function
function sendEmailNotification(subject, body) {
    // This is a simple implementation. In production, use a proper email service.
    // For Railway, you might want to use a service like SendGrid, Mailgun, etc.
    
    // Create a test account at ethereal.email for development
    nodemailer.createTestAccount().then(account => {
        // Create a transporter
        const transporter = nodemailer.createTransport({
            host: account.smtp.host,
            port: account.smtp.port,
            secure: account.smtp.secure,
            auth: {
                user: account.user,
                pass: account.pass
            }
        });
        
        // Setup email data
        const mailOptions = {
            from: '"Picqer Middleware" <middleware@example.com>',
            to: emailSettings.email,
            subject: subject,
            text: body
        };
        
        // Send mail
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                addLog('error', `Failed to send email notification: ${error.message}`);
                return;
            }
            
            addLog('info', `Email notification sent: ${info.messageId}`);
            console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
        });
    }).catch(error => {
        addLog('error', `Failed to create email test account: ${error.message}`);
    });
}

// Initialize services with configuration
function initializeServices(config) {
    const apiKey = process.env.PICQER_API_KEY;
    const baseUrl = process.env.PICQER_API_URL || 'https://skapa-global.picqer.com/api/v1';
    
    const sqlConfig = {
        server: process.env.DB_SERVER,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        options: {
            encrypt: true,
            trustServerCertificate: false
        }
    };
    
    return {
        products: new PicqerService(apiKey, baseUrl, sqlConfig),
        picklists: new PicklistService(apiKey, baseUrl, sqlConfig),
        warehouses: new WarehouseService(apiKey, baseUrl, sqlConfig),
        users: new UserService(apiKey, baseUrl, sqlConfig),
        suppliers: new SupplierService(apiKey, baseUrl, sqlConfig)
    };
}

// Routes

// Serve the enhanced dashboard HTML
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'enhanced-dashboard-with-entities.html'));
});

// Get middleware status
router.get('/status', (req, res) => {
    // In a real implementation, you would check if the middleware is actually running
    res.json({
        online: true,
        version: '1.0.0',
        uptime: process.uptime()
    });
});

// Get logs
router.get('/logs', (req, res) => {
    res.json({
        logs: logs
    });
});

// Clear logs
router.post('/logs/clear', (req, res) => {
    logs = [];
    saveLogs();
    addLog('info', 'Logs cleared by user');
    res.json({ success: true, message: 'Logs cleared' });
});

// Get sync statistics
router.get('/stats', async (req, res) => {
    try {
        // Initialize services
        const services = initializeServices();
        
        // Get database connection
        const sqlConfig = {
            server: process.env.DB_SERVER,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            options: {
                encrypt: true,
                trustServerCertificate: false
            }
        };
        
        const pool = await sql.connect(sqlConfig);
        
        // Get counts for each entity
        const productsResult = await pool.request().query('SELECT COUNT(*) AS count FROM Products');
        const picklistsResult = await pool.request().query('SELECT COUNT(*) AS count FROM Picklists');
        const warehousesResult = await pool.request().query('SELECT COUNT(*) AS count FROM Warehouses');
        const usersResult = await pool.request().query('SELECT COUNT(*) AS count FROM Users');
        const suppliersResult = await pool.request().query('SELECT COUNT(*) AS count FROM Suppliers');
        
        // Get last sync dates and counts
        const syncStatusResult = await pool.request().query('SELECT * FROM SyncStatus');
        
        // Create entity-specific stats
        const entityStats = {};
        
        // Process sync status records
        if (syncStatusResult.recordset) {
            syncStatusResult.recordset.forEach(record => {
                const entityType = record.entity_type;
                if (entityType) {
                    entityStats[entityType] = {
                        count: 0,
                        lastSync: record.last_sync_date,
                        status: 'Ready',
                        lastSyncCount: record.last_sync_count || 0
                    };
                }
            });
        }
        
        // Set counts from database queries
        entityStats.products = entityStats.products || {};
        entityStats.products.count = productsResult.recordset[0].count;
        
        entityStats.picklists = entityStats.picklists || {};
        entityStats.picklists.count = picklistsResult.recordset[0].count;
        
        entityStats.warehouses = entityStats.warehouses || {};
        entityStats.warehouses.count = warehousesResult.recordset[0].count;
        
        entityStats.users = entityStats.users || {};
        entityStats.users.count = usersResult.recordset[0].count;
        
        entityStats.suppliers = entityStats.suppliers || {};
        entityStats.suppliers.count = suppliersResult.recordset[0].count;
        
        // Get sync progress if any sync is in progress
        const syncProgressResult = await pool.request().query(`
            SELECT * FROM SyncProgress 
            WHERE status = 'in_progress' 
            ORDER BY last_updated DESC
        `);
        
        let syncProgress = null;
        if (syncProgressResult.recordset && syncProgressResult.recordset.length > 0) {
            const progressRecord = syncProgressResult.recordset[0];
            syncProgress = {
                entityType: progressRecord.entity_type,
                syncId: progressRecord.sync_id,
                itemsProcessed: progressRecord.items_processed,
                totalItems: progressRecord.total_items || 0,
                batchNumber: progressRecord.batch_number,
                totalBatches: progressRecord.total_batches || 0,
                startedAt: progressRecord.started_at,
                lastUpdated: progressRecord.last_updated
            };
            
            // Update status of the entity that's currently syncing
            if (entityStats[progressRecord.entity_type]) {
                entityStats[progressRecord.entity_type].status = 'Syncing';
            }
        }
        
        // Get the most recent sync timestamp
        const lastSync = syncHistory.length > 0 ? syncHistory[0].timestamp : null;
        
        // Calculate next sync time (1 hour after last sync)
        let nextSync = null;
        if (lastSync) {
            const lastSyncDate = new Date(lastSync);
            nextSync = new Date(lastSyncDate.getTime() + 60 * 60 * 1000).toISOString();
        }
        
        res.json({
            totalProducts: entityStats.products.count,
            totalPicklists: entityStats.picklists.count,
            totalWarehouses: entityStats.warehouses.count,
            totalUsers: entityStats.users.count,
            totalSuppliers: entityStats.suppliers.count,
            lastSync,
            nextSync,
            syncStatus: syncProgress ? 'Running' : 'Ready',
            syncProgress,
            entities: entityStats
        });
    } catch (error) {
        console.error('Error getting stats:', error);
        addLog('error', `Error getting stats: ${error.message}`);
        
        res.json({
            totalProducts: 0,
            totalPicklists: 0,
            totalWarehouses: 0,
            totalUsers: 0,
            totalSuppliers: 0,
            lastSync: null,
            nextSync: null,
            syncStatus: 'Error',
            error: error.message
        });
    }
});

// Get sync history
router.get('/history', (req, res) => {
    res.json({
        history: syncHistory
    });
});

// Get email settings
router.get('/email', (req, res) => {
    res.json(emailSettings);
});

// Update email settings
router.post('/email', (req, res) => {
    const { email, notifyErrors, notifySync } = req.body;
    
    emailSettings = {
        email: email || '',
        notifyErrors: !!notifyErrors,
        notifySync: !!notifySync
    };
    
    saveEmailSettings();
    addLog('info', `Email notification settings updated: ${email}`);
    
    res.json({
        success: true,
        message: 'Email settings updated',
        settings: emailSettings
    });
});

// Sync all entities
router.post('/sync', async (req, res) => {
    const fullSync = req.query.full === 'true';
    
    try {
        // Initialize services
        const services = initializeServices();
        
        // Log sync start
        addLog('info', `Starting ${fullSync ? 'full' : 'incremental'} sync for all entities`);
        
        // Send immediate response to prevent timeout
        res.json({
            success: true,
            message: `${fullSync ? 'Full' : 'Incremental'} sync started for all entities`
        });
        
        // Start sync processes for each entity
        syncEntity(services.products, 'products', fullSync);
        syncEntity(services.picklists, 'picklists', fullSync);
        syncEntity(services.warehouses, 'warehouses', fullSync);
        syncEntity(services.users, 'users', fullSync);
        syncEntity(services.suppliers, 'suppliers', fullSync);
    } catch (error) {
        console.error('Error starting sync:', error);
        addLog('error', `Error starting sync: ${error.message}`);
        
        res.status(500).json({
            success: false,
            message: `Error starting sync: ${error.message}`
        });
    }
});

// Sync specific entity
router.post('/sync/:entity', async (req, res) => {
    const entityType = req.params.entity;
    const fullSync = req.query.full === 'true';
    
    try {
        // Initialize services
        const services = initializeServices();
        
        // Check if entity type is valid
        if (!services[entityType]) {
            throw new Error(`Invalid entity type: ${entityType}`);
        }
        
        // Log sync start
        addLog('info', `Starting ${fullSync ? 'full' : 'incremental'} sync for ${entityType}`);
        
        // Send immediate response to prevent timeout
        res.json({
            success: true,
            message: `${fullSync ? 'Full' : 'Incremental'} sync started for ${entityType}`
        });
        
        // Start sync process for the entity
        syncEntity(services[entityType], entityType, fullSync);
    } catch (error) {
        console.error(`Error starting ${entityType} sync:`, error);
        addLog('error', `Error starting ${entityType} sync: ${error.message}`);
        
        res.status(500).json({
            success: false,
            message: `Error starting ${entityType} sync: ${error.message}`
        });
    }
});

// Retry failed sync
router.post('/sync/retry/:syncId', async (req, res) => {
    const syncId = req.params.syncId;
    
    try {
        // Initialize services
        const services = initializeServices();
        
        // Get sync record from database
        const sqlConfig = {
            server: process.env.DB_SERVER,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            options: {
                encrypt: true,
                trustServerCertificate: false
            }
        };
        
        const pool = await sql.connect(sqlConfig);
        
        const syncResult = await pool.request()
            .input('syncId', sql.NVarChar, syncId)
            .query(`
                SELECT * FROM SyncProgress 
                WHERE sync_id = @syncId
            `);
        
        if (syncResult.recordset.length === 0) {
            throw new Error(`No sync record found with ID: ${syncId}`);
        }
        
        const syncRecord = syncResult.recordset[0];
        const entityType = syncRecord.entity_type;
        
        // Check if entity type is valid
        if (!services[entityType]) {
            throw new Error(`Invalid entity type: ${entityType}`);
        }
        
        // Log retry start
        addLog('info', `Retrying failed sync for ${entityType} with ID: ${syncId}`);
        
        // Send immediate response to prevent timeout
        res.json({
            success: true,
            message: `Retry started for ${entityType} sync with ID: ${syncId}`
        });
        
        // Start retry process
        retrySync(services[entityType], entityType, syncId);
    } catch (error) {
        console.error(`Error retrying sync ${syncId}:`, error);
        addLog('error', `Error retrying sync: ${error.message}`);
        
        res.status(500).json({
            success: false,
            message: `Error retrying sync: ${error.message}`
        });
    }
});

// Helper function to sync an entity
async function syncEntity(service, entityType, fullSync) {
    try {
        // Initialize database if needed
        switch (entityType) {
            case 'products':
                await service.initializeProductsDatabase();
                break;
            case 'picklists':
                await service.initializePicklistsDatabase();
                break;
            case 'warehouses':
                await service.initializeWarehousesDatabase();
                break;
            case 'users':
                await service.initializeUsersDatabase();
                break;
            case 'suppliers':
                await service.initializeSuppliersDatabase();
                break;
        }
        
        // Perform sync
        let result;
        if (fullSync) {
            switch (entityType) {
                case 'products':
                    result = await service.performFullProductsSync();
                    break;
                case 'picklists':
                    result = await service.performFullPicklistsSync();
                    break;
                case 'warehouses':
                    result = await service.performFullWarehousesSync();
                    break;
                case 'users':
                    result = await service.performFullUsersSync();
                    break;
                case 'suppliers':
                    result = await service.performFullSuppliersSync();
                    break;
            }
        } else {
            switch (entityType) {
                case 'products':
                    result = await service.performIncrementalProductsSync();
                    break;
                case 'picklists':
                    result = await service.performIncrementalPicklistsSync();
                    break;
                case 'warehouses':
                    result = await service.performIncrementalWarehousesSync();
                    break;
                case 'users':
                    result = await service.performIncrementalUsersSync();
                    break;
                case 'suppliers':
                    result = await service.performIncrementalSuppliersSync();
                    break;
            }
        }
        
        // Log result
        if (result.success) {
            addLog('success', `${entityType} sync completed: ${result.message}`);
            addSyncRecord(true, entityType, result.savedCount, result.message);
        } else {
            addLog('error', `${entityType} sync failed: ${result.message}`);
            addSyncRecord(false, entityType, 0, result.message, result.syncId);
        }
    } catch (error) {
        console.error(`Error in ${entityType} sync:`, error);
        addLog('error', `Error in ${entityType} sync: ${error.message}`);
        addSyncRecord(false, entityType, 0, `Error: ${error.message}`);
    }
}

// Helper function to retry a failed sync
async function retrySync(service, entityType, syncId) {
    try {
        // Perform retry
        let result;
        switch (entityType) {
            case 'products':
                result = await service.retryFailedProductsSync(syncId);
                break;
            case 'picklists':
                result = await service.retryFailedPicklistsSync(syncId);
                break;
            case 'warehouses':
                result = await service.retryFailedWarehousesSync(syncId);
                break;
            case 'users':
                result = await service.retryFailedUsersSync(syncId);
                break;
            case 'suppliers':
                result = await service.retryFailedSuppliersSync(syncId);
                break;
        }
        
        // Log result
        if (result.success) {
            addLog('success', `${entityType} sync retry completed: ${result.message}`);
            addSyncRecord(true, entityType, result.savedCount, `Retry successful: ${result.message}`);
        } else {
            addLog('error', `${entityType} sync retry failed: ${result.message}`);
            addSyncRecord(false, entityType, 0, `Retry failed: ${result.message}`, syncId);
        }
    } catch (error) {
        console.error(`Error in ${entityType} sync retry:`, error);
        addLog('error', `Error in ${entityType} sync retry: ${error.message}`);
        addSyncRecord(false, entityType, 0, `Retry error: ${error.message}`, syncId);
    }
}

// Export the router and utility functions
module.exports = {
    router,
    addLog,
    addSyncRecord
};
