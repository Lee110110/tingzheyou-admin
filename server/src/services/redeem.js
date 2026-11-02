const { withTransaction } = require('../config/db');
const { HttpError } = require('../utils/helpers');
const stock = require('./stock');
const { parseSkuSnapshot } = require('./skuSnapshot');

/**
 * 权益范围并集（已确认：兑换码只会扩大权益范围）
 * spec = SKU 行或订单里的 SKU 快照（履约配置已下沉到 SKU 维度，商品不控制权益）
 * - regions: 任一方为 NATIONWIDE → 全国；否则取省市 code 并集
 * - levels: 数组并集
 * - scenicIds: SKU 指定景区 ∪ 批次指定景区
 */
function unionScope(spec, batch = null) {
  const r1 = Array.isArray(spec.regions) ? spec.regions : [];
  const r2 = batch && Array.isArray(batch.regions) ? batch.regions : [];
  const regions = r1.includes('NATIONWIDE') || r2.includes('NATIONWIDE')
    ? ['NATIONWIDE']
    : Array.from(new Set([...r1, ...r2]));

  const l1 = spec.scope_type === 'LEVEL' && Array.isArray(spec.scope_levels) ? spec.scope_levels : [];
  const l2 = batch && Array.isArray(batch.levels) ? batch.levels : [];
  const levels = Array.from(new Set([...l1, ...l2]));

  const s1 = spec.scope_type === 'SCENIC' && Array.isArray(spec.scope_scenic_ids) ? spec.scope_scenic_ids : [];
  const s2 = batch && Array.isArray(batch.scenic_ids) ? batch.scenic_ids : [];
  const scenicIds = Array.from(new Set([...s1, ...s2]));

  return { regions, levels, scenicIds };
}

// 权益码（未关联 SKU）批次自身的权益范围：指定景区时地域=全国、级别不生效
function batchScope(batch) {
  const scenicIds = Array.isArray(batch.scenic_ids) ? batch.scenic_ids : [];
  if (scenicIds.length) return { regions: ['NATIONWIDE'], levels: [], scenicIds };
  const regions = Array.isArray(batch.regions) && batch.regions.length ? batch.regions : ['NATIONWIDE'];
  const levels = Array.isArray(batch.levels) ? batch.levels : [];
  return { regions, levels, scenicIds: [] };
}

// 权益码会员有效期按批次 valid_type（3/6/12 个月，PERMANENT=永久）
function validEnd(validType, startDate) {
  if (validType === 'PERMANENT') return null;
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + { M3: 3, M6: 6, Y1: 12 }[validType]);
  return d;
}

// 有效期：时长卡按 duration_months（0 = 永久）；次卡按 valid_type 时间窗（30天/365天/永久）
function computeEnd(spec, startDate) {
  if (spec.duration_months === 0) return null;
  if (spec.duration_months) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + spec.duration_months);
    return d;
  }
  if (spec.valid_type === 'D30') return new Date(startDate.getTime() + 30 * 86400000);
  if (spec.valid_type === 'D365') return new Date(startDate.getTime() + 365 * 86400000);
  return null; // 永久
}

/**
 * 兑换码核销。当前无 C 端，由 demo 种子调用；后续 C 端可直接复用。
 * 关联 SKU 的批次：权益 = SKU 配置 ∪ 批次范围；权益码批次（无 SKU）：权益 = 批次自身。
 * 校验顺序：码不存在 → 已作废 → 已使用 → 已过期 → 用户已是会员。
 */
