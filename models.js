
const Sequelize = require('sequelize');
const sequelize = new Sequelize('sqlite::memory:');  // Change as per your DB connection

const SyncStatus = sequelize.define('sync_status', {
    entity_name: Sequelize.STRING,
    entity_type: Sequelize.STRING,
    last_sync_date: Sequelize.DATE,
    last_sync_count: Sequelize.INTEGER,
    total_count: Sequelize.INTEGER
});

const Picklists = sequelize.define('picklists', {
    name: Sequelize.STRING,
    description: Sequelize.STRING,
    last_sync_date: Sequelize.DATE
});

const Warehouses = sequelize.define('warehouses', {
    name: Sequelize.STRING,
    location: Sequelize.STRING,
    last_sync_date: Sequelize.DATE
});

const Products = sequelize.define('products', {
    name: Sequelize.STRING,
    price: Sequelize.FLOAT,
    stock: Sequelize.INTEGER,
    last_sync_date: Sequelize.DATE
});

module.exports = { SyncStatus, Picklists, Warehouses, Products };
