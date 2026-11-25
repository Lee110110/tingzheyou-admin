const router = require('express').Router();
const { query, queryOne, withTransaction } = require('../config/db');
const { wrap, ok, parsePage, like, HttpError, toInt } = require('../utils/helpers');
const { authRequired, permRequired } = require('../middleware/auth');
const opLog = require('../services/opLog');

router.use(authRequired, permRequired('product'));

// 商品仅承载基础对外展示信息；卡类型/有效期/库存/权益范围/归属渠道等履约配置在 SKU 维度

function pickProduct(body = {}) {
  return {
    name: String(body.name || '').trim(),
    subtitle: body.subtitle || '',
    detail_images: Array.isArray(body.detailImages) ? body.detailImages : [],
    purchase_notice: body.purchaseNotice || '',
    agreement: body.agreement || '',
    status: ['ON', 'OFF', 'HALTED'].includes(body.status) ? body.status : 'OFF',
  };
}

// 所属景区：空 = 通用卡；传入时校验景区存在且未删除
async function pickScenicAreaId(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const id = toInt(raw);
  const area = await queryOne('SELECT id FROM scenic_area WHERE id = ? AND is_deleted = 0', [id]);
  if (!area) throw new HttpError('所属景区不存在或已删除');
  return id;
}

// SKU 名称按规格生成（时长卡 0 = 永久，1 为历史规格）
function skuName(cardType, specValue) {
  if (cardType === 'DURATION') {
    return { 1: '月卡', 3: '季卡', 6: '半年卡', 12: '年卡', 0: '永久卡' }[specValue] || `${specValue}个月卡`;
  }
  return `${specValue}次卡`;
}

// 单个 SKU 的履约配置（含校验）。时长卡 0 = 永久；次卡按次数 + 时间窗。
function pickSku(s = {}) {
  const cardType = s.cardType === 'COUNT' ? 'COUNT' : 'DURATION';
  const rawSpec = cardType === 'DURATION' ? s.durationMonths : s.useCount;
  if (rawSpec === null || rawSpec === undefined || rawSpec === '') throw new HttpError('请选择 SKU 的有效期 / 次数');
  const specValue = toInt(rawSpec);
  const isPermanent = cardType === 'DURATION' && specValue === 0;
  if (!isPermanent && specValue <= 0) throw new HttpError('SKU 有效期 / 次数不合法');

  const effectiveMode = s.effectiveMode === 'SPECIFIED' ? 'SPECIFIED' : 'IMMEDIATE';
  if (effectiveMode === 'SPECIFIED' && !s.effectiveAt) throw new HttpError('请选择 SKU 指定生效时间');

  const scopeType = s.scopeType === 'SCENIC' ? 'SCENIC' : 'LEVEL';
  const scopeLevels = Array.isArray(s.scopeLevels) ? s.scopeLevels : [];
  const scopeScenicIds = Array.isArray(s.scopeScenicIds)
    ? Array.from(new Set(s.scopeScenicIds.map(Number).filter(Boolean))) : [];
  if (scopeType === 'LEVEL' && !scopeLevels.length) throw new HttpError('请勾选 SKU 可用景区级别');
  if (scopeType === 'SCENIC' && !scopeScenicIds.length) throw new HttpError('请选择 SKU 指定可用景区');

  // 价格统一在定价方案里配置；SKU 侧价格字段仅历史数据保留，默认 0
  const base = toInt(s.basePrice, 0);
  const original = toInt(s.originalPrice, 0);
  if (base < 0 || original < 0) throw new HttpError('SKU 价格必须为不小于 0 的整数（单位：分）');
  if (base > original) throw new HttpError('SKU 基础售价不能高于原价');

  return {
    id: s.id || null,
    card_type: cardType,
    specValue,
    name: skuName(cardType, specValue),
    valid_type: ['D30', 'D365', 'PERMANENT'].includes(s.validType) ? s.validType : 'D365',
    effective_mode: effectiveMode,
    effective_at: effectiveMode === 'SPECIFIED' ? String(s.effectiveAt).slice(0, 19).replace('T', ' ') : null,
    auto_invalid: s.autoInvalid === false || s.autoInvalid === 0 ? 0 : 1,
    regions: Array.isArray(s.regions) && s.regions.length ? s.regions : ['NATIONWIDE'],
    scope_type: scopeType,
    scope_levels: scopeLevels,
    scope_scenic_ids: scopeScenicIds,
    platforms: Array.isArray(s.platforms) && s.platforms.length ? s.platforms : ['MINI_PROGRAM'],
    discount: s.discount == null || s.discount === '' ? null : Math.max(1, Math.min(99, toInt(s.discount))),
    base_price: base,
    original_price: original,
    stock: s.stock == null || s.stock === '' ? null : Math.max(0, toInt(s.stock)),
  };
}

