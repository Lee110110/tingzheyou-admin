const router = require('express').Router();
const dayjs = require('dayjs');
const { query, queryOne, withTransaction } = require('../config/db');
const { wrap, ok, parsePage, like, HttpError, toInt, genCode } = require('../utils/helpers');
const { authRequired, permRequired } = require('../middleware/auth');
const opLog = require('../services/opLog');
const { sendExcel } = require('../utils/excel');
const { CODE_STATUS_LABELS, REDEEM_VALID_LABELS } = require('../utils/constants');

router.use(authRequired, permRequired('redeem'));

// 批次可关联 SKU（旧模式），也可以是权益码（sku_id 为 NULL，权益来自批次自身）→ 必须 LEFT JOIN
const BATCH_FIELDS = `
  b.*, s.name AS sku_name, s.use_count, s.duration_months, s.card_type, p.name AS product_name
  FROM redeem_batch b
  LEFT JOIN product_sku s ON s.id = b.sku_id
  LEFT JOIN product p ON p.id = s.product_id`;

router.get('/list', wrap(async (req, res) => {
  const { page, pageSize, offset } = parsePage(req.query);
  const where = ['1=1'];
  const params = [];
  const kw = String(req.query.keyword || '').trim();
  if (kw) {
    where.push('(b.name LIKE ? OR b.id = ?)');
    params.push(like(kw), toInt(kw, 0));
  }
  if (req.query.status) { where.push('b.status = ?'); params.push(req.query.status); }
  const whereSql = where.join(' AND ');
  const total = (await queryOne(`SELECT COUNT(*) AS c FROM redeem_batch b WHERE ${whereSql}`, params)).c;
  const list = (await query(
    `SELECT ${BATCH_FIELDS} WHERE ${whereSql} ORDER BY b.created_at DESC, b.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  )).map(b => ({
    ...b,
    remaining: b.quantity - b.used_count,
    expired: b.expire_at ? new Date(b.expire_at) < new Date() : false,
  }));
  ok(res, { list, total, page, pageSize });
}));

router.get('/:id', wrap(async (req, res) => {
  const batch = (await query(`SELECT ${BATCH_FIELDS} WHERE b.id = ?`, [req.params.id]))[0];
  if (!batch) throw new HttpError('批次不存在', 404);
  ok(res, { ...batch, remaining: batch.quantity - batch.used_count });
}));

router.post('/', wrap(async (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  // 关联 SKU 可选：不关联时为权益码，权益范围/有效期以批次设置为准
  const skuId = body.skuId == null || body.skuId === '' ? null : toInt(body.skuId);
  const quantity = toInt(body.quantity);
  const validType = ['M3', 'M6', 'Y1', 'PERMANENT'].includes(body.validType) ? body.validType : null;
  const scenicIds = Array.isArray(body.scenicIds)
    ? Array.from(new Set(body.scenicIds.map(Number).filter(Boolean))) : [];
  // 指定景区模式：地域置为全国、级别清空（级别维度不生效，展示为“—”）
  const regions = scenicIds.length ? ['NATIONWIDE']
    : Array.isArray(body.regions) && body.regions.length ? body.regions : ['NATIONWIDE'];
  const levels = scenicIds.length ? []
    : Array.isArray(body.levels) && body.levels.length ? body.levels : ['ALL'];
  if (!name) throw new HttpError('请输入批次名称');
  if (!quantity || quantity < 1 || quantity > 5000) throw new HttpError('生成数量必须在 1-5000 之间');
  if (!validType) throw new HttpError('请选择兑换码有效期');

  let sku = null;
  if (skuId) {
    sku = await queryOne(
      'SELECT s.*, p.name AS product_name FROM product_sku s JOIN product p ON p.id = s.product_id WHERE s.id = ? AND s.is_deleted = 0',
      [skuId]
    );
    if (!sku) throw new HttpError('SKU 不存在');
  }
  if (scenicIds.length) {
    const areas = await query('SELECT id FROM scenic_area WHERE id IN (?) AND is_deleted = 0', [scenicIds]);
    if (areas.length !== new Set(scenicIds).size) throw new HttpError('所选景区不存在或已删除');
  }

  const expireAt = validType === 'PERMANENT' ? null
    : dayjs().add({ M3: 3, M6: 6, Y1: 12 }[validType], 'month').format('YYYY-MM-DD HH:mm:ss');

  const batchId = await withTransaction(async conn => {
    const [result] = await conn.query(
      'INSERT INTO redeem_batch (name, sku_id, quantity, valid_type, expire_at, regions, levels, scenic_ids, status, used_count, created_by) VALUES (?,?,?,?,?,?,?,?,\'ACTIVE\',0,?)',
      [name, skuId, quantity, validType, expireAt, JSON.stringify(regions), JSON.stringify(levels), JSON.stringify(scenicIds), req.adminUser.username]
    );
    const id = result.insertId;
    // 生成兑换码：8 位、排除易混淆字符、全局唯一，与库里冲突自动重生成
    const codes = new Set();
    while (codes.size < quantity) {
      while (codes.size < quantity) codes.add(genCode());
      const all = [...codes];
      for (let i = 0; i < all.length; i += 500) {
        const chunk = all.slice(i, i + 500);
        const [rows] = await conn.query('SELECT code FROM redeem_code WHERE code IN (?)', [chunk]);
        rows.forEach(r => codes.delete(r.code));
      }
    }
    const values = [...codes];
    for (let i = 0; i < values.length; i += 500) {
      const chunk = values.slice(i, i + 500).map(c => [id, c]);
      await conn.query('INSERT INTO redeem_code (batch_id, code) VALUES ?', [chunk]);
    }
    return id;
  });
  const batch = await queryOne('SELECT * FROM redeem_batch WHERE id = ?', [batchId]);
  await opLog.record({
    req, module: 'redeem', action: '创建兑换码批次',
    target: `${name}（${quantity} 张 / ${sku ? `${sku.product_name} ${sku.name}` : '权益码'}）`, after: batch,
  });
  ok(res, batch);
}));

// 作废批次：未使用的码全部作废，已使用的码与对应会员不受影响
router.put('/:id/void', wrap(async (req, res) => {
  const batch = await queryOne('SELECT * FROM redeem_batch WHERE id = ?', [req.params.id]);
  if (!batch) throw new HttpError('批次不存在', 404);
  if (batch.status === 'VOID') throw new HttpError('该批次已作废');
  await withTransaction(async conn => {
    await conn.query("UPDATE redeem_batch SET status = 'VOID' WHERE id = ?", [req.params.id]);
    await conn.query("UPDATE redeem_code SET status = 'VOID' WHERE batch_id = ? AND status = 'UNUSED'", [req.params.id]);
  });
  await opLog.record({ req, module: 'redeem', action: '作废兑换码批次', target: batch.name, before: { status: batch.status }, after: { status: 'VOID' } });
  ok(res);
}));

// 批次内兑换码明细
router.get('/:id/codes', wrap(async (req, res) => {
  const { page, pageSize, offset } = parsePage(req.query);
  const where = ['c.batch_id = ?'];
  const params = [req.params.id];
  if (req.query.status) { where.push('c.status = ?'); params.push(req.query.status); }
  const whereSql = where.join(' AND ');
  const total = (await queryOne(`SELECT COUNT(*) AS c FROM redeem_code c WHERE ${whereSql}`, params)).c;
  const list = await query(
    `SELECT c.*, u.nickname AS used_by_name, u.phone AS used_by_phone
     FROM redeem_code c LEFT JOIN user u ON u.id = c.used_by
     WHERE ${whereSql} ORDER BY c.id ASC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  ok(res, { list, total, page, pageSize });
}));

// 导出 Excel
router.get('/:id/export', wrap(async (req, res) => {
  const batch = (await query(`SELECT ${BATCH_FIELDS} WHERE b.id = ?`, [req.params.id]))[0];
  if (!batch) throw new HttpError('批次不存在', 404);
  const codes = await query(
    `SELECT c.*, u.nickname AS used_by_name, u.phone AS used_by_phone
     FROM redeem_code c LEFT JOIN user u ON u.id = c.used_by
     WHERE c.batch_id = ? ORDER BY c.id ASC`,
    [req.params.id]
  );
  await sendExcel(res, `兑换码-${batch.name}.xlsx`,
    ['兑换码', '状态', '使用人', '使用人手机号', '使用时间', '有效期'],
    codes.map(c => [
      c.code,
      CODE_STATUS_LABELS[c.status] || c.status,
      c.used_by_name || '',
      c.used_by_phone || '',
      c.used_at || '',
      batch.expire_at ? `${batch.expire_at} 到期` : REDEEM_VALID_LABELS[batch.valid_type] || '无期限',
    ])
  );
}));

module.exports = router;
