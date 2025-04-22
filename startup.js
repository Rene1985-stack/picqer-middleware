const sqlConfig = require('./config/dbConfig'); // Adjust the path as needed

const UserMetaService = require('./UserMetaService');
const ProductMetaService = require('./ProductMetaService');
const WarehouseMetaService = require('./WarehouseMetaService');
const PicklistService = require('./picklist_service'); // Assuming this file is in place and already functional

async function startup() {
  try {
    console.log('🚀 Initializing middleware services...');

    const userService = new UserMetaService(sqlConfig);
    const productService = new ProductMetaService(sqlConfig);
    const warehouseService = new WarehouseMetaService(sqlConfig);
    const picklistService = new PicklistService(sqlConfig);

    // Initialize schema and sync status
    await userService.initializeUsersDatabase();
    await productService.initializeProductsDatabase();
    await warehouseService.initializeWarehousesDatabase();
    await picklistService.initializePicklistsDatabase();

    console.log('✅ All database tables and sync statuses are initialized.');
  } catch (error) {
    console.error('❌ Startup failed:', error);
    process.exit(1);
  }
}

startup();
