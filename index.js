const sql = require('mssql');

// Updated configuration using SQL Authentication with properly formatted server name
const config = {
    server: process.env.SQL_SERVER, // Should be in format: servername.database.windows.net
    database: process.env.SQL_DATABASE,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    options: {
        encrypt: true
    }
};

async function fetchData() {
    try {
        console.log('Attempting to connect to SQL server:', process.env.SQL_SERVER);
        await sql.connect(config);
        const result = await sql.query`SELECT TOP 10 * FROM INFORMATION_SCHEMA.TABLES`;
        console.log(result.recordset);
    } catch (err) {
        console.error('Error querying the database:', err);
    } finally {
        await sql.close();
    }
}

fetchData();
