const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query, queryOne, withTransaction } = require('../config/db');
const { wrap, ok, parsePage, like, HttpError, toInt } = require('../utils/helpers');
const { authRequired, permRequired } = require('../middleware/auth');
const opLog = require('../services/opLog');

router.use(authRequired, permRequired('system'));

// ---------- 角色 ----------

router.get('/roles', wrap(async (req, res) => {
  const { page, pageSize, offset } = parsePage(req.query);
  const where = ['1=1'];
  const params = [];
  if (req.query.keyword) { where.push('r.name LIKE ?'); params.push(like(req.query.keyword)); }
  const whereSql = where.join(' AND ');
  const total = (await queryOne(`SELECT COUNT(*) AS c FROM role r WHERE ${whereSql}`, params)).c;
  const list = await query(
    `SELECT r.*,
       (SELECT COUNT(*) FROM admin_user a WHERE a.role_id = r.id) AS member_count,
       (SELECT COUNT(*) FROM role_menu rm WHERE rm.role_id = r.id) AS menu_count
     FROM role r WHERE ${whereSql} ORDER BY r.id ASC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  ok(res, { list, total, page, pageSize });
}));

router.post('/roles', wrap(async (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  if (!name) throw new HttpError('请输入角色名称');
  const exist = await queryOne('SELECT id FROM role WHERE name = ?', [name]);
  if (exist) throw new HttpError('角色名称已存在');
  const result = await query('INSERT INTO role (name, remark) VALUES (?,?)', [name, (req.body && req.body.remark) || '']);
  const role = await queryOne('SELECT * FROM role WHERE id = ?', [result.insertId]);
  await opLog.record({ req, module: 'system', action: '新增角色', target: name, after: role });
  ok(res, role);
}));

router.put('/roles/:id', wrap(async (req, res) => {
  const before = await queryOne('SELECT * FROM role WHERE id = ?', [req.params.id]);
  if (!before) throw new HttpError('角色不存在', 404);
  const name = String((req.body && req.body.name) || '').trim();
  if (!name) throw new HttpError('请输入角色名称');
  const exist = await queryOne('SELECT id FROM role WHERE name = ? AND id != ?', [name, req.params.id]);
  if (exist) throw new HttpError('角色名称已存在');
  await query('UPDATE role SET name = ?, remark = ? WHERE id = ?', [name, (req.body && req.body.remark) || '', req.params.id]);
  const after = await queryOne('SELECT * FROM role WHERE id = ?', [req.params.id]);
  await opLog.record({ req, module: 'system', action: '编辑角色', target: name, before, after });
  ok(res, after);
}));

router.delete('/roles/:id', wrap(async (req, res) => {
  const role = await queryOne('SELECT * FROM role WHERE id = ?', [req.params.id]);
  if (!role) throw new HttpError('角色不存在', 404);
  const used = await queryOne('SELECT id FROM admin_user WHERE role_id = ? LIMIT 1', [req.params.id]);
  if (used) throw new HttpError('该角色下还有成员，不能删除');
  await withTransaction(async conn => {
    await conn.query('DELETE FROM role_menu WHERE role_id = ?', [req.params.id]);
    await conn.query('DELETE FROM role WHERE id = ?', [req.params.id]);
  });
  await opLog.record({ req, module: 'system', action: '删除角色', target: role.name, before: role });
  ok(res);
}));

router.get('/roles/:id/menus', wrap(async (req, res) => {
  const menuIds = await query('SELECT menu_id FROM role_menu WHERE role_id = ?', [req.params.id]);
  ok(res, menuIds.map(m => m.menu_id));
}));

router.put('/roles/:id/menus', wrap(async (req, res) => {
  const role = await queryOne('SELECT * FROM role WHERE id = ?', [req.params.id]);
  if (!role) throw new HttpError('角色不存在', 404);
  const menuIds = Array.isArray(req.body && req.body.menuIds) ? req.body.menuIds.map(Number).filter(Boolean) : [];
  await withTransaction(async conn => {
    await conn.query('DELETE FROM role_menu WHERE role_id = ?', [req.params.id]);
    for (const id of menuIds) {
      await conn.query('INSERT INTO role_menu (role_id, menu_id) VALUES (?,?)', [req.params.id, id]);
    }
  });
  await opLog.record({
    req, module: 'system', action: '配置角色权限', target: role.name,
    before: null, after: { menuIds },
  });
  ok(res);
}));

// 全部菜单树（配置角色权限用）
router.get('/menus', wrap(async (req, res) => {
  const menus = await query('SELECT * FROM menu ORDER BY sort, id');
  const byParent = {};
  menus.forEach(m => { (byParent[m.parent_id] = byParent[m.parent_id] || []).push(m); });
  const tree = (byParent[0] || []).map(m => ({
    id: m.id, label: m.title, permCode: m.perm_code,
    children: (byParent[m.id] || []).map(c => ({ id: c.id, label: c.title, permCode: c.perm_code })),
  }));
  ok(res, tree);
}));

// ---------- 成员（后台账号） ----------

router.get('/accounts', wrap(async (req, res) => {
  const { page, pageSize, offset } = parsePage(req.query);
  const where = ['1=1'];
  const params = [];
  if (req.query.keyword) { where.push('(a.username LIKE ? OR a.real_name LIKE ?)'); params.push(like(req.query.keyword), like(req.query.keyword)); }
  const whereSql = where.join(' AND ');
  const total = (await queryOne(`SELECT COUNT(*) AS c FROM admin_user a WHERE ${whereSql}`, params)).c;
  const list = await query(
    `SELECT a.id, a.username, a.real_name, a.role_id, a.status, a.last_login_at, a.created_at, r.name AS role_name
     FROM admin_user a LEFT JOIN role r ON r.id = a.role_id
     WHERE ${whereSql} ORDER BY a.id ASC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  ok(res, { list, total, page, pageSize });
}));

async function pickAccountPayload(body) {
  const name = String((body && body.username) || '').trim();
  const realName = String((body && body.realName) || '').trim();
  const roleId = toInt(body && body.roleId);
  if (!name) throw new HttpError('请输入登录账号');
  if (!/^[a-zA-Z0-9_]{3,50}$/.test(name)) throw new HttpError('账号为 3-50 位字母、数字或下划线');
  if (!realName) throw new HttpError('请输入姓名');
  const role = await queryOne('SELECT id FROM role WHERE id = ?', [roleId]);
  if (!role) throw new HttpError('请选择角色');
  return { username: name, realName, roleId };
}

router.post('/accounts', wrap(async (req, res) => {
  const data = await pickAccountPayload(req.body);
  const password = String((req.body && req.body.password) || '');
  if (password.length < 6) throw new HttpError('初始密码长度不能少于 6 位');
  const exist = await queryOne('SELECT id FROM admin_user WHERE username = ?', [data.username]);
  if (exist) throw new HttpError('账号已存在');
  const result = await query(
    'INSERT INTO admin_user (username, password_hash, real_name, role_id, status) VALUES (?,?,?,?,?)',
    [data.username, bcrypt.hashSync(password, 10), data.realName, data.roleId, (req.body && req.body.status) === 0 ? 0 : 1]
  );
  const created = await queryOne('SELECT id, username, real_name, role_id, status FROM admin_user WHERE id = ?', [result.insertId]);
  await opLog.record({ req, module: 'system', action: '新增成员', target: data.username, after: created });
  ok(res, created);
}));

router.put('/accounts/:id', wrap(async (req, res) => {
  const before = await queryOne('SELECT id, username, real_name, role_id, status FROM admin_user WHERE id = ?', [req.params.id]);
  if (!before) throw new HttpError('成员不存在', 404);
  const data = await pickAccountPayload(req.body);
  const exist = await queryOne('SELECT id FROM admin_user WHERE username = ? AND id != ?', [data.username, req.params.id]);
  if (exist) throw new HttpError('账号已存在');
  await query('UPDATE admin_user SET username = ?, real_name = ?, role_id = ? WHERE id = ?',
    [data.username, data.realName, data.roleId, req.params.id]);
  const after = await queryOne('SELECT id, username, real_name, role_id, status FROM admin_user WHERE id = ?', [req.params.id]);
  await opLog.record({ req, module: 'system', action: '编辑成员', target: data.username, before, after });
  ok(res, after);
}));

router.put('/accounts/:id/status', wrap(async (req, res) => {
  const before = await queryOne('SELECT * FROM admin_user WHERE id = ?', [req.params.id]);
  if (!before) throw new HttpError('成员不存在', 404);
  if (before.id === req.adminUser.id) throw new HttpError('不能禁用自己的账号');
  const status = req.body && Number(req.body.status) === 0 ? 0 : 1;
  await query('UPDATE admin_user SET status = ? WHERE id = ?', [status, req.params.id]);
  await opLog.record({
    req, module: 'system', action: status === 1 ? '启用成员' : '禁用成员',
    target: before.username, before: { status: before.status }, after: { status },
  });
  ok(res);
}));

router.put('/accounts/:id/reset-password', wrap(async (req, res) => {
  const user = await queryOne('SELECT * FROM admin_user WHERE id = ?', [req.params.id]);
  if (!user) throw new HttpError('成员不存在', 404);
  const password = String((req.body && req.body.password) || '');
  if (password.length < 6) throw new HttpError('新密码长度不能少于 6 位');
  await query('UPDATE admin_user SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(password, 10), req.params.id]);
  await opLog.record({ req, module: 'system', action: '重置成员密码', target: user.username });
  ok(res);
}));

router.delete('/accounts/:id', wrap(async (req, res) => {
  const user = await queryOne('SELECT * FROM admin_user WHERE id = ?', [req.params.id]);
  if (!user) throw new HttpError('成员不存在', 404);
  if (user.id === req.adminUser.id) throw new HttpError('不能删除自己的账号');
  await query('DELETE FROM admin_user WHERE id = ?', [req.params.id]);
  await opLog.record({ req, module: 'system', action: '删除成员', target: user.username, before: { username: user.username, realName: user.real_name } });
  ok(res);
}));

module.exports = router;
