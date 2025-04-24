/**
 * Comprehensive sync implementation for all service classes
 * 
 * This file adds the missing sync methods to each service class
 * and ensures proper parameter validation.
 */

// Create a universal sync method that can be added to any service class
function createSyncMethod(serviceClass, entityType) {
  // Add the sync method to the service class prototype
  serviceClass.prototype.sync = async function(fullSync = false) {
    try {
      console.log(`Starting ${fullSync ? 'full' : 'incremental'} ${entityType} sync...`);
      
      // Ensure pool is initialized
      if (!this.pool) {
        console.log(`Initializing pool for sync() in ${entityType}Service...`);
        this.pool = await this.initializePool();
      }
      
      // Get the last sync date
      let lastSyncDate;
      if (fullSync) {
        lastSyncDate = new Date(0).toISOString();
        console.log(`Performing full ${entityType} sync`);
      } else {
        const lastSyncDateObj = await this.getLastSyncDate();
        lastSyncDate = lastSyncDateObj.toISOString();
        console.log(`Last ${entityType} sync date:`, lastSyncDate);
      }
      
      // Create a sync progress record
      const syncId = `${entityType}_${Date.now()}`;
      await this.pool.request()
        .input('syncId', sql.VarChar, syncId)
        .input('entityType', sql.VarChar, entityType)
        .input('status', sql.VarChar, 'in_progress')
        .input('startTime', sql.DateTimeOffset, new Date())
        .query(`
          INSERT INTO SyncProgress (sync_id, entity_type, status, start_time)
          VALUES (@syncId, @entityType, @status, @startTime)
        `);
      
      // Fetch data from Picqer
      let offset = 0;
      let totalItems = 0;
      let hasMore = true;
      
      while (hasMore) {
        console.log(`Fetching ${entityType} with offset ${offset}...`);
        
        // Determine the API endpoint based on entity type
        let endpoint = '';
        switch (entityType) {
          case 'products':
            endpoint = '/products';
            break;
          case 'picklists':
            endpoint = '/picklists';
            break;
          case 'warehouses':
            endpoint = '/warehouses';
            break;
          case 'users':
            endpoint = '/users';
            break;
          case 'suppliers':
            endpoint = '/suppliers';
            break;
          case 'batches':
            endpoint = '/picklists/batches';
            break;
          default:
            throw new Error(`Unknown entity type: ${entityType}`);
        }
        
        // Fetch data from Picqer
        const apiClient = this.client || this.apiClient || this.picqerClient;
        if (!apiClient) {
          throw new Error(`No API client available in ${entityType}Service`);
        }
        
        const response = await apiClient.get(endpoint, {
          params: {
            offset: offset
          }
        });
        
        if (response.status !== 200) {
          throw new Error(`Error fetching ${entityType}: ${response.statusText}`);
        }
        
        const items = response.data.data;
        
        if (items.length === 0) {
          hasMore = false;
          continue;
        }
        
        // Process each item
        for (const item of items) {
          try {
            // Save item to database
            await this.saveItem(item, entityType);
            totalItems++;
          } catch (itemError) {
            console.error(`Error processing ${entityType} item:`, itemError.message);
          }
        }
        
        // Increment offset
        offset += items.length;
        
        // Check if we have more items
        hasMore = items.length === 100; // Assuming 100 is the page size
      }
      
      // Update the last sync date
      await this.pool.request()
        .input('entityType', sql.VarChar, entityType)
        .input('lastSyncDate', sql.DateTimeOffset, new Date())
        .query(`
          UPDATE SyncStatus
          SET last_sync_date = @lastSyncDate
          WHERE entity_type = @entityType
          
          IF @@ROWCOUNT = 0
          BEGIN
            INSERT INTO SyncStatus (entity_type, entity_name, last_sync_date)
            VALUES (@entityType, @entityType, @lastSyncDate)
          END
        `);
      
      // Update the sync progress record
      await this.pool.request()
        .input('syncId', sql.VarChar, syncId)
        .input('status', sql.VarChar, 'completed')
        .input('endTime', sql.DateTimeOffset, new Date())
        .input('count', sql.Int, totalItems)
        .query(`
          UPDATE SyncProgress
          SET status = @status, end_time = @endTime, count = @count
          WHERE sync_id = @syncId
        `);
      
      console.log(`${entityType} sync completed. Synced ${totalItems} items.`);
      
      return {
        success: true,
        message: `${entityType} sync completed. Synced ${totalItems} items.`,
        count: totalItems
      };
    } catch (error) {
      console.error(`Error syncing ${entityType}:`, error.message);
      
      // Update the sync progress record
      try {
        const syncId = `${entityType}_${Date.now()}`;
        await this.pool.request()
          .input('syncId', sql.VarChar, syncId)
          .input('status', sql.VarChar, 'failed')
          .input('endTime', sql.DateTimeOffset, new Date())
          .input('error', sql.NVarChar, error.message)
          .query(`
            UPDATE SyncProgress
            SET status = @status, end_time = @endTime, error = @error
            WHERE sync_id = @syncId
          `);
      } catch (updateError) {
        console.error('Error updating sync progress record:', updateError.message);
      }
      
      return {
        success: false,
        message: `Error syncing ${entityType}: ${error.message}`,
        error: error.message
      };
    }
  };
  
  // Add entity-specific sync method
  switch (entityType) {
    case 'products':
      serviceClass.prototype.syncProducts = serviceClass.prototype.sync;
      break;
    case 'picklists':
      serviceClass.prototype.syncPicklists = serviceClass.prototype.sync;
      break;
    case 'warehouses':
      serviceClass.prototype.syncWarehouses = serviceClass.prototype.sync;
      break;
    case 'users':
      serviceClass.prototype.syncUsers = serviceClass.prototype.sync;
      break;
    case 'suppliers':
      serviceClass.prototype.syncSuppliers = serviceClass.prototype.sync;
      break;
    case 'batches':
      serviceClass.prototype.syncBatches = serviceClass.prototype.sync;
      break;
  }
  
  // Add a saveItem method if it doesn't exist
  if (!serviceClass.prototype.saveItem) {
    serviceClass.prototype.saveItem = async function(item, entityType) {
      try {
        // Ensure pool is initialized
        if (!this.pool) {
          console.log(`Initializing pool for saveItem() in ${entityType}Service...`);
          this.pool = await this.initializePool();
        }
        
        // Handle different entity types
        switch (entityType) {
          case 'products':
            return await this.saveProduct(item);
          case 'picklists':
            return await this.savePicklist(item);
          case 'warehouses':
            return await this.saveWarehouse(item);
          case 'users':
            return await this.saveUser(item);
          case 'suppliers':
            return await this.saveSupplier(item);
          case 'batches':
            return await this.saveBatch(item);
          default:
            throw new Error(`Unknown entity type: ${entityType}`);
        }
      } catch (error) {
        console.error(`Error saving ${entityType} item:`, error.message);
        throw error;
      }
    };
  }
  
  // Add entity-specific save methods if they don't exist
  if (!serviceClass.prototype.saveProduct) {
    serviceClass.prototype.saveProduct = async function(product) {
      try {
        // Ensure product ID is a string
        const productId = String(product.idproduct);
        
        // Check if the product already exists
        const existingProduct = await this.pool.request()
          .input('productId', sql.VarChar, productId)
          .query(`
            SELECT idproduct
            FROM Products
            WHERE idproduct = @productId
          `);
        
        if (existingProduct.recordset.length > 0) {
          // Update existing product
          await this.pool.request()
            .input('productId', sql.VarChar, productId)
            .input('name', sql.NVarChar, product.name || '')
            .input('sku', sql.NVarChar, product.sku || '')
            .input('barcode', sql.NVarChar, product.barcode || '')
            .input('stock', sql.Int, product.stock || 0)
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(product))
            .query(`
              UPDATE Products
              SET name = @name,
                  sku = @sku,
                  barcode = @barcode,
                  stock = @stock,
                  updated = @updatedAt,
                  data = @data
              WHERE idproduct = @productId
            `);
        } else {
          // Insert new product
          await this.pool.request()
            .input('productId', sql.VarChar, productId)
            .input('name', sql.NVarChar, product.name || '')
            .input('sku', sql.NVarChar, product.sku || '')
            .input('barcode', sql.NVarChar, product.barcode || '')
            .input('stock', sql.Int, product.stock || 0)
            .input('createdAt', sql.DateTimeOffset, new Date())
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(product))
            .query(`
              INSERT INTO Products (idproduct, name, sku, barcode, stock, created, updated, data)
              VALUES (@productId, @name, @sku, @barcode, @stock, @createdAt, @updatedAt, @data)
            `);
        }
      } catch (error) {
        console.error(`Error saving product ${product.idproduct}:`, error.message);
        throw error;
      }
    };
  }
  
  if (!serviceClass.prototype.savePicklist) {
    serviceClass.prototype.savePicklist = async function(picklist) {
      try {
        // Ensure picklist ID is a string
        const picklistId = String(picklist.idpicklist);
        
        // Check if the picklist already exists
        const existingPicklist = await this.pool.request()
          .input('picklistId', sql.VarChar, picklistId)
          .query(`
            SELECT idpicklist
            FROM Picklists
            WHERE idpicklist = @picklistId
          `);
        
        if (existingPicklist.recordset.length > 0) {
          // Update existing picklist
          await this.pool.request()
            .input('picklistId', sql.VarChar, picklistId)
            .input('status', sql.NVarChar, picklist.status || '')
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(picklist))
            .query(`
              UPDATE Picklists
              SET status = @status,
                  updated = @updatedAt,
                  data = @data
              WHERE idpicklist = @picklistId
            `);
        } else {
          // Insert new picklist
          await this.pool.request()
            .input('picklistId', sql.VarChar, picklistId)
            .input('status', sql.NVarChar, picklist.status || '')
            .input('createdAt', sql.DateTimeOffset, new Date())
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(picklist))
            .query(`
              INSERT INTO Picklists (idpicklist, status, created, updated, data)
              VALUES (@picklistId, @status, @createdAt, @updatedAt, @data)
            `);
        }
      } catch (error) {
        console.error(`Error saving picklist ${picklist.idpicklist}:`, error.message);
        throw error;
      }
    };
  }
  
  if (!serviceClass.prototype.saveWarehouse) {
    serviceClass.prototype.saveWarehouse = async function(warehouse) {
      try {
        // Ensure warehouse ID is a string
        const warehouseId = String(warehouse.idwarehouse);
        
        // Check if the warehouse already exists
        const existingWarehouse = await this.pool.request()
          .input('warehouseId', sql.VarChar, warehouseId)
          .query(`
            SELECT idwarehouse
            FROM Warehouses
            WHERE idwarehouse = @warehouseId
          `);
        
        if (existingWarehouse.recordset.length > 0) {
          // Update existing warehouse
          await this.pool.request()
            .input('warehouseId', sql.VarChar, warehouseId)
            .input('name', sql.NVarChar, warehouse.name || '')
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(warehouse))
            .query(`
              UPDATE Warehouses
              SET name = @name,
                  updated = @updatedAt,
                  data = @data
              WHERE idwarehouse = @warehouseId
            `);
        } else {
          // Insert new warehouse
          await this.pool.request()
            .input('warehouseId', sql.VarChar, warehouseId)
            .input('name', sql.NVarChar, warehouse.name || '')
            .input('createdAt', sql.DateTimeOffset, new Date())
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(warehouse))
            .query(`
              INSERT INTO Warehouses (idwarehouse, name, created, updated, data)
              VALUES (@warehouseId, @name, @createdAt, @updatedAt, @data)
            `);
        }
      } catch (error) {
        console.error(`Error saving warehouse ${warehouse.idwarehouse}:`, error.message);
        throw error;
      }
    };
  }
  
  if (!serviceClass.prototype.saveUser) {
    serviceClass.prototype.saveUser = async function(user) {
      try {
        // Ensure user ID is a string
        const userId = String(user.iduser);
        
        // Check if the user already exists
        const existingUser = await this.pool.request()
          .input('userId', sql.VarChar, userId)
          .query(`
            SELECT iduser
            FROM Users
            WHERE iduser = @userId
          `);
        
        if (existingUser.recordset.length > 0) {
          // Update existing user
          await this.pool.request()
            .input('userId', sql.VarChar, userId)
            .input('name', sql.NVarChar, user.name || '')
            .input('email', sql.NVarChar, user.email || '')
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(user))
            .query(`
              UPDATE Users
              SET name = @name,
                  email = @email,
                  updated = @updatedAt,
                  data = @data
              WHERE iduser = @userId
            `);
        } else {
          // Insert new user
          await this.pool.request()
            .input('userId', sql.VarChar, userId)
            .input('name', sql.NVarChar, user.name || '')
            .input('email', sql.NVarChar, user.email || '')
            .input('createdAt', sql.DateTimeOffset, new Date())
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(user))
            .query(`
              INSERT INTO Users (iduser, name, email, created, updated, data)
              VALUES (@userId, @name, @email, @createdAt, @updatedAt, @data)
            `);
        }
      } catch (error) {
        console.error(`Error saving user ${user.iduser}:`, error.message);
        throw error;
      }
    };
  }
  
  if (!serviceClass.prototype.saveSupplier) {
    serviceClass.prototype.saveSupplier = async function(supplier) {
      try {
        // Ensure supplier ID is a string
        const supplierId = String(supplier.idsupplier);
        
        // Check if the supplier already exists
        const existingSupplier = await this.pool.request()
          .input('supplierId', sql.VarChar, supplierId)
          .query(`
            SELECT idsupplier
            FROM Suppliers
            WHERE idsupplier = @supplierId
          `);
        
        if (existingSupplier.recordset.length > 0) {
          // Update existing supplier
          await this.pool.request()
            .input('supplierId', sql.VarChar, supplierId)
            .input('name', sql.NVarChar, supplier.name || '')
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(supplier))
            .query(`
              UPDATE Suppliers
              SET name = @name,
                  updated = @updatedAt,
                  data = @data
              WHERE idsupplier = @supplierId
            `);
        } else {
          // Insert new supplier
          await this.pool.request()
            .input('supplierId', sql.VarChar, supplierId)
            .input('name', sql.NVarChar, supplier.name || '')
            .input('createdAt', sql.DateTimeOffset, new Date())
            .input('updatedAt', sql.DateTimeOffset, new Date())
            .input('data', sql.NVarChar, JSON.stringify(supplier))
            .query(`
              INSERT INTO Suppliers (idsupplier, name, created, updated, data)
              VALUES (@supplierId, @name, @createdAt, @updatedAt, @data)
            `);
        }
      } catch (error) {
        console.error(`Error saving supplier ${supplier.idsupplier}:`, error.message);
        throw error;
      }
    };
  }
  
  if (!serviceClass.prototype.saveBatch) {
    serviceClass.prototype.saveBatch = async function(batch) {
      try {
        // Ensure batch ID is a string
        const batchId = String(batch.idpicklist_batch);
        
        // Check if the batch already exists
        const existingBatch = await this.pool.request()
          .input('batchId', sql.VarChar, batchId)
          .query(`
            SELECT idpicklist_batch
            FROM Batches
            WHERE idpicklist_batch = @batchId
          `);
        
        if (existingBatch.recordset.length > 0) {
          // Update existing batch
          await this.pool.request()
            .input('batchId', sql.VarChar, batchId)
            .input('name', sql.NVarChar, batch.name || '')
            .input('status', sql.NVarChar, batch.status || '')
            .input('createdAt', sql.DateTimeOffset, new Date(batch.created_at))
            .input('updatedAt', sql.DateTimeOffset, new Date(batch.updated_at))
            .input('data', sql.NVarChar, JSON.stringify(batch))
            .query(`
              UPDATE Batches
              SET name = @name,
                  status = @status,
                  created_at = @createdAt,
                  updated_at = @updatedAt,
                  data = @data
              WHERE idpicklist_batch = @batchId
            `);
        } else {
          // Insert new batch
          await this.pool.request()
            .input('batchId', sql.VarChar, batchId)
            .input('name', sql.NVarChar, batch.name || '')
            .input('status', sql.NVarChar, batch.status || '')
            .input('createdAt', sql.DateTimeOffset, new Date(batch.created_at))
            .input('updatedAt', sql.DateTimeOffset, new Date(batch.updated_at))
            .input('data', sql.NVarChar, JSON.stringify(batch))
            .query(`
              INSERT INTO Batches (idpicklist_batch, name, status, created_at, updated_at, data)
              VALUES (@batchId, @name, @status, @createdAt, @updatedAt, @data)
            `);
        }
      } catch (error) {
        console.error(`Error saving batch ${batch.idpicklist_batch}:`, error.message);
        throw error;
      }
    };
  }
}

// Export the function to be used in index.js
module.exports = {
  createSyncMethod
};