async function redeemCode({ userId, code }) {
  return withTransaction(async conn => {
    const [codeRows] = await conn.query('SELECT * FROM redeem_code WHERE code = ? FOR UPDATE', [code]);
    const c = codeRows[0];
    if (!c) throw new HttpError('兑换码不存在');
    if (c.status === 'VOID') throw new HttpError('该兑换码已作废');
    if (c.status === 'USED') throw new HttpError('该兑换码已被使用');
    const [batchRows] = await conn.query('SELECT * FROM redeem_batch WHERE id = ?', [c.batch_id]);
    const batch = batchRows[0];
    if (!batch) throw new HttpError('兑换码批次不存在');
    if (batch.status === 'VOID') throw new HttpError('该兑换码已作废');
    if (batch.expire_at && new Date(batch.expire_at) < new Date()) throw new HttpError('该兑换码已过期');

    const [activeRows] = await conn.query(
      "SELECT id FROM membership WHERE user_id = ? AND status = 'ACTIVE' LIMIT 1",
      [userId]
    );
    if (activeRows.length) throw new HttpError('用户已是会员，无法兑换');

    const now = new Date();
    let scope;
    let endAt;
    let memberSku = null; // { productId, skuId, skuName, useCount }
    if (batch.sku_id) {
      const [skuRows] = await conn.query('SELECT * FROM product_sku WHERE id = ?', [batch.sku_id]);
      const sku = skuRows[0];
      scope = unionScope(sku, batch);
      endAt = computeEnd(sku, now);
      memberSku = {
        productId: sku.product_id, skuId: sku.id, skuName: sku.name, useCount: sku.use_count || null,
      };
    } else {
      scope = batchScope(batch);
      endAt = validEnd(batch.valid_type, now);
    }

    // 兑换不开订单，仅生成会员记录（订单仅会员卡购买一种类型）
    const [memberRes] = await conn.query(
      `INSERT INTO membership (user_id, product_id, sku_id, source, order_id, start_at, end_at, status, remaining_count, activated_at, scope_regions, scope_levels, scope_scenic_ids)
       VALUES (?,?,?,?,NULL,?,?, 'ACTIVE', ?, NOW(), ?,?,?)`,
      [userId, memberSku ? memberSku.productId : null, memberSku ? memberSku.skuId : null, 'REDEEM', now, endAt,
        memberSku ? memberSku.useCount : null,
        JSON.stringify(scope.regions), JSON.stringify(scope.levels), JSON.stringify(scope.scenicIds)]
    );

    await conn.query(
      "UPDATE redeem_code SET status = 'USED', used_by = ?, used_at = NOW(), order_id = NULL WHERE id = ?",
      [userId, c.id]
    );
    await conn.query('UPDATE redeem_batch SET used_count = used_count + 1 WHERE id = ?', [batch.id]);

    return { membershipId: memberRes.insertId };
  });
}

/**
 * 购买订单开卡（PAID + WAIT_ACTIVATE → ACTIVATED），生成会员记录。
 * 会员权益以下单时的 SKU 快照为准；历史订单无快照时回退读取当前 SKU。
 */
async function activateOrder(orderId) {
  return withTransaction(async conn => {
    const [rows] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    const order = rows[0];
    if (!order) throw new HttpError('订单不存在');
    if (order.pay_status !== 'PAID' || order.fulfill_status !== 'WAIT_ACTIVATE') {
      throw new HttpError('订单状态不支持开卡');
    }
    let spec = parseSkuSnapshot(order.sku_snapshot);
    if (!spec) {
      const [skuRows] = await conn.query('SELECT * FROM product_sku WHERE id = ?', [order.sku_id]);
      spec = skuRows[0];
    }
    const now = new Date();
    const endAt = computeEnd(spec, now);
    const scope = unionScope(spec, null);
    const [memberRes] = await conn.query(
      `INSERT INTO membership (user_id, product_id, sku_id, source, order_id, start_at, end_at, status, remaining_count, activated_at, scope_regions, scope_levels, scope_scenic_ids)
       VALUES (?,?,?,?,?,?,?, 'ACTIVE', ?, NOW(), ?,?,?)`,
      [order.user_id, order.product_id, order.sku_id, 'PURCHASE', orderId, now, endAt, spec.use_count || null,
        JSON.stringify(scope.regions), JSON.stringify(scope.levels), JSON.stringify(scope.scenicIds)]
    );
    await conn.query("UPDATE orders SET fulfill_status = 'ACTIVATED' WHERE id = ?", [orderId]);
    await stock.commitStock(conn, order.sku_id, 1);
    return { membershipId: memberRes.insertId };
  });
}

module.exports = { unionScope, computeEnd, redeemCode, activateOrder };
