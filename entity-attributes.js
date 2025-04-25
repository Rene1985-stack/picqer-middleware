/**
 * Entity-Specific Attribute Configuration
 * 
 * This file defines the specific attributes to store for each entity type.
 * These configurations are used by the GenericEntityService to map API responses
 * to database columns.
 */

// Common attributes that apply to all entity types
const commonAttributes = [
  { apiField: 'id', dbColumn: 'id', type: 'string', required: true },
  { apiField: 'name', dbColumn: 'name', type: 'string', required: true }
];

// Picklist-specific attributes
const picklistAttributes = [
  { apiField: 'idpicklist', dbColumn: 'id', type: 'string', required: true },
  { apiField: 'picklistid', dbColumn: 'picklistid', type: 'string', required: true },
  { apiField: 'idwarehouse', dbColumn: 'idwarehouse', type: 'string', required: false },
  { apiField: 'status', dbColumn: 'status', type: 'string', required: false },
  { apiField: 'totalproducts', dbColumn: 'total_products', type: 'number', required: false },
  { apiField: 'totalpicked', dbColumn: 'total_picked', type: 'number', required: false },
  { apiField: 'created', dbColumn: 'created_at', type: 'datetime', required: false },
  { apiField: 'updated', dbColumn: 'updated_at', type: 'datetime', required: false },
  { apiField: 'deliveryname', dbColumn: 'delivery_name', type: 'string', required: false },
  { apiField: 'reference', dbColumn: 'reference', type: 'string', required: false }
];

// Product-specific attributes
const productAttributes = [
  { apiField: 'idproduct', dbColumn: 'id', type: 'string', required: true },
  { apiField: 'productcode', dbColumn: 'productcode', type: 'string', required: true },
  { apiField: 'name', dbColumn: 'name', type: 'string', required: true },
  { apiField: 'price', dbColumn: 'price', type: 'number', required: false },
  { apiField: 'barcode', dbColumn: 'barcode', type: 'string', required: false },
  { apiField: 'weight', dbColumn: 'weight', type: 'number', required: false },
  { apiField: 'active', dbColumn: 'active', type: 'boolean', required: false },
  { apiField: 'created', dbColumn: 'created_at', type: 'datetime', required: false },
  { apiField: 'updated', dbColumn: 'updated_at', type: 'datetime', required: false }
];

// Batch-specific attributes
const batchAttributes = [
  { apiField: 'idpicklist_batch', dbColumn: 'id', type: 'string', required: true },
  { apiField: 'picklist_batchid', dbColumn: 'batchid', type: 'string', required: true },
  { apiField: 'idwarehouse', dbColumn: 'idwarehouse', type: 'string', required: false },
  { apiField: 'type', dbColumn: 'type', type: 'string', required: false },
  { apiField: 'status', dbColumn: 'status', type: 'string', required: false },
  { apiField: 'total_products', dbColumn: 'total_products', type: 'number', required: false },
  { apiField: 'total_picklists', dbColumn: 'total_picklists', type: 'number', required: false },
  { apiField: 'created_at', dbColumn: 'created_at', type: 'datetime', required: false },
  { apiField: 'updated_at', dbColumn: 'updated_at', type: 'datetime', required: false }
];

// Warehouse-specific attributes
const warehouseAttributes = [
  { apiField: 'idwarehouse', dbColumn: 'id', type: 'string', required: true },
  { apiField: 'name', dbColumn: 'name', type: 'string', required: true },
  { apiField: 'created', dbColumn: 'created_at', type: 'datetime', required: false },
  { apiField: 'updated', dbColumn: 'updated_at', type: 'datetime', required: false }
];

// User-specific attributes
const userAttributes = [
  { apiField: 'iduser', dbColumn: 'id', type: 'string', required: true },
  { apiField: 'username', dbColumn: 'username', type: 'string', required: true },
  { apiField: 'name', dbColumn: 'name', type: 'string', required: false },
  { apiField: 'email', dbColumn: 'email', type: 'string', required: false },
  { apiField: 'created', dbColumn: 'created_at', type: 'datetime', required: false },
  { apiField: 'updated', dbColumn: 'updated_at', type: 'datetime', required: false }
];

// Supplier-specific attributes
const supplierAttributes = [
  { apiField: 'idsupplier', dbColumn: 'id', type: 'string', required: true },
  { apiField: 'name', dbColumn: 'name', type: 'string', required: true },
  { apiField: 'created', dbColumn: 'created_at', type: 'datetime', required: false },
  { apiField: 'updated', dbColumn: 'updated_at', type: 'datetime', required: false }
];

// Export all entity attribute configurations
module.exports = {
  picklist: picklistAttributes,
  product: productAttributes,
  batch: batchAttributes,
  warehouse: warehouseAttributes,
  user: userAttributes,
  supplier: supplierAttributes
};
