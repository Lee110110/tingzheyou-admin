const router = require('express').Router();
const { query, queryOne } = require('../config/db');
const { wrap, ok, parsePage, like, HttpError, toInt } = require('../utils/helpers');
const { authRequired, permRequired } = require('../middleware/auth');

router.use(authRequired, permRequired('user'));

router.get('/list', wrap(async (req, res) => {
  const { page, pageSize, offset } = parsePage(req.query);
  const where = ['1=1'];
  const params = [];
  const kw = String(req.query.keyword || '').trim();
  if (kw) {
    where.push('(u.id = ? OR u.phone LIKE ? OR u.nickname LIKE ?)');
    params.push(toInt(kw, 0), like(kw), like(kw));
  }
  if (req.query.channel) { where.push('u.channel = ?'); params.push(req.query.channel); }
  if (req.query.startDate) { where.push('u.registered_at >= ?'); params.push(req.query.startDate); }
  if (req.query.endDate) { where.push('u.registered_at <= ?'); params.push(`${req.query.endDate} 23:59:59`); }
  // 用户标签：MEMBER 会员 / EXPIRED_MEMBER 过期会员 / NORMAL 普通
  if (req.query.tag === 'MEMBER') {
    where.push("EXISTS(SELECT 1 FROM membership m WHERE m.user_id = u.id AND m.status = 'ACTIVE')");
  } else if (req.query.tag === 'EXPIRED_MEMBER') {
    where.push("NOT EXISTS(SELECT 1 FROM membership m WHERE m.user_id = u.id AND m.status = 'ACTIVE')");
    where.push('EXISTS(SELECT 1 FROM membership m WHERE m.user_id = u.id)');
  } else if (req.query.tag === 'NORMAL') {
    where.push('NOT EXISTS(SELECT 1 FROM membership m WHERE m.user_id = u.id)');
  }
  const whereSql = where.join(' AND ');
  const base = `FROM user u WHERE ${whereSql}`;
  const total = (await queryOne(`SELECT COUNT(*) AS c ${base}`, params)).c;
  const list = await query(
    `SELECT u.*,
       (SELECT MAX(m.end_at) FROM membership m WHERE m.user_id = u.id AND m.status = 'ACTIVE') AS active_expire_at,
       (SELECT COUNT(*) FROM membership m WHERE m.user_id = u.id) AS membership_count,
       (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count,
       COALESCE((SELECT SUM(o.pay_amount) FROM orders o WHERE o.user_id = u.id AND o.paid_at IS NOT NULL), 0)
         - COALESCE((SELECT SUM(r.amount) FROM order_refund r JOIN orders o2 ON o2.id = r.order_id WHERE o2.user_id = u.id), 0) AS total_spent
     ${base} ORDER BY u.registered_at DESC, u.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  ok(res, { list, total, page, pageSize });
}));

router.get('/:id', wrap(async (req, res) => {
  const user = await queryOne('SELECT * FROM user WHERE id = ?', [req.params.id]);
  if (!user) throw new HttpError('用户不存在', 404);
  const memberships = await query(
    `SELECT m.*, s.name AS sku_name, s.duration_months, s.use_count, p.name AS product_name
     FROM membership m
     LEFT JOIN product_sku s ON s.id = m.sku_id
     LEFT JOIN product p ON p.id = m.product_id
     WHERE m.user_id = ? ORDER BY m.created_at DESC`,
    [req.params.id]
  );
  ok(res, {
    profile: user,
    activeMemberships: memberships.filter(m => m.status === 'ACTIVE'),
    historyMemberships: memberships.filter(m => m.status !== 'ACTIVE'),
  });
}));

router.get('/:id/orders', wrap(async (req, res) => {
  const { page, pageSize, offset } = parsePage(req.query);
  const total = (await queryOne('SELECT COUNT(*) AS c FROM orders WHERE user_id = ?', [req.params.id])).c;
  const list = await query(
    'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
    [req.params.id, pageSize, offset]
  );
  ok(res, { list, total, page, pageSize });
}));

router.get('/:id/redeems', wrap(async (req, res) => {
  const { page, pageSize, offset } = parsePage(req.query);
  const total = (await queryOne('SELECT COUNT(*) AS c FROM redeem_code WHERE used_by = ?', [req.params.id])).c;
  const list = await query(
    `SELECT c.code, c.used_at, b.name AS batch_name, b.regions, b.levels, b.scenic_ids,
            s.name AS sku_name, s.duration_months, s.use_count, p.name AS product_name
     FROM redeem_code c
     JOIN redeem_batch b ON b.id = c.batch_id
     LEFT JOIN product_sku s ON s.id = b.sku_id
     LEFT JOIN product p ON p.id = s.product_id
     WHERE c.used_by = ? ORDER BY c.used_at DESC LIMIT ? OFFSET ?`,
    [req.params.id, pageSize, offset]
  );
  ok(res, { list, total, page, pageSize });
}));

module.exports = router;
