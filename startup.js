const UserMetaService = require('./UserMetaService');
const ProductMetaService = require('./ProductMetaService');
const WarehouseMetaService = require('./WarehouseMetaService');
const PicklistService = require('./picklist_service'); // Assuming this file is already present and working

async function startup(dbConfig) {
  try {
    console.log('🚀 Initializing middleware meta services...');

    const userService = new UserMetaService(dbConfig);
    const productService = new ProductMetaService(dbConfig);
    const warehouseService = new WarehouseMetaService(dbConfig);
    const picklistService = new PicklistService(dbConfig);

    await userService.initializeUsersDatabase();
    await productService.initializeProductsDatabase();
    await warehouseService.initializeWarehousesDatabase();
    await picklistService.initializePicklistsDatabase();

    console.log('✅ Meta services initialization complete.');
  } catch (error) {
    console.error('❌ Meta startup failed:', error);
    process.exit(1);
  }
}

module.exports = startup;
