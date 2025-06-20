const sql = require('mssql');

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_DATABASE,
  options: {
    encrypt: true,
    enableArithAbort: true
  }
};

module.exports = { sql, dbConfig };