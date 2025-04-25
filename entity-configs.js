/**
 * Entity Configuration with Specific Attributes
 * 
 * This file defines the configuration for each entity type including
 * API endpoints, table names, ID fields, and attribute mappings.
 */

// Import entity-specific attributes
const entityAttributes = require('./entity-attributes');

// Define entity configurations
const entityConfigs = {
  // Warehouse entity configuration
  warehouse: {
    entityType: 'warehouse',
    tableName: 'Warehouses',
    idField: 'idwarehouse',
    apiEndpoint: 'warehouses',
    nameField: 'name',
    attributes: entityAttributes.warehouse
  },
  
  // Product entity configuration
  product: {
    entityType: 'product',
    tableName: 'Products',
    idField: 'idproduct',
    apiEndpoint: 'products',
    nameField: 'name',
    attributes: entityAttributes.product
  },
  
  // Picklist entity configuration
  picklist: {
    entityType: 'picklist',
    tableName: 'Picklists',
    idField: 'idpicklist',
    apiEndpoint: 'picklists',
    nameField: 'picklistid',
    attributes: entityAttributes.picklist
  },
  
  // Batch entity configuration
  batch: {
    entityType: 'batch',
    tableName: 'Batches',
    idField: 'idpicklist_batch',
    apiEndpoint: 'picklists/batches',
    nameField: 'picklist_batchid',
    attributes: entityAttributes.batch
  },
  
  // User entity configuration
  user: {
    entityType: 'user',
    tableName: 'Users',
    idField: 'iduser',
    apiEndpoint: 'users',
    nameField: 'username',
    attributes: entityAttributes.user
  },
  
  // Supplier entity configuration
  supplier: {
    entityType: 'supplier',
    tableName: 'Suppliers',
    idField: 'idsupplier',
    apiEndpoint: 'suppliers',
    nameField: 'name',
    attributes: entityAttributes.supplier
  }
};

module.exports = entityConfigs;
