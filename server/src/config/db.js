const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'tingzheyou_admin',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  dateStrings: true,
});

async function query(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function queryOne(sql, params) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/**
 * 事务包装：withTransaction(async conn => { await conn.query(...) })
 */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, queryOne, withTransaction };
