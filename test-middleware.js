// test-middleware.js - Test script for Picqer middleware implementation

const axios = require('axios');
const sql = require('mssql');
require('dotenv').config();

// Import services
const PicqerService = require('./optimized_product_service');
const PicklistService = require('./resumable_picklist-service');
const WarehouseService = require('./warehouse_service');
const UserService = require('./user_service');
const SupplierService = require('./supplier_service');

// Configuration
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

// Initialize services
const productService = new PicqerService(apiKey, baseUrl, sqlConfig);
const picklistService = new PicklistService(apiKey, baseUrl, sqlConfig);
const warehouseService = new WarehouseService(apiKey, baseUrl, sqlConfig);
const userService = new UserService(apiKey, baseUrl, sqlConfig);
const supplierService = new SupplierService(apiKey, baseUrl, sqlConfig);

// Test results
const testResults = {
    database: {
        status: 'Pending',
        message: ''
    },
    api: {
        status: 'Pending',
        message: ''
    },
    products: {
        status: 'Pending',
        message: ''
    },
    picklists: {
        status: 'Pending',
        message: ''
    },
    warehouses: {
        status: 'Pending',
        message: ''
    },
    users: {
        status: 'Pending',
        message: ''
    },
    suppliers: {
        status: 'Pending',
        message: ''
    }
};

// Main test function
async function runTests() {
    console.log('Starting Picqer middleware tests...');
    
    try {
        // Test database connection
        await testDatabaseConnection();
        
        // Test Picqer API connection
        await testPicqerApiConnection();
        
        // Test entity services
        await testProductService();
        await testPicklistService();
        await testWarehouseService();
        await testUserService();
        await testSupplierService();
        
        // Print test results
        printTestResults();
    } catch (error) {
        console.error('Test execution failed:', error);
    }
}

// Test database connection
async function testDatabaseConnection() {
    console.log('\nTesting database connection...');
    
    try {
        const pool = await sql.connect(sqlConfig);
        const result = await pool.request().query('SELECT 1 AS TestResult');
        
        if (result.recordset[0].TestResult === 1) {
            testResults.database.status = 'Passed';
            testResults.database.message = 'Successfully connected to database';
            console.log('✅ Database connection successful');
        } else {
            testResults.database.status = 'Failed';
            testResults.database.message = 'Unexpected result from database';
            console.log('❌ Database connection test failed: Unexpected result');
        }
    } catch (error) {
        testResults.database.status = 'Failed';
        testResults.database.message = `Error: ${error.message}`;
        console.log(`❌ Database connection test failed: ${error.message}`);
    }
}

// Test Picqer API connection
async function testPicqerApiConnection() {
    console.log('\nTesting Picqer API connection...');
    
    try {
        // Create Base64 encoded credentials (apiKey + ":")
        const credentials = `${apiKey}:`;
        const encodedCredentials = Buffer.from(credentials).toString('base64');
        
        // Create client with Basic Authentication header
        const client = axios.create({
            baseURL: baseUrl,
            headers: {
                'Authorization': `Basic ${encodedCredentials}`,
                'Content-Type': 'application/json',
                'User-Agent': 'PicqerMiddleware (middleware@skapa-global.com)'
            }
        });
        
        // Test API connection with a simple request
        const response = await client.get('/');
        
        if (response.status === 200) {
            testResults.api.status = 'Passed';
            testResults.api.message = 'Successfully connected to Picqer API';
            console.log('✅ Picqer API connection successful');
        } else {
            testResults.api.status = 'Failed';
            testResults.api.message = `Unexpected status code: ${response.status}`;
            console.log(`❌ Picqer API connection test failed: Unexpected status code ${response.status}`);
        }
    } catch (error) {
        testResults.api.status = 'Failed';
        testResults.api.message = `Error: ${error.message}`;
        console.log(`❌ Picqer API connection test failed: ${error.message}`);
    }
}

// Test product service
async function testProductService() {
    console.log('\nTesting product service...');
    
    try {
        // Test database initialization
        await productService.initializeProductsDatabase();
        console.log('✅ Product database initialization successful');
        
        // Test getting product count
        const productCount = await productService.getProductCountFromDatabase();
        console.log(`✅ Product count from database: ${productCount}`);
        
        // Test getting last sync date
        const lastSyncDate = await productService.getLastProductsSyncDate();
        console.log(`✅ Last products sync date: ${lastSyncDate.toISOString()}`);
        
        testResults.products.status = 'Passed';
        testResults.products.message = 'Product service tests passed successfully';
    } catch (error) {
        testResults.products.status = 'Failed';
        testResults.products.message = `Error: ${error.message}`;
        console.log(`❌ Product service test failed: ${error.message}`);
    }
}

