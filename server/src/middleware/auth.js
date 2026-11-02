const jwt = require('jsonwebtoken');
const { query, queryOne } = require('../config/db');

// 登录校验：解析 JWT 并确认账号仍然启用
async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ code: 401, msg: '未登录或登录已过期' });
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
  } catch (e) {
    return res.status(401).json({ code: 401, msg: '未登录或登录已过期' });
  }
  try {
    const user = await queryOne('SELECT id, username, real_name, role_id, status FROM admin_user WHERE id = ?', [payload.id]);
    if (!user || user.status !== 1) return res.status(401).json({ code: 401, msg: '账号不存在或已禁用' });
    req.adminUser = user;
    next();
  } catch (e) {
    next(e);
  }
}

// 菜单级权限校验：当前角色是否拥有该模块菜单
function permRequired(permCode) {
  return async (req, res, next) => {
    try {
      const rows = await query('SELECT DISTINCT m.perm_code FROM role_menu rm JOIN menu m ON m.id = rm.menu_id WHERE rm.role_id = ? AND m.perm_code IS NOT NULL', [req.adminUser.role_id]);
      if (rows.some(r => r.perm_code === permCode)) return next();
      return res.status(403).json({ code: 403, msg: '没有该模块的操作权限' });
    } catch (e) {
      next(e);
    }
  };
}

module.exports = { authRequired, permRequired };
