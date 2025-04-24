/**
 * Integration script for sync methods
 * 
 * This file integrates the sync methods into the service classes
 * and ensures proper parameter validation.
 */

const sql = require('mssql');
const { createSyncMethod } = require('./sync-method-implementation');

// Function to integrate sync methods into all service classes
function integrateSyncMethods(services) {
  // Add SQL module to the global scope for the sync methods
  global.sql = sql;
  
  // Add sync methods to each service class
  if (services.ProductService) {
    console.log('Adding sync methods to ProductService');
    createSyncMethod(services.ProductService.constructor, 'products');
  }
  
  if (services.PicklistService) {
    console.log('Adding sync methods to PicklistService');
    createSyncMethod(services.PicklistService.constructor, 'picklists');
  }
  
  if (services.WarehouseService) {
    console.log('Adding sync methods to WarehouseService');
    createSyncMethod(services.WarehouseService.constructor, 'warehouses');
  }
  
  if (services.UserService) {
    console.log('Adding sync methods to UserService');
    createSyncMethod(services.UserService.constructor, 'users');
  }
  
  if (services.SupplierService) {
    console.log('Adding sync methods to SupplierService');
    createSyncMethod(services.SupplierService.constructor, 'suppliers');
  }
  
  if (services.BatchService) {
    console.log('Adding sync methods to BatchService');
    createSyncMethod(services.BatchService.constructor, 'batches');
  }
  
  console.log('Sync methods integrated into all service classes');
  return services;
}

module.exports = {
  integrateSyncMethods
};
