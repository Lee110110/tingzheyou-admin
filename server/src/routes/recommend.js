const router = require('express').Router();
const { query, queryOne } = require('../config/db');
const { wrap, ok, parsePage, like, HttpError, toInt } = require('../utils/helpers');
const { authRequired, permRequired } = require('../middleware/auth');
const opLog = require('../services/opLog');

router.use(authRequired, permRequired('recommend'));

const LIST_SQL = `
  SELECT r.*, s.name AS spot_name, s.image AS spot_image, s.description AS spot_description,
         a.id AS area_id, a.name AS area_name, a.status AS area_status
  FROM recommendation r
  JOIN scenic_spot s ON s.id = r.spot_id
  JOIN scenic_area a ON a.id = s.scenic_area_id`;

router.get('/list', wrap(async (req, res) => {
  const { page, pageSize, offset } = parsePage(req.query);
  const where = ['r.is_deleted = 0'];
  const params = [];
  if (req.query.keyword) { where.push('r.title LIKE ?'); params.push(like(req.query.keyword)); }
  const whereSql = where.join(' AND ');
  const total = (await queryOne(`SELECT COUNT(*) AS c FROM recommendation r WHERE ${whereSql}`, params)).c;
  const list = await query(
    `${LIST_SQL} WHERE ${whereSql} ORDER BY r.weight DESC, r.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  ok(res, { list, total, page, pageSize });
}));

router.post('/', wrap(async (req, res) => {
  const body = req.body || {};
  const spotId = toInt(body.spotId);
  if (!spotId) throw new HttpError('请选择景点');
  const spot = (await query(
    `SELECT s.*, a.name AS area_name FROM scenic_spot s JOIN scenic_area a ON a.id = s.scenic_area_id
     WHERE s.id = ? AND s.is_deleted = 0 AND a.is_deleted = 0`,
    [spotId]
  ))[0];
  if (!spot) throw new HttpError('景点不存在或已删除');
  // 标题/摘要/封面为空时，从景点信息回填（此后手动修改不被景点更新覆盖）
  const title = String(body.title || '').trim() || spot.name;
  const summary = String(body.summary || '').trim() || (spot.description || '');
  const cover = String(body.cover || '').trim() || spot.image || '';
  const weight = toInt(body.weight, 0);
  const result = await query(
    'INSERT INTO recommendation (spot_id, title, summary, cover, weight) VALUES (?,?,?,?,?)',
    [spotId, title, summary, cover, weight]
  );
  const created = await queryOne('SELECT * FROM recommendation WHERE id = ?', [result.insertId]);
  await opLog.record({ req, module: 'recommend', action: '新增推荐位', target: title, after: created });
  ok(res, created);
}));

router.put('/:id', wrap(async (req, res) => {
  const before = await queryOne('SELECT * FROM recommendation WHERE id = ? AND is_deleted = 0', [req.params.id]);
  if (!before) throw new HttpError('推荐位不存在', 404);
  const body = req.body || {};
  const title = String(body.title || '').trim();
  const summary = String(body.summary || '').trim();
  const cover = String(body.cover || '').trim();
  const weight = toInt(body.weight, before.weight);
  if (!title) throw new HttpError('请输入标题');
  await query(
    'UPDATE recommendation SET title = ?, summary = ?, cover = ?, weight = ? WHERE id = ?',
    [title, summary, cover, weight, req.params.id]
  );
  const after = await queryOne('SELECT * FROM recommendation WHERE id = ?', [req.params.id]);
  await opLog.record({ req, module: 'recommend', action: '编辑推荐位', target: title, before, after });
  ok(res, after);
}));

router.delete('/:id', wrap(async (req, res) => {
  const rec = await queryOne('SELECT * FROM recommendation WHERE id = ? AND is_deleted = 0', [req.params.id]);
  if (!rec) throw new HttpError('推荐位不存在', 404);
  await query('UPDATE recommendation SET is_deleted = 1 WHERE id = ?', [req.params.id]);
  await opLog.record({ req, module: 'recommend', action: '删除推荐位', target: rec.title, before: rec, after: { isDeleted: 1 } });
  ok(res);
}));

module.exports = router;
