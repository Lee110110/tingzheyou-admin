const router = require('express').Router();
const { query, queryOne, withTransaction } = require('../config/db');
const { wrap, ok, parsePage, like, HttpError, toInt } = require('../utils/helpers');
const { authRequired, permRequired } = require('../middleware/auth');
const opLog = require('../services/opLog');
const pricing = require('../services/pricing');
const { PLAN_CHANNELS, PLAN_AUDIENCES } = require('../utils/constants');

router.use(authRequired, permRequired('pricing'));

async function attachItems(plans) {
  if (!plans.length) return plans;
  const ids = plans.map(p => p.id);
  const items = await query(
    `SELECT ps.*, s.name AS sku_name, s.base_price AS sku_base_price, s.card_type, p2.name AS product_name
     FROM price_plan_sku ps
     JOIN product_sku s ON s.id = ps.sku_id
     JOIN product p2 ON p2.id = s.product_id
     WHERE ps.plan_id IN (?)`,
    [ids]
  );
  const byPlan = {};
  items.forEach(it => {
    (byPlan[it.plan_id] = byPlan[it.plan_id] || []).push(it);
  });
  return plans.map(p => ({
    ...p,
    expired: p.end_at && new Date(p.end_at) < new Date(),
    items: (byPlan[p.id] || []).map(it => ({
      skuId: it.sku_id, skuName: it.sku_name, productName: it.product_name,
      originalPrice: it.original_price, salePrice: it.sale_price,
    })),
  }));
}

router.get('/list', wrap(async (req, res) => {
  const { page, pageSize, offset } = parsePage(req.query);
  const where = ['1=1'];
  const params = [];
  if (req.query.keyword) { where.push('p.name LIKE ?'); params.push(like(req.query.keyword)); }
  if (req.query.audience) { where.push('p.audience = ?'); params.push(req.query.audience); }
  if (req.query.channel) { where.push('p.channel = ?'); params.push(req.query.channel); }
  if (req.query.status) { where.push('p.status = ?'); params.push(req.query.status); }
  const whereSql = where.join(' AND ');
  const total = (await queryOne(`SELECT COUNT(*) AS c FROM price_plan p WHERE ${whereSql}`, params)).c;
  const rows = await query(
    `SELECT * FROM price_plan p WHERE ${whereSql} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  ok(res, { list: await attachItems(rows), total, page, pageSize });
}));

// 命中规则验证 / 价格预览（注意：必须注册在 /:id 之前，否则会被 /:id 吞掉）
router.get('/resolve', wrap(async (req, res) => {
  const skuId = toInt(req.query.skuId);
  const channel = req.query.channel || 'MINI_PROGRAM';
  const audience = req.query.audience || 'ALL';
  if (!skuId) throw new HttpError('请指定 SKU');
  ok(res, { channel, audience, skuId, ...await pricing.resolvePrice(skuId, channel, audience) });
}));

// SKU 已绑定的方案（创建/编辑时的冲突提示）
router.get('/sku-bound', wrap(async (req, res) => {
  const skuId = toInt(req.query.skuId);
  if (!skuId) throw new HttpError('请指定 SKU');
  ok(res, await pricing.getBoundPlans(skuId, req.query.excludePlanId || null));
}));

router.get('/:id', wrap(async (req, res) => {
  const plan = await queryOne('SELECT * FROM price_plan WHERE id = ?', [req.params.id]);
  if (!plan) throw new HttpError('方案不存在', 404);
  const [withItems] = await attachItems([plan]);
  ok(res, withItems);
}));

async function buildWarnings(items, excludePlanId) {
  const warnings = [];
  for (const it of items) {
    const bound = await pricing.getBoundPlans(it.skuId, excludePlanId);
    const active = bound.filter(b => b.status === 'ENABLED');
    if (active.length) {
      const sku = await queryOne('SELECT name FROM product_sku WHERE id = ?', [it.skuId]);
      warnings.push({
        skuId: it.skuId,
        skuName: sku ? sku.name : `SKU#${it.skuId}`,
        planNames: active.map(a => a.name),
      });
    }
  }
  return warnings;
}

function validatePlanPayload(body) {
  const name = String((body && body.name) || '').trim();
  if (!name) throw new HttpError('请输入方案名称');
  const priority = toInt(body.priority, 0);
  if (priority < 0 || priority > 999) throw new HttpError('优先级必须在 0-999 之间');
  const channel = PLAN_CHANNELS.includes(body.channel) ? body.channel : 'ALL';
  const audience = PLAN_AUDIENCES.includes(body.audience) ? body.audience : 'ALL';
  const startAt = body.startAt;
  const endAt = body.endAt || null; // 为空 = 长期有效
  if (!startAt) throw new HttpError('请选择上线时间');
  if (endAt && new Date(endAt) <= new Date(startAt)) throw new HttpError('失效时间必须晚于上线时间');
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new HttpError('请选择要定价的 SKU');
  const seen = new Set();
  for (const it of items) {
    const skuId = toInt(it.skuId);
    if (!skuId) throw new HttpError('SKU 不合法');
    if (seen.has(skuId)) throw new HttpError('同一 SKU 在一个方案里只能配置一条价格');
    seen.add(skuId);
    const original = toInt(it.originalPrice, -1);
    const sale = toInt(it.salePrice, -1);
    if (original < 0 || sale < 0) throw new HttpError('价格必须为不小于 0 的整数（单位：分）');
    if (sale > original) throw new HttpError('售价不能高于原价');
  }
  return { name, priority, channel, audience, startAt, endAt, items };
}

