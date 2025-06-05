/**
 * Initialize Receipts Database Schema
 * Run this script to create the receipts tables
 */

const sql = require('mssql');
const { createReceiptsTableSQL, createReceiptProductsTableSQL } = require('./receipts_schema.js');

async function initializeReceiptsSchema() {
  try {
    console.log('Initializing receipts database schema...');
    
    // Create Receipts table
    console.log('Creating Receipts table...');
    await sql.query(createReceiptsTableSQL);
    console.log('✅ Receipts table created successfully');
    
    // Create ReceiptProducts table
    console.log('Creating ReceiptProducts table...');
    await sql.query(createReceiptProductsTableSQL);
    console.log('✅ ReceiptProducts table created successfully');
    
    console.log('✅ Receipts schema initialization completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Error initializing receipts schema:', error.message);
    return false;
  }
}

module.exports = { initializeReceiptsSchema };

