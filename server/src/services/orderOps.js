const { withTransaction, query, queryOne } = require('../config/db');
const { HttpError } = require('../utils/helpers');
const stock = require('./stock');
const opLog = require('./opLog');

/**
 * 取消订单（后台手动取消 / 支付超时自动关闭）。
 * 仅待支付且未关闭的订单可取消；取消后释放锁定的库存。
 */
async function cancelOrder(orderId, { closeType = 'ADMIN_CANCEL', reason = '', req = null } = {}) {
  const order = await withTransaction(async conn => {
    const [rows] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    const o = rows[0];
    if (!o) throw new HttpError('订单不存在');
    if (o.close_type) throw new HttpError('订单已关闭，不能重复操作');
    if (o.pay_status !== 'UNPAID') throw new HttpError('仅待支付订单可以取消');
    await conn.query('UPDATE orders SET close_type = ?, cancel_reason = ? WHERE id = ?', [closeType, reason, orderId]);
    if (o.sku_id) await stock.releaseStock(conn, o.sku_id, 1);
    return o;
  });
  await opLog.record({
    req,
    module: 'order',
    action: closeType === 'TIMEOUT' ? '支付超时自动关闭' : '后台取消订单',
    target: order.order_no,
    before: { payStatus: order.pay_status, closeType: null },
    after: { closeType, reason },
  });
  return order;
}

/**
 * 退款：支持部分退款，累计退款 ≤ 实付金额。
 * 已开卡的订单退款后，会员权益立即失效（次卡剩余次数作废）；退款不返还库存。
 */
async function refundOrder(orderId, amount, reason, req = null) {
  if (!Number.isInteger(amount) || amount <= 0) throw new HttpError('退款金额不合法');
  const result = await withTransaction(async conn => {
    const [rows] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    const order = rows[0];
    if (!order) throw new HttpError('订单不存在');
    if (order.close_type) throw new HttpError('订单已关闭，不能退款');
    if (!['PAID', 'PART_REFUNDED'].includes(order.pay_status)) throw new HttpError('当前订单状态不支持退款');

    const refundedRow = await conn.query('SELECT COALESCE(SUM(amount), 0) AS s FROM order_refund WHERE order_id = ?', [orderId]);
    const refunded = refundedRow[0][0].s;
    const refundable = order.pay_amount - refunded;
    if (amount > refundable) {
      throw new HttpError(`退款金额不能超过可退金额 ${(refundable / 100).toFixed(2)} 元`);
    }

    const adminId = req && req.adminUser ? req.adminUser.id : null;
    await conn.query('INSERT INTO order_refund (order_id, admin_user_id, amount, reason) VALUES (?,?,?,?)', [orderId, adminId, amount, reason || '']);
    const newStatus = refunded + amount >= order.pay_amount ? 'REFUNDED' : 'PART_REFUNDED';
    await conn.query('UPDATE orders SET pay_status = ? WHERE id = ?', [newStatus, orderId]);

    // 已开卡退款 → 会员立即失效
    if (order.fulfill_status === 'ACTIVATED') {
      await conn.query("UPDATE membership SET status = 'REFUNDED' WHERE order_id = ? AND status = 'ACTIVE'", [orderId]);
    }
    return { order, refunded: refunded + amount, status: newStatus };
  });
  await opLog.record({
    req,
    module: 'order',
    action: '订单退款',
    target: result.order.order_no,
    before: { payStatus: result.order.pay_status },
    after: { amount, reason, payStatus: result.status, refundedTotal: result.refunded },
  });
  return result;
}

/**
 * 定时任务：关闭支付超时的待支付订单（sys_config.pay_expire_minutes，默认 30 分钟）
 */
async function closeExpiredOrders() {
  const cfg = await queryOne("SELECT config_value FROM sys_config WHERE config_key = 'pay_expire_minutes'");
  const minutes = cfg ? parseInt(cfg.config_value, 10) || 30 : 30;
  const rows = await query(
    "SELECT id FROM orders WHERE pay_status = 'UNPAID' AND close_type IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)",
    [minutes]
  );
  for (const row of rows) {
    await cancelOrder(row.id, { closeType: 'TIMEOUT', reason: '支付超时自动关闭' });
  }
  return rows.length;
}

/**
 * 定时任务：会员过期自动失效（仅 SKU auto_invalid=1；权益码会员无关联 SKU，随有效期到期自动失效）
 */
async function expireMemberships() {
  const result = await query(
    `UPDATE membership m LEFT JOIN product_sku s ON s.id = m.sku_id
     SET m.status = 'EXPIRED'
     WHERE m.status = 'ACTIVE' AND m.end_at IS NOT NULL AND m.end_at < NOW()
       AND (m.sku_id IS NULL OR s.auto_invalid = 1)`
  );
  return result.affectedRows;
}

module.exports = { cancelOrder, refundOrder, closeExpiredOrders, expireMemberships };
