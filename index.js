const sql = require('mssql');

// Updated configuration using SQL Authentication
const config = {
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    options: {
        encrypt: true
    }
};

async function fetchData() {
    try {
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
