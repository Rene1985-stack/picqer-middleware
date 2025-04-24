// reset-sync.js
require('dotenv').config();
const BatchService = require('./batch_service');

async function resetSync() {
  // Create batch service instance with your API credentials
  const batchService = new BatchService(
    process.env.PICQER_API_KEY,
    process.env.PICQER_API_URL,
    {
      server: process.env.SQL_SERVER,
      port: parseInt(process.env.SQL_PORT || '1433', 10),
      database: process.env.SQL_DATABASE,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      options: { encrypt: true }
    }
  );
  
  // Initialize the service
  await batchService.initialize();
  
  // Reset the sync offset
  const result = await batchService.resetSyncOffset();
  console.log(result);
  
  process.exit(0);
}

resetSync().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
