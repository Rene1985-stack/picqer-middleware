/**
 * Environment Variable Consistency Fix
 * 
 * This script demonstrates how to ensure consistency between PICQER_BASE_URL and PICQER_API_URL
 * by adding a fallback mechanism in the code.
 */

// Add this to the top of index.js after the require statements
const picqerApiUrl = process.env.PICQER_API_URL || process.env.PICQER_BASE_URL;
if (!picqerApiUrl) {
  console.error('ERROR: Neither PICQER_API_URL nor PICQER_BASE_URL environment variables are set');
  process.exit(1);
}
console.log(`Using Picqer API URL: ${picqerApiUrl}`);

// Then use picqerApiUrl consistently throughout the code instead of directly accessing
// process.env.PICQER_API_URL or process.env.PICQER_BASE_URL
