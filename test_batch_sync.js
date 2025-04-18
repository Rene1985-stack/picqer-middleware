// test_batch_sync.js
require('dotenv').config();
const sql = require('mssql');
const { createBatchesTableIfNotExists } = require('./batches_schema');
const BatchService = require('./batch_service');
const BatchProductivityTracker = require('./batch_productivity_tracker');
const { SchemaManager } = require('./schema_manager');

// Configuration
const sqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  server: process.env.DB_SERVER,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

const picqerConfig = {
  apiUrl: process.env.PICQER_API_URL,
  apiKey: process.env.PICQER_API_KEY
};

/**
 * Test the batch synchronization functionality
 */
async function testBatchSync() {
  console.log('Starting batch sync test...');
  
  let pool;
  
  try {
    // Connect to database
    console.log('Connecting to database...');
    pool = await sql.connect(sqlConfig);
    console.log('Connected to database successfully.');
    
    // Initialize schema manager
    const schemaManager = new SchemaManager(pool);
    
    // Create batches table if it doesn't exist
    console.log('Setting up database schema...');
    await createBatchesTableIfNotExists(pool);
    
    // Initialize batch service
    const batchService = new BatchService(pool, picqerConfig);
    
    // Sync batches
    console.log('Syncing batches from Picqer...');
    const syncResult = await batchService.syncBatches();
    console.log('Batch sync result:', syncResult);
    
    if (syncResult.success) {
      console.log(`Successfully synced ${syncResult.count} batches.`);
      
      // Test productivity tracker
      if (syncResult.count > 0) {
        console.log('Testing batch productivity tracker...');
        const productivityTracker = new BatchProductivityTracker(pool);
        
        // Set date range for last 30 days
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        
        // Get picker productivity
        console.log('Getting picker productivity...');
        const pickerProductivity = await productivityTracker.getPickerProductivity(startDate, endDate);
        console.log(`Retrieved productivity data for ${pickerProductivity.length} pickers.`);
        
        // Get packer productivity
        console.log('Getting packer productivity...');
        const packerProductivity = await productivityTracker.getPackerProductivity(startDate, endDate);
        console.log(`Retrieved productivity data for ${packerProductivity.length} packers.`);
        
        // Get daily productivity trends
        console.log('Getting daily productivity trends...');
        const dailyTrends = await productivityTracker.getDailyProductivityTrends(startDate, endDate);
        console.log(`Retrieved daily trends for ${dailyTrends.picker_daily_trends.length} days.`);
        
        // Get user role distribution
        console.log('Getting user role distribution...');
        const roleDistribution = await productivityTracker.getUserRoleDistribution(startDate, endDate);
        console.log(`Retrieved role distribution for ${roleDistribution.length} users.`);
        
        // Get batch processing bottlenecks
        console.log('Analyzing batch processing bottlenecks...');
        const bottlenecks = await productivityTracker.getBatchProcessingBottlenecks(startDate, endDate);
        console.log('Primary bottleneck identified:', bottlenecks.primary_bottleneck);
        
        console.log('Batch productivity tracker tests completed successfully.');
      } else {
        console.log('No batches synced, skipping productivity tracker tests.');
      }
    } else {
      console.error('Batch sync failed:', syncResult.message);
    }
    
    console.log('Batch sync test completed.');
  } catch (error) {
    console.error('Error in batch sync test:', error);
  } finally {
    // Close database connection
    if (pool) {
      await pool.close();
      console.log('Database connection closed.');
    }
  }
}

// Run the test
testBatchSync().catch(err => {
  console.error('Unhandled error in test:', err);
  process.exit(1);
});
