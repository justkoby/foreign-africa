import mysql from 'mysql2/promise';

export function createPool(config) {
  return mysql.createPool({
    host: config.dbHost,
    port: config.dbPort,
    user: config.dbUser,
    password: config.dbPassword,
    database: config.dbName,
    waitForConnections: true,
    connectionLimit: 5,
    timezone: 'Z',
    charset: 'utf8mb4',
  });
}