function validateSkus(skus) {
  if (!Array.isArray(skus) || !skus.length) throw new HttpError('请至少配置一个 SKU');
  const seen = new Set();
  for (const s of skus) {
    const sku = pickSku(s);
    // 同商品下允许差异化范围的同规格 SKU（如北京季卡 / 上海季卡），但完全相同配置不允许
    const scopeKey = sku.scope_type === 'SCENIC'
      ? `SCENIC:${[...sku.scope_scenic_ids].sort().join(',')}`
      : `LEVEL:${[...sku.scope_levels].sort().join(',')}`;
    const regionKey = sku.regions.includes('NATIONWIDE') ? 'NATIONWIDE' : [...sku.regions].sort().join(',');
    const key = [sku.card_type, sku.specValue, scopeKey, regionKey].join('|');
    if (seen.has(key)) throw new HttpError('SKU 配置重复：同卡类型、规格、使用范围的 SKU 只能配置一条');
    seen.add(key);
  }
}

async function skuReferenced(skuId) {
  const orderRef = await queryOne('SELECT id FROM orders WHERE sku_id = ? LIMIT 1', [skuId]);
  if (orderRef) return '订单';
  const planRef = await queryOne('SELECT id FROM price_plan_sku WHERE sku_id = ? LIMIT 1', [skuId]);
  if (planRef) return '定价方案';
  const batchRef = await queryOne('SELECT id FROM redeem_batch WHERE sku_id = ? LIMIT 1', [skuId]);
  if (batchRef) return '兑换码批次';
  return null;
}

