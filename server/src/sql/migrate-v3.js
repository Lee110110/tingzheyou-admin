/**
 * 增量迁移 v3（2026-11-03）：景点上下线状态。
 * 幂等：列已存在则跳过；存量数据默认开启（1）。
 * 用法：node src/sql/migrate-v3.js
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

  if (!(await colExists(conn, 'scenic_spot', 'status'))) {
    await conn.query(
      `ALTER TABLE scenic_spot ADD COLUMN status TINYINT NOT NULL DEFAULT 1 COMMENT '1开启 0关闭（关闭后不展示、不可加入线路）'`
    );
    console.log('[migrate-v3] scenic_spot 增加 status（默认 1 开启，存量景点全部开启）');
  } else {
    console.log('[migrate-v3] scenic_spot.status 已存在，跳过');
  }

  await conn.end();
  console.log('[migrate-v3] 迁移完成。');
}

main().catch(e => {
  console.error('[migrate-v3] 失败：', e.message);
  process.exit(1);
});
