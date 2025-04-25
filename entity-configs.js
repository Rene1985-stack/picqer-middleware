/**
 * Entity Configurations
 * 
 * Defines configuration for all entity types that can be synchronized
 * between Picqer and SQL database.
 */

const entityConfigs = {
  product: {
    entityType: 'product',
    tableName: 'Products',
    idField: 'idproduct',
    apiEndpoint: '/products',
    nameField: 'productcode'
  },
  picklist: {
    entityType: 'picklist',
    tableName: 'Picklists',
    idField: 'idpicklist',
    apiEndpoint: '/picklists',
    nameField: 'picklistid'
  },
  warehouse: {
    entityType: 'warehouse',
    tableName: 'Warehouses',
    idField: 'idwarehouse',
    apiEndpoint: '/warehouses',
    nameField: 'name'
  },
  user: {
    entityType: 'user',
    tableName: 'Users',
    idField: 'iduser',
    apiEndpoint: '/users',
    nameField: 'name'
  },
  supplier: {
    entityType: 'supplier',
    tableName: 'Suppliers',
    idField: 'idsupplier',
    apiEndpoint: '/suppliers',
    nameField: 'name'
  },
  batch: {
    entityType: 'batch',
    tableName: 'Batches',
    idField: 'idpicklist_batch',
    apiEndpoint: '/picklists/batches',
    nameField: 'batchid'
  }
};

module.exports = entityConfigs;