async function saveSkus(conn, productId, skus) {
  const keepIds = skus.filter(s => s.id).map(s => Number(s.id));
  // 删除：未保留的旧 SKU，被引用则报错
  const oldSkus = await conn.query('SELECT * FROM product_sku WHERE product_id = ? AND is_deleted = 0', [productId]).then(r => r[0]);
  for (const old of oldSkus) {
    if (!keepIds.includes(old.id)) {
      const ref = await skuReferenced(old.id);
      if (ref) throw new HttpError(`SKU「${old.name}」已被${ref}引用，不能删除`);
      await conn.query('UPDATE product_sku SET is_deleted = 1 WHERE id = ?', [old.id]);
    }
  }
  for (const s of skus) {
    const sku = pickSku(s);
    const params = [sku.card_type, sku.name,
      sku.card_type === 'DURATION' ? sku.specValue : null,
      sku.card_type === 'COUNT' ? sku.specValue : null,
      sku.valid_type, sku.effective_mode, sku.effective_at, sku.auto_invalid,
      JSON.stringify(sku.regions), sku.scope_type, JSON.stringify(sku.scope_levels), JSON.stringify(sku.scope_scenic_ids),
      JSON.stringify(sku.platforms), sku.discount, sku.base_price, sku.original_price, sku.stock];
    if (sku.id) {
      await conn.query(
        `UPDATE product_sku SET card_type=?, name=?, duration_months=?, use_count=?, valid_type=?,
           effective_mode=?, effective_at=?, auto_invalid=?, regions=?, scope_type=?, scope_levels=?,
           scope_scenic_ids=?, platforms=?, discount=?, base_price=?, original_price=?, stock=?
         WHERE id=? AND product_id=?`,
        [...params, sku.id, productId]
      );
    } else {
      await conn.query(
        `INSERT INTO product_sku (product_id, card_type, name, duration_months, use_count, valid_type,
           effective_mode, effective_at, auto_invalid, regions, scope_type, scope_levels, scope_scenic_ids,
           platforms, discount, base_price, original_price, stock)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [productId, ...params]
      );
    }
  }
}

router.get('/list', wrap(async (req, res) => {
  const { page, pageSize, offset } = parsePage(req.query);
  const where = ['p.is_deleted = 0'];
  const params = [];
  if (req.query.keyword) { where.push('p.name LIKE ?'); params.push(like(req.query.keyword)); }
  if (req.query.status) { where.push('p.status = ?'); params.push(req.query.status); }
  if (req.query.scenicAreaId) { where.push('p.scenic_area_id = ?'); params.push(toInt(req.query.scenicAreaId)); }
  if (req.query.provinceCode) {
    where.push('p.scenic_area_id IN (SELECT id FROM scenic_area WHERE province_code = ? AND is_deleted = 0)');
    params.push(req.query.provinceCode);
  }
  if (req.query.cityCode) {
    where.push('p.scenic_area_id IN (SELECT id FROM scenic_area WHERE city_code = ? AND is_deleted = 0)');
    params.push(req.query.cityCode);
  }
  // 卡类型按 SKU 聚合判断（同一商品可同时含时长卡/次卡 SKU）
  if (req.query.cardType) {
    where.push('EXISTS(SELECT 1 FROM product_sku s WHERE s.product_id = p.id AND s.is_deleted = 0 AND s.card_type = ?)');
    params.push(req.query.cardType);
  }
  const whereSql = where.join(' AND ');
  const total = (await queryOne(`SELECT COUNT(*) AS c FROM product p WHERE ${whereSql}`, params)).c;
  const list = await query(
    `SELECT p.*, sa.name AS scenic_area_name,
       (SELECT COUNT(*) FROM product_sku s WHERE s.product_id = p.id AND s.is_deleted = 0) AS sku_count,
       (SELECT GROUP_CONCAT(DISTINCT s.card_type) FROM product_sku s WHERE s.product_id = p.id AND s.is_deleted = 0) AS card_types,
       (SELECT COUNT(*) FROM product_sku s WHERE s.product_id = p.id AND s.is_deleted = 0 AND s.stock IS NOT NULL) AS limited_sku_count,
       (SELECT COALESCE(SUM(s.stock), 0) FROM product_sku s WHERE s.product_id = p.id AND s.is_deleted = 0 AND s.stock IS NOT NULL) AS total_stock,
       (SELECT COUNT(*) FROM product_sku s WHERE s.product_id = p.id AND s.is_deleted = 0 AND s.stock IS NOT NULL AND s.stock > 0) AS in_stock_skus
     FROM product p
     LEFT JOIN scenic_area sa ON sa.id = p.scenic_area_id
     WHERE ${whereSql} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  ok(res, { list, total, page, pageSize });
}));

// 商品下拉（定价选择商品用）
router.get('/all', wrap(async (req, res) => {
  const list = await query(
    'SELECT id, name, status FROM product WHERE is_deleted = 0 AND name LIKE ? ORDER BY id DESC LIMIT 50',
    [like(req.query.keyword)]
  );
  ok(res, list);
}));

router.get('/:id', wrap(async (req, res) => {
  const product = await queryOne(
    `SELECT p.*, (SELECT sa.name FROM scenic_area sa WHERE sa.id = p.scenic_area_id) AS scenic_area_name
     FROM product p WHERE p.id = ? AND p.is_deleted = 0`,
    [req.params.id]
  );
  if (!product) throw new HttpError('商品不存在', 404);
  const skus = await query('SELECT * FROM product_sku WHERE product_id = ? AND is_deleted = 0 ORDER BY id', [req.params.id]);
  ok(res, { ...product, skus });
}));

router.post('/', wrap(async (req, res) => {
  const data = pickProduct(req.body);
  if (!data.name) throw new HttpError('请输入商品名称');
  const scenicAreaId = await pickScenicAreaId(req.body.scenicAreaId);
  validateSkus(req.body.skus);
  const productId = await withTransaction(async conn => {
    const [result] = await conn.query(
      'INSERT INTO product (name, subtitle, scenic_area_id, detail_images, purchase_notice, agreement, status) VALUES (?,?,?,?,?,?,?)',
      [data.name, data.subtitle, scenicAreaId, JSON.stringify(data.detail_images), data.purchase_notice, data.agreement, data.status]
    );
    const id = result.insertId;
    await saveSkus(conn, id, req.body.skus);
    return id;
  });
  const created = await queryOne('SELECT * FROM product WHERE id = ?', [productId]);
  const skus = await query('SELECT * FROM product_sku WHERE product_id = ? AND is_deleted = 0 ORDER BY id', [productId]);
  await opLog.record({ req, module: 'product', action: '创建商品', target: created.name, after: { ...created, skus } });
  ok(res, created);
}));

router.put('/:id', wrap(async (req, res) => {
  const before = await queryOne('SELECT * FROM product WHERE id = ? AND is_deleted = 0', [req.params.id]);
  if (!before) throw new HttpError('商品不存在', 404);
  const data = pickProduct(req.body);
  if (!data.name) throw new HttpError('请输入商品名称');
  const scenicAreaId = await pickScenicAreaId(req.body.scenicAreaId);
  validateSkus(req.body.skus);
  await withTransaction(async conn => {
    await conn.query(
      'UPDATE product SET name=?, subtitle=?, scenic_area_id=?, detail_images=?, purchase_notice=?, agreement=?, status=? WHERE id=?',
      [data.name, data.subtitle, scenicAreaId, JSON.stringify(data.detail_images), data.purchase_notice, data.agreement, data.status, req.params.id]
    );
    await saveSkus(conn, Number(req.params.id), req.body.skus);
  });
  const after = await queryOne('SELECT * FROM product WHERE id = ?', [req.params.id]);
  const skus = await query('SELECT * FROM product_sku WHERE product_id = ? AND is_deleted = 0 ORDER BY id', [req.params.id]);
  await opLog.record({ req, module: 'product', action: '编辑商品', target: after.name, before, after: { ...after, skus } });
  ok(res, after);
}));

// 删除校验：有订单 / 定价方案 / 兑换码绑定时不能删，只能停售
router.delete('/:id', wrap(async (req, res) => {
  const product = await queryOne('SELECT * FROM product WHERE id = ? AND is_deleted = 0', [req.params.id]);
  if (!product) throw new HttpError('商品不存在', 404);
  const orderRef = await queryOne(
    'SELECT o.id FROM orders o WHERE o.product_id = ? LIMIT 1', [req.params.id]
  );
  if (orderRef) throw new HttpError('该商品已有订单，不能删除，只能停售');
  const planRef = await queryOne(
    'SELECT ps.id FROM price_plan_sku ps JOIN product_sku s ON s.id = ps.sku_id WHERE s.product_id = ? LIMIT 1', [req.params.id]
  );
  if (planRef) throw new HttpError('该商品已被定价方案绑定，不能删除，只能停售');
  const batchRef = await queryOne(
    'SELECT b.id FROM redeem_batch b JOIN product_sku s ON s.id = b.sku_id WHERE s.product_id = ? LIMIT 1', [req.params.id]
  );
  if (batchRef) throw new HttpError('该商品已被兑换码批次绑定，不能删除，只能停售');
  await query('UPDATE product SET is_deleted = 1 WHERE id = ?', [req.params.id]);
  await query('UPDATE product_sku SET is_deleted = 1 WHERE product_id = ? AND is_deleted = 0', [req.params.id]);
  await opLog.record({ req, module: 'product', action: '删除商品', target: product.name, before: product, after: { isDeleted: 1 } });
  ok(res);
}));

router.put('/:id/status', wrap(async (req, res) => {
  const before = await queryOne('SELECT * FROM product WHERE id = ? AND is_deleted = 0', [req.params.id]);
  if (!before) throw new HttpError('商品不存在', 404);
  const status = req.body && req.body.status;
  if (!['ON', 'OFF', 'HALTED'].includes(status)) throw new HttpError('状态不合法');
  await query('UPDATE product SET status = ? WHERE id = ?', [status, req.params.id]);
  await opLog.record({
    req, module: 'product', action: { ON: '商品上架', OFF: '商品下架', HALTED: '商品停售' }[status],
    target: before.name, before: { status: before.status }, after: { status },
  });
  ok(res, { status });
}));

module.exports = router;
