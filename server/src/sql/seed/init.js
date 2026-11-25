/**
 * 初始化：建库建表 + 基础种子（行政区划 / 菜单 / 内置角色 / 初始管理员 / 系统配置）。
 * 幂等：重复执行不会产生重复数据。
 * 用法：npm run init
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const regionData = require('./region');

const DB_NAME = process.env.DB_NAME || 'tingzheyou_admin';

async function main() {
  // 1. 建库建表（multipleStatements 执行 schema.sql）
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    multipleStatements: true,
    charset: 'utf8mb4',
  });
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await conn.query(schema);
  await conn.query(`USE \`${DB_NAME}\``);
  console.log('[init] 建库建表完成');

  // 2. 行政区划
  const [regionCount] = await conn.query('SELECT COUNT(*) AS c FROM region');
  if (regionCount[0].c === 0) {
    const rows = [];
    regionData.forEach(p => {
      rows.push([p.code, '', p.name, 1]);
      (p.children || []).forEach(c => rows.push([c.code, p.code, c.name, 2]));
    });
    for (let i = 0; i < rows.length; i += 200) {
      await conn.query('INSERT INTO region (code, parent_code, name, level) VALUES ?', [rows.slice(i, i + 200)]);
    }
    console.log(`[init] 行政区划已写入 ${rows.length} 条`);
  } else {
    console.log('[init] 行政区划已存在，跳过');
  }

  // 3. 菜单（固定 id，重复执行时先清理重建）
  const menus = [
    [1, 0, '景区管理', '/scenic', 'Location', 1, 'scenic'],
    [2, 0, '商品管理', '/product', 'Goods', 2, 'product'],
    [3, 0, '定价管理', '/pricing', 'PriceTag', 3, 'pricing'],
    [4, 0, '兑换码管理', '/redeem', 'Ticket', 4, 'redeem'],
    [5, 0, '推荐管理', '/recommend', 'Star', 5, 'recommend'],
    [12, 0, '内容位管理', '/content', 'Picture', 10, 'content'],
    [6, 0, '订单管理', '/order', 'Document', 6, 'order'],
    [7, 0, '用户管理', '/user', 'User', 7, 'user'],
    [8, 0, '权限管理', '', 'Avatar', 8, null],
    [9, 8, '角色管理', '/system/role', 'Avatar', 1, 'system'],
    [10, 8, '成员管理', '/system/account', 'UserFilled', 2, 'system'],
    [11, 0, '日志管理', '/log', 'Notebook', 9, 'log'],
  ];
  await conn.query('DELETE FROM menu');
  for (const m of menus) {
    await conn.query(
      'INSERT INTO menu (id, parent_id, title, path, icon, sort, perm_code) VALUES (?,?,?,?,?,?,?)',
      m
    );
  }
  console.log('[init] 菜单已写入');

  // 4. 内置角色（menu id 固定，重复执行不会破坏已配置的角色权限）
  const [roles] = await conn.query('SELECT COUNT(*) AS c FROM role');
  if (roles[0].c === 0) {
    await conn.query("INSERT INTO role (id, name, remark) VALUES (1, '管理员', '全部板块权限')");
    await conn.query("INSERT INTO role (id, name, remark) VALUES (2, '运营员', '景区/商品/定价/兑换码/订单权限')");
    console.log('[init] 内置角色已写入');
  } else {
    console.log('[init] 角色已存在，跳过');
  }
  // 内置角色菜单权限（幂等）
  for (let i = 1; i <= menus.length; i++) {
    await conn.query('INSERT IGNORE INTO role_menu (role_id, menu_id) VALUES (1, ?)', [i]);
  }
  await conn.query('INSERT IGNORE INTO role_menu (role_id, menu_id) VALUES (2,1),(2,2),(2,3),(2,4),(2,6)');

  // 5. 初始管理员
  const [admins] = await conn.query('SELECT COUNT(*) AS c FROM admin_user');
  if (admins[0].c === 0) {
    await conn.query(
      "INSERT INTO admin_user (username, password_hash, real_name, role_id, status) VALUES ('admin', ?, '超级管理员', 1, 1)",
      [bcrypt.hashSync('Admin@123456', 10)]
    );
    console.log('[init] 初始管理员已创建：admin / Admin@123456（请登录后尽快修改密码）');
  } else {
    console.log('[init] 管理员已存在，跳过');
  }

  // 6. 系统配置
  await conn.query(
    "INSERT INTO sys_config (config_key, config_value, remark) VALUES ('pay_expire_minutes', '30', '待支付订单超时自动关闭（分钟）'), ('max_cumulative_months', '36', '时长卡同范围累计有效期上限（月），C 端重复购买校验用，见需求文档 7.11') ON DUPLICATE KEY UPDATE remark = VALUES(remark)"
  );

  await conn.end();
  console.log('[init] 初始化完成。执行 npm run demo 可写入演示业务数据。');
}

main().catch(e => {
  console.error('[init] 失败：', e.message);
  process.exit(1);
});
