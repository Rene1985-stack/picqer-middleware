# Middleware Dashboard Implementation Guide

## Overview

This guide explains how to implement the dashboard for your Picqer to Azure SQL middleware. The dashboard provides:

1. Real-time monitoring of synchronization status
2. Error notifications and logs
3. Manual sync trigger buttons
4. Email notifications for errors and successful syncs

## Files Included

1. `dashboard.html` - The frontend interface
2. `dashboard-api.js` - Backend API for the dashboard
3. `index-with-dashboard.js` - Updated middleware with dashboard integration
4. `package.json` - Updated dependencies including nodemailer

## Implementation Steps

### 1. Create Directory Structure

```bash
mkdir -p dashboard
```

### 2. Copy Files

Copy all the provided files to your project:
- `dashboard.html` → `/dashboard/dashboard.html`
- `dashboard-api.js` → `/dashboard/dashboard-api.js`
- `index-with-dashboard.js` → `/index.js` (replace your current index.js)
- `package.json` → Update with nodemailer dependency

### 3. Install Dependencies

```bash
npm install nodemailer
```

### 4. Deploy to Railway

Push the updated code to your GitHub repository and deploy to Railway.

## Using the Dashboard

### Accessing the Dashboard

Once deployed, access your dashboard at:
```
https://your-railway-url.up.railway.app/dashboard
```

### Dashboard Features

1. **Synchronization Panel**
   - View sync statistics
   - Trigger manual syncs
   - See next scheduled sync

2. **Logs Panel**
   - View real-time logs
   - Clear logs when needed

3. **Sync History**
   - Track past synchronizations
   - See success/failure status

4. **Email Notifications**
   - Configure email for alerts
   - Choose notification preferences

## Customization

You can customize the dashboard by editing:

1. **Visual Appearance**
   - Edit the CSS in `dashboard.html`

2. **Logging Behavior**
   - Modify `dashboard-api.js` to change log retention

3. **Email Settings**
   - Update the email configuration in `dashboard-api.js`

## Troubleshooting

If you encounter issues:

1. **Dashboard Not Loading**
   - Check Railway logs for errors
   - Verify all files are in the correct locations

2. **Email Notifications Not Working**
   - Verify your email settings
   - Check logs for email-related errors

3. **Sync Buttons Not Working**
   - Check browser console for JavaScript errors
   - Verify API endpoints are accessible

## Security Considerations

For production use, consider:

1. Adding authentication to the dashboard
2. Using a production-ready email service
3. Implementing HTTPS for all connections

## Next Steps

Consider enhancing your dashboard with:

1. User authentication
2. More detailed product statistics
3. Custom alerts and thresholds
4. Mobile notifications