// 适用渠道不能超出所选 SKU 的可售卖渠道范围
async function validateChannelScope(channel, items) {
  if (channel === 'ALL') return;
  const skus = await query('SELECT id, name, platforms FROM product_sku WHERE id IN (?) AND is_deleted = 0', [[...new Set(items.map(it => toInt(it.skuId)))]]);
  const byId = {};
  skus.forEach(s => {
    const platforms = typeof s.platforms === 'string' ? JSON.parse(s.platforms || '[]') : (s.platforms || []);
    byId[s.id] = { name: s.name, platforms };
  });
  for (const it of items) {
    const sku = byId[toInt(it.skuId)];
    if (!sku) throw new HttpError('SKU 不存在或已删除');
    if (!sku.platforms.includes(channel)) {
      throw new HttpError(`方案渠道超出了 SKU「${sku.name}」的可售卖渠道范围`);
    }
  }
}

router.post('/', wrap(async (req, res) => {
  const data = validatePlanPayload(req.body);
  await validateChannelScope(data.channel, data.items);
  const planId = await withTransaction(async conn => {
    const [result] = await conn.query(
      "INSERT INTO price_plan (name, priority, channel, audience, start_at, end_at, status, created_by) VALUES (?,?,?,?,?,?,'DISABLED',?)",
      [data.name, data.priority, data.channel, data.audience, data.startAt, data.endAt, req.adminUser.username]
    );
    for (const it of data.items) {
      await conn.query(
        'INSERT INTO price_plan_sku (plan_id, sku_id, original_price, sale_price) VALUES (?,?,?,?)',
        [result.insertId, toInt(it.skuId), toInt(it.originalPrice), toInt(it.salePrice)]
      );
    }
    return result.insertId;
  });
  // 新建默认停用，手动启用后参与价格匹配
  const plan = (await attachItems([await queryOne('SELECT * FROM price_plan WHERE id = ?', [planId])]))[0];
  const warnings = await buildWarnings(data.items, planId);
  await opLog.record({ req, module: 'pricing', action: '创建定价方案（默认停用）', target: data.name, after: plan });
  ok(res, { plan, warnings });
}));

router.put('/:id', wrap(async (req, res) => {
  const before = (await attachItems([await queryOne('SELECT * FROM price_plan WHERE id = ?', [req.params.id])]))[0];
  if (!before) throw new HttpError('方案不存在', 404);
  const data = validatePlanPayload(req.body);
  await validateChannelScope(data.channel, data.items);
  await withTransaction(async conn => {
    await conn.query('UPDATE price_plan SET name=?, priority=?, channel=?, audience=?, start_at=?, end_at=? WHERE id=?',
      [data.name, data.priority, data.channel, data.audience, data.startAt, data.endAt, req.params.id]);
    await conn.query('DELETE FROM price_plan_sku WHERE plan_id = ?', [req.params.id]);
    for (const it of data.items) {
      await conn.query('INSERT INTO price_plan_sku (plan_id, sku_id, original_price, sale_price) VALUES (?,?,?,?)',
        [req.params.id, toInt(it.skuId), toInt(it.originalPrice), toInt(it.salePrice)]);
    }
  });
  const after = (await attachItems([await queryOne('SELECT * FROM price_plan WHERE id = ?', [req.params.id])]))[0];
  const warnings = await buildWarnings(data.items, Number(req.params.id));
  await opLog.record({ req, module: 'pricing', action: '编辑定价方案', target: data.name, before, after });
  ok(res, { plan: after, warnings });
}));

// 已过期方案不可操作（灰色禁用）
router.put('/:id/status', wrap(async (req, res) => {
  const plan = await queryOne('SELECT * FROM price_plan WHERE id = ?', [req.params.id]);
  if (!plan) throw new HttpError('方案不存在', 404);
  if (plan.end_at && new Date(plan.end_at) < new Date()) throw new HttpError('方案已过期，不可操作');
  const status = req.body && req.body.status === 'DISABLED' ? 'DISABLED' : 'ENABLED';
  await query('UPDATE price_plan SET status = ? WHERE id = ?', [status, req.params.id]);
  await opLog.record({
    req, module: 'pricing', action: status === 'ENABLED' ? '启用定价方案' : '停用定价方案',
    target: plan.name, before: { status: plan.status }, after: { status },
  });
  ok(res, { status });
}));

router.delete('/:id', wrap(async (req, res) => {
  const plan = await queryOne('SELECT * FROM price_plan WHERE id = ?', [req.params.id]);
  if (!plan) throw new HttpError('方案不存在', 404);
  await withTransaction(async conn => {
    await conn.query('DELETE FROM price_plan_sku WHERE plan_id = ?', [req.params.id]);
    await conn.query('DELETE FROM price_plan WHERE id = ?', [req.params.id]);
  });
  await opLog.record({ req, module: 'pricing', action: '删除定价方案', target: plan.name, before: plan });
  ok(res);
}));

module.exports = router;