// Test picklist service
async function testPicklistService() {
    console.log('\nTesting picklist service...');
    
    try {
        // Test database initialization
        await picklistService.initializePicklistsDatabase();
        console.log('✅ Picklist database initialization successful');
        
        // Test getting picklist count
        const picklistCount = await picklistService.getPicklistCountFromDatabase();
        console.log(`✅ Picklist count from database: ${picklistCount}`);
        
        // Test getting last sync date
        const lastSyncDate = await picklistService.getLastPicklistsSyncDate();
        console.log(`✅ Last picklists sync date: ${lastSyncDate.toISOString()}`);
        
        testResults.picklists.status = 'Passed';
        testResults.picklists.message = 'Picklist service tests passed successfully';
    } catch (error) {
        testResults.picklists.status = 'Failed';
        testResults.picklists.message = `Error: ${error.message}`;
        console.log(`❌ Picklist service test failed: ${error.message}`);
    }
}

// Test warehouse service
async function testWarehouseService() {
    console.log('\nTesting warehouse service...');
    
    try {
        // Test database initialization
        await warehouseService.initializeWarehousesDatabase();
        console.log('✅ Warehouse database initialization successful');
        
        // Test getting warehouse count
        const warehouseCount = await warehouseService.getWarehouseCountFromDatabase();
        console.log(`✅ Warehouse count from database: ${warehouseCount}`);
        
        // Test getting last sync date
        const lastSyncDate = await warehouseService.getLastWarehousesSyncDate();
        console.log(`✅ Last warehouses sync date: ${lastSyncDate.toISOString()}`);
        
        testResults.warehouses.status = 'Passed';
        testResults.warehouses.message = 'Warehouse service tests passed successfully';
    } catch (error) {
        testResults.warehouses.status = 'Failed';
        testResults.warehouses.message = `Error: ${error.message}`;
        console.log(`❌ Warehouse service test failed: ${error.message}`);
    }
}

// Test user service
async function testUserService() {
    console.log('\nTesting user service...');
    
    try {
        // Test database initialization
        await userService.initializeUsersDatabase();
        console.log('✅ User database initialization successful');
        
        // Test getting user count
        const userCount = await userService.getUserCountFromDatabase();
        console.log(`✅ User count from database: ${userCount}`);
        
        // Test getting last sync date
        const lastSyncDate = await userService.getLastUsersSyncDate();
        console.log(`✅ Last users sync date: ${lastSyncDate.toISOString()}`);
        
        testResults.users.status = 'Passed';
        testResults.users.message = 'User service tests passed successfully';
    } catch (error) {
        testResults.users.status = 'Failed';
        testResults.users.message = `Error: ${error.message}`;
        console.log(`❌ User service test failed: ${error.message}`);
    }
}

// Test supplier service
async function testSupplierService() {
    console.log('\nTesting supplier service...');
    
    try {
        // Test database initialization
        await supplierService.initializeSuppliersDatabase();
        console.log('✅ Supplier database initialization successful');
        
        // Test getting supplier count
        const supplierCount = await supplierService.getSupplierCountFromDatabase();
        console.log(`✅ Supplier count from database: ${supplierCount}`);
        
        // Test getting last sync date
        const lastSyncDate = await supplierService.getLastSuppliersSyncDate();
        console.log(`✅ Last suppliers sync date: ${lastSyncDate.toISOString()}`);
        
        testResults.suppliers.status = 'Passed';
        testResults.suppliers.message = 'Supplier service tests passed successfully';
    } catch (error) {
        testResults.suppliers.status = 'Failed';
        testResults.suppliers.message = `Error: ${error.message}`;
        console.log(`❌ Supplier service test failed: ${error.message}`);
    }
}

// Print test results
function printTestResults() {
    console.log('\n=== TEST RESULTS ===');
    
    for (const [test, result] of Object.entries(testResults)) {
        const icon = result.status === 'Passed' ? '✅' : '❌';
        console.log(`${icon} ${test.toUpperCase()}: ${result.status}`);
        console.log(`   ${result.message}`);
    }
    
    // Check if all tests passed
    const allPassed = Object.values(testResults).every(result => result.status === 'Passed');
    
    if (allPassed) {
        console.log('\n✅ ALL TESTS PASSED! The middleware is ready for deployment.');
    } else {
        console.log('\n❌ SOME TESTS FAILED. Please fix the issues before deployment.');
    }
}

// Run the tests
runTests();
