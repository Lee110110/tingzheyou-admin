const router = require('express').Router();
const { query, queryOne, withTransaction } = require('../config/db');
const { wrap, ok, parsePage, like, HttpError, toInt } = require('../utils/helpers');
const { authRequired, permRequired } = require('../middleware/auth');
const opLog = require('../services/opLog');

// 围栏写入：对象 JSON 化，空值存 NULL
const fenceVal = f => (f && typeof f === 'object' ? JSON.stringify(f) : null);

router.use(authRequired, permRequired('scenic'));

// ---------- 景区 ----------

router.get('/list', wrap(async (req, res) => {
  const { page, pageSize, offset } = parsePage(req.query);
  const where = ['a.is_deleted = 0'];
  const params = [];
  if (req.query.provinceCode) { where.push('a.province_code = ?'); params.push(req.query.provinceCode); }
  if (req.query.cityCode) { where.push('a.city_code = ?'); params.push(req.query.cityCode); }
  if (req.query.level) { where.push('a.level = ?'); params.push(req.query.level); }
  if (req.query.keyword) { where.push('a.name LIKE ?'); params.push(like(req.query.keyword)); }
  const whereSql = where.join(' AND ');
  const total = (await queryOne(`SELECT COUNT(*) AS c FROM scenic_area a WHERE ${whereSql}`, params)).c;
  const list = await query(
    `SELECT a.*,
       (SELECT COUNT(*) FROM scenic_spot s WHERE s.scenic_area_id = a.id AND s.is_deleted = 0) AS spot_count
     FROM scenic_area a WHERE ${whereSql} ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  ok(res, { list, total, page, pageSize });
}));

router.get('/:id', wrap(async (req, res) => {
  const area = await queryOne('SELECT * FROM scenic_area WHERE id = ? AND is_deleted = 0', [req.params.id]);
  if (!area) throw new HttpError('景区不存在', 404);
  ok(res, area);
}));

function pickArea(body) {
  const b = body || {};
  return {
    name: String(b.name || '').trim(),
    description: b.description || '',
    cover_image: b.coverImage || '',
    broadcast_audio: b.broadcastAudio || '',
    level: ['5A', '4A', 'OTHER'].includes(b.level) ? b.level : 'OTHER',
    open_time: b.openTime || '',
    province_code: b.provinceCode || '',
    city_code: b.cityCode || '',
    address: b.address || '',
    fence: b.fence || null,
  };
}

router.post('/', wrap(async (req, res) => {
  const data = pickArea(req.body);
  if (!data.name) throw new HttpError('请输入景区名称');
  if (!data.province_code || !data.city_code) throw new HttpError('请选择景区所在省市');
  const result = await query(
    'INSERT INTO scenic_area (name, description, cover_image, broadcast_audio, level, open_time, province_code, city_code, address, fence, status) VALUES (?,?,?,?,?,?,?,?,?,?,1)',
    [data.name, data.description, data.cover_image, data.broadcast_audio, data.level, data.open_time, data.province_code, data.city_code, data.address, fenceVal(data.fence)]
  );
  const created = await queryOne('SELECT * FROM scenic_area WHERE id = ?', [result.insertId]);
  await opLog.record({ req, module: 'scenic', action: '新增景区', target: created.name, after: created });
  ok(res, created);
}));

router.put('/:id', wrap(async (req, res) => {
  const before = await queryOne('SELECT * FROM scenic_area WHERE id = ? AND is_deleted = 0', [req.params.id]);
  if (!before) throw new HttpError('景区不存在', 404);
  const data = pickArea(req.body);
  if (!data.name) throw new HttpError('请输入景区名称');
  if (!data.province_code || !data.city_code) throw new HttpError('请选择景区所在省市');
  await query(
    'UPDATE scenic_area SET name=?, description=?, cover_image=?, broadcast_audio=?, level=?, open_time=?, province_code=?, city_code=?, address=?, fence=? WHERE id=?',
    [data.name, data.description, data.cover_image, data.broadcast_audio, data.level, data.open_time, data.province_code, data.city_code, data.address, fenceVal(data.fence), req.params.id]
  );
  const after = await queryOne('SELECT * FROM scenic_area WHERE id = ?', [req.params.id]);
  await opLog.record({ req, module: 'scenic', action: '编辑景区', target: after.name, before, after });
  ok(res, after);
}));

// 删除校验：被推荐管理引用 → 不能删；否则逻辑删除（含其下景点）
router.delete('/:id', wrap(async (req, res) => {
  const area = await queryOne('SELECT * FROM scenic_area WHERE id = ? AND is_deleted = 0', [req.params.id]);
  if (!area) throw new HttpError('景区不存在', 404);
  const refRow = await queryOne(
    `SELECT COUNT(*) AS c FROM recommendation r
     JOIN scenic_spot s ON s.id = r.spot_id
     WHERE s.scenic_area_id = ? AND r.is_deleted = 0`,
    [req.params.id]
  );
  if (refRow.c > 0) throw new HttpError(`该景区下有 ${refRow.c} 个景点被推荐管理引用，请先删除相关推荐`);
  await query('UPDATE scenic_area SET is_deleted = 1 WHERE id = ?', [req.params.id]);
  await query('UPDATE scenic_spot SET is_deleted = 1 WHERE scenic_area_id = ? AND is_deleted = 0', [req.params.id]);
  await opLog.record({ req, module: 'scenic', action: '删除景区', target: area.name, before: area, after: { isDeleted: 1 } });
  ok(res);
}));

router.put('/:id/status', wrap(async (req, res) => {
  const before = await queryOne('SELECT * FROM scenic_area WHERE id = ? AND is_deleted = 0', [req.params.id]);
  if (!before) throw new HttpError('景区不存在', 404);
  const status = Number(req.body && req.body.status) === 0 ? 0 : 1;
  await query('UPDATE scenic_area SET status = ? WHERE id = ?', [status, req.params.id]);
  await opLog.record({
    req, module: 'scenic', action: status === 1 ? '景区上架' : '景区下架',
    target: before.name, before: { status: before.status }, after: { status },
  });
  ok(res, { status });
}));

// ---------- 景点 ----------

function pickSpot(body) {
  const b = body || {};
  return {
    name: String(b.name || '').trim(),
    description: b.description || '',
    image: b.image || '',
    audio: b.audio || '',
    narration: b.narration || '',
    fence: b.fence || null,
    is_audition: b.isAudition ? 1 : 0,
    is_must_listen: b.isMustListen ? 1 : 0,
  };
}

router.get('/:id/spots', wrap(async (req, res) => {
  const list = await query(
    'SELECT * FROM scenic_spot WHERE scenic_area_id = ? AND is_deleted = 0 ORDER BY created_at DESC, id DESC',
    [req.params.id]
  );
  ok(res, list);
}));

router.post('/:id/spots', wrap(async (req, res) => {
  const area = await queryOne('SELECT * FROM scenic_area WHERE id = ? AND is_deleted = 0', [req.params.id]);
  if (!area) throw new HttpError('景区不存在', 404);
  const data = pickSpot(req.body);
  if (!data.name) throw new HttpError('请输入景点名称');
  const result = await query(
    'INSERT INTO scenic_spot (scenic_area_id, name, description, image, audio, narration, fence, is_audition, is_must_listen) VALUES (?,?,?,?,?,?,?,?,?)',
    [req.params.id, data.name, data.description, data.image, data.audio, data.narration, fenceVal(data.fence), data.is_audition, data.is_must_listen]
  );
  const created = await queryOne('SELECT * FROM scenic_spot WHERE id = ?', [result.insertId]);
  await opLog.record({ req, module: 'scenic', action: '新增景点', target: `${area.name} / ${created.name}`, after: created });
  ok(res, created);
}));

router.put('/spots/:spotId', wrap(async (req, res) => {
  const before = await queryOne('SELECT * FROM scenic_spot WHERE id = ? AND is_deleted = 0', [req.params.spotId]);
  if (!before) throw new HttpError('景点不存在', 404);
  const data = pickSpot(req.body);
  if (!data.name) throw new HttpError('请输入景点名称');
  await query(
    'UPDATE scenic_spot SET name=?, description=?, image=?, audio=?, narration=?, fence=?, is_audition=?, is_must_listen=? WHERE id=?',
    [data.name, data.description, data.image, data.audio, data.narration, fenceVal(data.fence), data.is_audition, data.is_must_listen, req.params.spotId]
  );
  const after = await queryOne('SELECT * FROM scenic_spot WHERE id = ?', [req.params.spotId]);
  await opLog.record({ req, module: 'scenic', action: '编辑景点', target: before.name, before, after });
  ok(res, after);
}));

router.delete('/spots/:spotId', wrap(async (req, res) => {
  const spot = await queryOne('SELECT * FROM scenic_spot WHERE id = ? AND is_deleted = 0', [req.params.spotId]);
  if (!spot) throw new HttpError('景点不存在', 404);
  const refRow = await queryOne('SELECT COUNT(*) AS c FROM recommendation WHERE spot_id = ? AND is_deleted = 0', [req.params.spotId]);
  if (refRow.c > 0) throw new HttpError('该景点已被推荐管理引用，请先删除相关推荐');
  await query('UPDATE scenic_spot SET is_deleted = 1 WHERE id = ?', [req.params.spotId]);
  await opLog.record({ req, module: 'scenic', action: '删除景点', target: spot.name, before: spot, after: { isDeleted: 1 } });
  ok(res);
}));

// 景点搜索（推荐管理选择景点用）
router.get('/spots/search', wrap(async (req, res) => {
  const kw = like(req.query.keyword);
  const list = await query(
    `SELECT s.id, s.name, s.image, s.description, s.scenic_area_id, a.name AS area_name, a.status AS area_status
     FROM scenic_spot s JOIN scenic_area a ON a.id = s.scenic_area_id
     WHERE s.is_deleted = 0 AND a.is_deleted = 0 AND s.name LIKE ?
     ORDER BY s.id DESC LIMIT 20`,
    [kw]
  );
  ok(res, list);
}));

// ---------- 线路管理 ----------

// 某景区的线路列表（含景点数）
router.get('/:id/routes', wrap(async (req, res) => {
  const list = await query(
    `SELECT r.*,
       (SELECT COUNT(*) FROM scenic_route_spot rs WHERE rs.route_id = r.id) AS spot_count
     FROM scenic_route r
     WHERE r.scenic_area_id = ? AND r.is_deleted = 0
     ORDER BY r.created_at DESC, r.id DESC`,
    [req.params.id]
  );
  ok(res, list);
}));

// 创建线路：{ name, spots: [{ spotId, sortOrder }] }
router.post('/:id/routes', wrap(async (req, res) => {
  const area = await queryOne('SELECT * FROM scenic_area WHERE id = ? AND is_deleted = 0', [req.params.id]);
  if (!area) throw new HttpError('景区不存在', 404);
  const name = String(req.body.name || '').trim();
  if (!name) throw new HttpError('请输入线路名称');
  const spots = Array.isArray(req.body.spots) ? req.body.spots : [];
  if (!spots.length) throw new HttpError('线路至少包含一个景点');
  const routeId = await withTransaction(async (conn) => {
    const [r] = await conn.query('INSERT INTO scenic_route (scenic_area_id, name) VALUES (?, ?)', [req.params.id, name]);
    const rid = r.insertId;
    for (const s of spots) {
      const spotId = toInt(s.spotId);
      if (!spotId) continue;
      const [exist] = await conn.query(
        'SELECT 1 FROM scenic_spot WHERE id = ? AND scenic_area_id = ? AND is_deleted = 0',
        [spotId, req.params.id]
      );
      if (!exist.length) throw new HttpError(`景点 ${spotId} 不属于该景区或已删除`);
      await conn.query(
        'INSERT INTO scenic_route_spot (route_id, scenic_spot_id, sort_order) VALUES (?, ?, ?)',
        [rid, spotId, toInt(s.sortOrder, 0)]
      );
    }
    return rid;
  });
  const created = await queryOne(
    `SELECT r.*, (SELECT COUNT(*) FROM scenic_route_spot rs WHERE rs.route_id = r.id) AS spot_count
     FROM scenic_route r WHERE r.id = ?`, [routeId]
  );
  await opLog.record({ req, module: 'scenic', action: '新增线路', target: `${area.name} / ${name}`, after: created });
  ok(res, created);
}));

// 线路详情（含有序景点）
router.get('/route/:routeId', wrap(async (req, res) => {
  const route = await queryOne('SELECT * FROM scenic_route WHERE id = ? AND is_deleted = 0', [req.params.routeId]);
  if (!route) throw new HttpError('线路不存在', 404);
  const spots = await query(
    `SELECT rs.sort_order, s.id, s.name, s.image, s.description
     FROM scenic_route_spot rs
     JOIN scenic_spot s ON s.id = rs.scenic_spot_id
     WHERE rs.route_id = ?
     ORDER BY rs.sort_order ASC, rs.id ASC`,
    [req.params.routeId]
  );
  ok(res, { route, spots });
}));

// 编辑线路：{ name, spots }（spots 整体替换）
router.put('/route/:routeId', wrap(async (req, res) => {
  const before = await queryOne('SELECT * FROM scenic_route WHERE id = ? AND is_deleted = 0', [req.params.routeId]);
  if (!before) throw new HttpError('线路不存在', 404);
  const name = String(req.body.name || '').trim();
  if (!name) throw new HttpError('请输入线路名称');
  const spots = Array.isArray(req.body.spots) ? req.body.spots : [];
  if (!spots.length) throw new HttpError('线路至少包含一个景点');
  await withTransaction(async (conn) => {
    await conn.query('UPDATE scenic_route SET name = ? WHERE id = ?', [name, req.params.routeId]);
    await conn.query('DELETE FROM scenic_route_spot WHERE route_id = ?', [req.params.routeId]);
    for (const s of spots) {
      const spotId = toInt(s.spotId);
      if (!spotId) continue;
      const [exist] = await conn.query(
        'SELECT 1 FROM scenic_spot WHERE id = ? AND scenic_area_id = ? AND is_deleted = 0',
        [spotId, before.scenic_area_id]
      );
      if (!exist.length) throw new HttpError(`景点 ${spotId} 不属于该景区或已删除`);
      await conn.query(
        'INSERT INTO scenic_route_spot (route_id, scenic_spot_id, sort_order) VALUES (?, ?, ?)',
        [req.params.routeId, spotId, toInt(s.sortOrder, 0)]
      );
    }
  });
  const after = await queryOne(
    `SELECT r.*, (SELECT COUNT(*) FROM scenic_route_spot rs WHERE rs.route_id = r.id) AS spot_count
     FROM scenic_route r WHERE r.id = ?`, [req.params.routeId]
  );
  await opLog.record({ req, module: 'scenic', action: '编辑线路', target: name, before, after });
  ok(res, after);
}));

// 删除线路（软删 route，物理删 route_spot；不影响景区景点本身）
router.delete('/route/:routeId', wrap(async (req, res) => {
  const route = await queryOne('SELECT * FROM scenic_route WHERE id = ? AND is_deleted = 0', [req.params.routeId]);
  if (!route) throw new HttpError('线路不存在', 404);
  await query('UPDATE scenic_route SET is_deleted = 1 WHERE id = ?', [req.params.routeId]);
  await query('DELETE FROM scenic_route_spot WHERE route_id = ?', [req.params.routeId]);
  await opLog.record({ req, module: 'scenic', action: '删除线路', target: route.name, before: route, after: { isDeleted: 1 } });
  ok(res);
}));

module.exports = router;
