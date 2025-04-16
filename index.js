const sql = require('mssql');

// Updated configuration with explicit server name
const config = {
    server: process.env.SQL_SERVER, // Should be in format: servername.database.windows.net
    database: process.env.SQL_DATABASE,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    options: {
        encrypt: true,
        trustServerCertificate: false,
        // Force the driver to use the server name from the config
        hostNameInCertificate: process.env.SQL_SERVER
    }
};

async function fetchData() {
    try {
        console.log('Attempting to connect to SQL server with these settings:');
        console.log('Server:', process.env.SQL_SERVER);
        console.log('Database:', process.env.SQL_DATABASE);
        console.log('User:', process.env.SQL_USER);
        
        // Clear any existing connections before attempting new one
        await sql.close();
        
        await sql.connect(config);
        console.log('Connection successful!');
        
        const result = await sql.query`SELECT TOP 10 * FROM INFORMATION_SCHEMA.TABLES`;
        console.log('Query successful, results:');
        console.log(result.recordset);
    } catch (err) {
        console.error('Error querying the database:', err);
        
        // Log more detailed error information
        if (err.originalError) {
            console.error('Original error details:', err.originalError);
        }
    } finally {
        await sql.close();
    }
}

fetchData();
