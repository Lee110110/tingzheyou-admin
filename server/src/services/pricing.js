const { query } = require('../config/db');

/**
 * 定价命中规则：
 * 1. 候选 = 启用中 + 渠道匹配（精确或全部渠道）+ 人群匹配（全部用户或指定标签）+ 当前时间在生效周期内（end_at 为空 = 长期有效）+ 包含该 SKU
 * 2. 排序：优先级大的在前；渠道精确匹配 > 全部渠道；再比创建时间，新的优先
 * 3. 一笔交易只命中一条；无命中时按 SKU 基础价（历史数据）
 */
async function resolvePrice(skuId, channel, audience = 'ALL') {
  const rows = await query(
    `SELECT p.id, p.name, p.priority, p.channel, p.audience, ps.sale_price, ps.original_price
     FROM price_plan p
     JOIN price_plan_sku ps ON ps.plan_id = p.id
     WHERE ps.sku_id = ? AND p.status = 'ENABLED'
       AND p.start_at <= NOW() AND (p.end_at IS NULL OR p.end_at >= NOW())
       AND (p.channel = 'ALL' OR p.channel = ?)
       AND (p.audience = 'ALL' OR p.audience = ?)
     ORDER BY p.priority DESC,
              CASE WHEN p.channel = ? THEN 0 ELSE 1 END,
              p.created_at DESC
     LIMIT 1`,
    [skuId, channel, audience, channel]
  );
  if (rows.length) {
    return {
      hit: true,
      planId: rows[0].id,
      planName: rows[0].name,
      planPriority: rows[0].priority,
      salePrice: rows[0].sale_price,
      originalPrice: rows[0].original_price,
    };
  }
  const skuRows = await query('SELECT s.base_price, s.original_price, s.name FROM product_sku s WHERE s.id = ?', [skuId]);
  if (!skuRows.length) return { hit: false, planName: 'SKU 不存在', salePrice: null, originalPrice: null };
  return {
    hit: false,
    planName: 'SKU 基础价（未命中方案）',
    salePrice: skuRows[0].base_price,
    originalPrice: skuRows[0].original_price,
  };
}

/**
 * SKU 已绑定的其他方案（创建/编辑方案时的冲突提示，不阻止保存）
 */
async function getBoundPlans(skuId, excludePlanId = null) {
  const params = [skuId];
  let excludeSql = '';
  if (excludePlanId) {
    excludeSql = ' AND p.id != ?';
    params.push(excludePlanId);
  }
  return query(
    `SELECT p.id, p.name, p.priority, p.channel, p.audience, p.start_at, p.end_at, p.status
     FROM price_plan p
     JOIN price_plan_sku ps ON ps.plan_id = p.id
     WHERE ps.sku_id = ?${excludeSql}
     ORDER BY p.id DESC`,
    params
  );
}

module.exports = { resolvePrice, getBoundPlans };
