const sql = require('mssql');

const config = {
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    authentication: {
        type: 'azure-active-directory-default'
    },
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