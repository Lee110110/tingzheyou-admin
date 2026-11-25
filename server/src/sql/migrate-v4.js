/**
 * 增量迁移 v4（2026-11-24）：商品关联景区（景区维度定价）。
 * 幂等：列/索引已存在则跳过；存量商品 scenic_area_id 为 NULL = 通用卡，行为不变。
 * 用法：node src/sql/migrate-v4.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function colExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
    [process.env.DB_NAME || 'tingzheyou_admin', table, column]
  );
  return rows[0].c > 0;
}

async function indexExists(conn, table, indexName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.statistics
     WHERE table_schema = ? AND table_name = ? AND index_name = ?`,
    [process.env.DB_NAME || 'tingzheyou_admin', table, indexName]
  );
  return rows[0].c > 0;
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'tingzheyou_admin',
    charset: 'utf8mb4',
    multipleStatements: true,
  });

  if (!(await colExists(conn, 'product', 'scenic_area_id'))) {
    await conn.query(
      `ALTER TABLE product ADD COLUMN scenic_area_id INT UNSIGNED NULL COMMENT '所属景区，NULL=通用卡（跨景区/按级别）' AFTER agreement`
    );
    console.log('[migrate-v4] product 增加 scenic_area_id（NULL=通用卡，存量商品全部为通用卡）');
  } else {
    console.log('[migrate-v4] product.scenic_area_id 已存在，跳过');
  }

  if (!(await indexExists(conn, 'product', 'idx_scenic_area'))) {
    await conn.query(`ALTER TABLE product ADD INDEX idx_scenic_area (scenic_area_id)`);
    console.log('[migrate-v4] product 增加 idx_scenic_area');
  } else {
    console.log('[migrate-v4] idx_scenic_area 已存在，跳过');
  }

  await conn.end();
  console.log('[migrate-v4] 迁移完成。');
}

main().catch(e => {
  console.error('[migrate-v4] 失败：', e.message);
  process.exit(1);
});
