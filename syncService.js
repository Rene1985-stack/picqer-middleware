
const { SyncStatus, Picklists, Warehouses, Products } = require('./models');

async function getCount(entity) {
    try {
        const count = await entity.count();
        return count;
    } catch (error) {
        console.error('Error fetching count:', error);
        return 0;  // Fallback value
    }
}

async function getLastSyncDate(entity) {
    try {
        const lastSync = await entity.findOne({ order: [['last_sync_date', 'DESC']] });
        return lastSync ? lastSync.last_sync_date : null;
    } catch (error) {
        console.error('Error fetching last sync date:', error);
        return null;  // Fallback value
    }
}

async function syncData() {
    // Sync the data for Picklists, Warehouses, Products
    const picklistCount = await getCount(Picklists);
    const warehouseCount = await getCount(Warehouses);
    const productCount = await getCount(Products);

    const picklistLastSync = await getLastSyncDate(Picklists);
    const warehouseLastSync = await getLastSyncDate(Warehouses);
    const productLastSync = await getLastSyncDate(Products);

    console.log('Picklist count:', picklistCount);
    console.log('Warehouse count:', warehouseCount);
    console.log('Product count:', productCount);
    console.log('Picklist last sync:', picklistLastSync);
    console.log('Warehouse last sync:', warehouseLastSync);
    console.log('Product last sync:', productLastSync);

    // Further operations...
}

syncData();  // Call the sync data function
