const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, queryOne } = require('../config/db');
const { wrap, ok, HttpError } = require('../utils/helpers');
const { authRequired } = require('../middleware/auth');
const opLog = require('../services/opLog');

router.post('/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) throw new HttpError('请输入账号和密码');
  const user = await queryOne('SELECT * FROM admin_user WHERE username = ?', [username]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    await opLog.record({ req, module: 'auth', action: '登录失败', target: username });
    throw new HttpError('账号或密码错误');
  }
  if (user.status !== 1) {
    await opLog.record({ req, module: 'auth', action: '登录失败（账号禁用）', target: username });
    throw new HttpError('账号已禁用，请联系管理员');
  }
  const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '12h' });
  await query('UPDATE admin_user SET last_login_at = NOW() WHERE id = ?', [user.id]);
  await opLog.record({ req, module: 'auth', action: '登录成功', target: username });
  ok(res, {
    token,
    admin: { id: user.id, username: user.username, realName: user.real_name, roleId: user.role_id },
  });
}));

router.get('/profile', authRequired, wrap(async (req, res) => {
  const menus = await query('SELECT * FROM menu ORDER BY sort, id');
  const granted = await query('SELECT menu_id FROM role_menu WHERE role_id = ?', [req.adminUser.role_id]);
  const grantedSet = new Set(granted.map(g => g.menu_id));
  const visible = menus.filter(m => grantedSet.has(m.id));
  const byParent = {};
  visible.forEach(m => {
    (byParent[m.parent_id] = byParent[m.parent_id] || []).push(m);
  });
  const tree = (byParent[0] || []).map(m => ({
    id: m.id,
    title: m.title,
    path: m.path,
    icon: m.icon,
    children: (byParent[m.id] || []).map(c => ({ id: c.id, title: c.title, path: c.path, icon: c.icon })),
  }));
  const permCodes = Array.from(new Set(visible.map(m => m.perm_code).filter(Boolean)));
  ok(res, {
    admin: { id: req.adminUser.id, username: req.adminUser.username, realName: req.adminUser.real_name, roleId: req.adminUser.role_id },
    menus: tree,
    permCodes,
  });
}));

router.put('/password', authRequired, wrap(async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) throw new HttpError('请输入原密码和新密码');
  if (String(newPassword).length < 6) throw new HttpError('新密码长度不能少于 6 位');
  const user = await queryOne('SELECT * FROM admin_user WHERE id = ?', [req.adminUser.id]);
  if (!bcrypt.compareSync(oldPassword, user.password_hash)) throw new HttpError('原密码不正确');
  await query('UPDATE admin_user SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(newPassword, 10), user.id]);
  await opLog.record({ req, module: 'system', action: '修改登录密码', target: user.username });
  ok(res);
}));

module.exports = router;
