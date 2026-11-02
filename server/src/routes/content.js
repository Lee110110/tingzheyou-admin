const router = require('express').Router();
const { query, queryOne } = require('../config/db');
const { wrap, ok, parsePage, like, HttpError, toInt } = require('../utils/helpers');
const { authRequired, permRequired } = require('../middleware/auth');
const opLog = require('../services/opLog');
const { CONTENT_TYPES, LINK_TYPES } = require('../utils/constants');

router.use(authRequired, permRequired('content'));

function pickSlot(body) {
  const b = body || {};
  const type = CONTENT_TYPES.includes(b.type) ? b.type : null;
  const linkType = LINK_TYPES.includes(b.linkType) ? b.linkType : 'H5';
  return {
    type,
    title: String(b.title || '').trim(),
    image: b.image || '',
    link_type: linkType,
    link_url: String(b.linkUrl || '').trim(),
    weight: toInt(b.weight, 0),
  };
}

// 列表：按 type / 关键词筛选
router.get('/list', wrap(async (req, res) => {
  const { page, pageSize, offset } = parsePage(req.query);
  const where = ['is_deleted = 0'];
  const params = [];
  if (req.query.type) { where.push('type = ?'); params.push(req.query.type); }
  if (req.query.keyword) { where.push('title LIKE ?'); params.push(like(req.query.keyword)); }
  const whereSql = where.join(' AND ');
  const total = (await queryOne(`SELECT COUNT(*) AS c FROM content_slot WHERE ${whereSql}`, params)).c;
  const list = await query(
    `SELECT * FROM content_slot WHERE ${whereSql} ORDER BY weight DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  ok(res, { list, total, page, pageSize });
}));

router.post('/', wrap(async (req, res) => {
  const data = pickSlot(req.body);
  if (!data.type) throw new HttpError('请选择内容位类型');
  if (!data.title) throw new HttpError('请输入标题');
  if (!data.image) throw new HttpError('请上传图片');
  if (!data.link_url) throw new HttpError('请输入对应链接');
  const result = await query(
    'INSERT INTO content_slot (type, title, image, link_type, link_url, weight) VALUES (?,?,?,?,?,?)',
    [data.type, data.title, data.image, data.link_type, data.link_url, data.weight]
  );
  const created = await queryOne('SELECT * FROM content_slot WHERE id = ?', [result.insertId]);
  await opLog.record({ req, module: 'content', action: `新增${data.type === 'AD' ? '广告' : '轮播图'}`, target: created.title, after: created });
  ok(res, created);
}));

router.put('/:id', wrap(async (req, res) => {
  const before = await queryOne('SELECT * FROM content_slot WHERE id = ? AND is_deleted = 0', [req.params.id]);
  if (!before) throw new HttpError('内容位不存在', 404);
  const data = pickSlot(req.body);
  if (!data.title) throw new HttpError('请输入标题');
  if (!data.image) throw new HttpError('请上传图片');
  if (!data.link_url) throw new HttpError('请输入对应链接');
  await query(
    'UPDATE content_slot SET type=?, title=?, image=?, link_type=?, link_url=?, weight=? WHERE id=?',
    [data.type || before.type, data.title, data.image, data.link_type, data.link_url, data.weight, req.params.id]
  );
  const after = await queryOne('SELECT * FROM content_slot WHERE id = ?', [req.params.id]);
  await opLog.record({ req, module: 'content', action: `编辑${after.type === 'AD' ? '广告' : '轮播图'}`, target: after.title, before, after });
  ok(res, after);
}));

router.delete('/:id', wrap(async (req, res) => {
  const slot = await queryOne('SELECT * FROM content_slot WHERE id = ? AND is_deleted = 0', [req.params.id]);
  if (!slot) throw new HttpError('内容位不存在', 404);
  await query('UPDATE content_slot SET is_deleted = 1 WHERE id = ?', [req.params.id]);
  await opLog.record({ req, module: 'content', action: `删除${slot.type === 'AD' ? '广告' : '轮播图'}`, target: slot.title, before: slot, after: { isDeleted: 1 } });
  ok(res);
}));

module.exports = router;
