// dashboard-api.js - Backend API for the middleware dashboard

const express = require('express');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const router = express.Router();

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
function addSyncRecord(success, count = null, message = null) {
    const record = {
        timestamp: new Date().toISOString(),
        success,
        count,
        message
    };
    
    syncHistory.unshift(record); // Add to beginning for newest first
    
    // Limit history size
    if (syncHistory.length > 20) {
        syncHistory = syncHistory.slice(0, 20);
    }
    
    saveHistory();
    
    // Send email notification for successful syncs if enabled
    if (success && emailSettings.notifySync && emailSettings.email) {
        sendEmailNotification(
            'Picqer Middleware Sync Completed',
            `A synchronization has completed successfully:\n\n${count ? `${count} products synchronized` : 'Synchronization completed'}\n\nTimestamp: ${record.timestamp}`
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

// Routes

// Serve the dashboard HTML
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
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
router.get('/stats', (req, res) => {
    // In a real implementation, you would get this data from your database
    const lastSync = syncHistory.length > 0 ? syncHistory[0].timestamp : null;
    
    // Calculate next sync time (1 hour after last sync)
    let nextSync = null;
    if (lastSync) {
        const lastSyncDate = new Date(lastSync);
        nextSync = new Date(lastSyncDate.getTime() + 60 * 60 * 1000).toISOString();
    }
    
    res.json({
        totalProducts: 1250, // Replace with actual count from database
        lastSync,
        nextSync,
        syncStatus: 'Ready' // Could be 'Running', 'Error', or 'Ready'
    });
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

// Export the router and utility functions
module.exports = {
    router,
    addLog,
    addSyncRecord
};
