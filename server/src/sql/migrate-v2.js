/**
 * 增量迁移 v2（2026-11-02）：围栏 / 试听必听 / 线路 / 内容位 / 渠道 APP→IOS。
 * 幂等：列/表已存在则跳过，数据迁移按 WHERE channel='APP' 重复执行也安全。
 * 用法：node src/sql/migrate-v2.js
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

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.tables
     WHERE table_schema = ? AND table_name = ?`,
    [process.env.DB_NAME || 'tingzheyou_admin', table]
  );
  return rows[0].c > 0;
}

async function addCol(conn, table, def) {
  // def 形如 "fence JSON NULL COMMENT '...'"
  await conn.query(`ALTER TABLE ${table} ADD COLUMN ${def}`);
  console.log(`[migrate-v2] ${table} 增加 ${def.split(' ')[0]}`);
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

  // 1. scenic_area.fence
  if (!(await colExists(conn, 'scenic_area', 'fence'))) {
    await addCol(conn, 'scenic_area', `fence JSON NULL COMMENT '围栏：{type:FREE,points:[{lng,lat}×4]} 或 {type:RADIUS,center:{lng,lat},radius:米}，NULL=未设置'`);
  }

  // 2. scenic_spot.fence / is_audition / is_must_listen
  if (!(await colExists(conn, 'scenic_spot', 'fence'))) {
    await addCol(conn, 'scenic_spot', `fence JSON NULL COMMENT '围栏：{type:FREE,points:[{lng,lat}×4]} 或 {type:RADIUS,center:{lng,lat},radius:米}，NULL=未设置'`);
  }
  if (!(await colExists(conn, 'scenic_spot', 'is_audition'))) {
    await addCol(conn, 'scenic_spot', `is_audition TINYINT NOT NULL DEFAULT 0 COMMENT '试听：1是 0否'`);
  }
  if (!(await colExists(conn, 'scenic_spot', 'is_must_listen'))) {
    await addCol(conn, 'scenic_spot', `is_must_listen TINYINT NOT NULL DEFAULT 0 COMMENT '必听：1是 0否'`);
  }

  // 3. 新表（IF NOT EXISTS 安全）
  await conn.query(`
    CREATE TABLE IF NOT EXISTS scenic_route (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      scenic_area_id INT UNSIGNED NOT NULL COMMENT '所属景区',
      name VARCHAR(100) NOT NULL COMMENT '线路名称',
      is_deleted TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_area (scenic_area_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='景区线路';
    CREATE TABLE IF NOT EXISTS scenic_route_spot (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      route_id INT UNSIGNED NOT NULL COMMENT '所属线路',
      scenic_spot_id INT UNSIGNED NOT NULL COMMENT '景点',
      sort_order INT NOT NULL DEFAULT 0 COMMENT '景点顺序（数值越小越靠前）',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_route_spot (route_id, scenic_spot_id),
      KEY idx_route (route_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='线路-景点（有序，不影响景区景点本身）';
    CREATE TABLE IF NOT EXISTS content_slot (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(20) NOT NULL COMMENT 'AD广告 / BANNER首页轮播图',
      title VARCHAR(100) NOT NULL COMMENT '标题',
      image VARCHAR(500) NOT NULL DEFAULT '' COMMENT '图片',
      link_type VARCHAR(20) NOT NULL DEFAULT 'H5' COMMENT 'H5链接 / MINI_PROGRAM小程序链接',
      link_url VARCHAR(500) NOT NULL DEFAULT '' COMMENT '对应链接',
      weight INT NOT NULL DEFAULT 0 COMMENT '排序权重（越大越靠前）',
      is_deleted TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_type (type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='内容位（广告与首页轮播图统一表）';
  `);
  console.log('[migrate-v2] 新表 scenic_route / scenic_route_spot / content_slot 已就绪');

  // 4. 菜单：补「内容位管理」(id=12)，并授予管理员角色
  await conn.query(
    `INSERT IGNORE INTO menu (id, parent_id, title, path, icon, sort, perm_code)
     VALUES (12, 0, '内容位管理', '/content', 'Picture', 10, 'content')`
  );
  await conn.query('INSERT IGNORE INTO role_menu (role_id, menu_id) VALUES (1, 12)');
  console.log('[migrate-v2] 菜单「内容位管理」(id=12) 已补齐并授予管理员');

  // 5. 渠道数据迁移：APP → IOS（用户/订单/定价方案）
  for (const t of ['user', 'orders', 'price_plan']) {
    const [r] = await conn.query(`UPDATE ${t} SET channel = 'IOS' WHERE channel = 'APP'`);
    if (r.affectedRows > 0) console.log(`[migrate-v2] ${t}.channel: ${r.affectedRows} 行 APP→IOS`);
  }

  // 6. product_sku.platforms JSON 数组：把数组内 'APP' 替换为 'IOS'
  const [skus] = await conn.query('SELECT id, platforms FROM product_sku WHERE platforms IS NOT NULL');
  let skuChanged = 0;
  for (const s of skus) {
    let arr = s.platforms;
    if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch (e) { continue; } }
    if (!Array.isArray(arr)) continue;
    if (!arr.includes('APP')) continue;
    const next = arr.map(v => (v === 'APP' ? 'IOS' : v));
    await conn.query('UPDATE product_sku SET platforms = ? WHERE id = ?', [JSON.stringify(next), s.id]);
    skuChanged++;
  }
  if (skuChanged > 0) console.log(`[migrate-v2] product_sku.platforms: ${skuChanged} 行 APP→IOS`);

  await conn.end();
  console.log('[migrate-v2] 迁移完成。');
}

main().catch(e => {
  console.error('[migrate-v2] 失败：', e.message);
  process.exit(1);
});
