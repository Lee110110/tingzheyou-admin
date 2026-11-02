const router = require('express').Router();
const { query, queryOne } = require('../config/db');
const { wrap, ok, parsePage, like, HttpError } = require('../utils/helpers');
const { authRequired, permRequired } = require('../middleware/auth');

router.use(authRequired, permRequired('log'));

router.get('/list', wrap(async (req, res) => {
  const { page, pageSize, offset } = parsePage(req.query);
  const where = ['1=1'];
  const params = [];
  if (req.query.module) { where.push('l.module = ?'); params.push(req.query.module); }
  if (req.query.keyword) { where.push('(l.username LIKE ? OR l.target LIKE ?)'); params.push(like(req.query.keyword), like(req.query.keyword)); }
  if (req.query.startDate) { where.push('l.created_at >= ?'); params.push(req.query.startDate); }
  if (req.query.endDate) { where.push('l.created_at <= ?'); params.push(`${req.query.endDate} 23:59:59`); }
  const whereSql = where.join(' AND ');
  const total = (await queryOne(`SELECT COUNT(*) AS c FROM op_log l WHERE ${whereSql}`, params)).c;
  const list = await query(
    `SELECT * FROM op_log l WHERE ${whereSql} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  ok(res, { list, total, page, pageSize });
}));

module.exports = router;
