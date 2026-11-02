const router = require('express').Router();
const dayjs = require('dayjs');
const { query, queryOne } = require('../config/db');
const { wrap, ok, parsePage, like, HttpError, toInt } = require('../utils/helpers');
const { authRequired, permRequired } = require('../middleware/auth');
const orderOps = require('../services/orderOps');
const { sendExcel } = require('../utils/excel');
const {
  PAY_STATUS_LABELS, FULFILL_STATUS_LABELS, CLOSE_TYPE_LABELS,
  PAY_METHOD_LABELS, USER_CHANNEL_LABELS,
} = require('../utils/constants');

router.use(authRequired, permRequired('order'));

const LIST_SQL = `
  SELECT o.*, u.nickname AS user_nickname, u.phone AS user_phone
  FROM orders o JOIN user u ON u.id = o.user_id`;

function toArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v.filter(Boolean) : [v];
}

function buildWhere(q) {
  const where = ['1=1'];
  const params = [];
  if (q.orderNo) { where.push('o.order_no LIKE ?'); params.push(like(q.orderNo)); }
  if (q.userId) { where.push('o.user_id = ?'); params.push(toInt(q.userId)); }
  if (q.phone) { where.push('u.phone LIKE ?'); params.push(like(q.phone)); }
  const payStatuses = toArray(q.payStatus);
  if (payStatuses.length) { where.push('o.pay_status IN (?)'); params.push(payStatuses); }
  const channels = toArray(q.channel);
  if (channels.length) { where.push('o.channel IN (?)'); params.push(channels); }
  if (q.productId) { where.push('o.product_id = ?'); params.push(toInt(q.productId)); }
  if (q.skuId) { where.push('o.sku_id = ?'); params.push(toInt(q.skuId)); }
  if (q.startTime) { where.push('o.created_at >= ?'); params.push(q.startTime); }
  if (q.endTime) { where.push('o.created_at <= ?'); params.push(`${q.endTime} 23:59:59`); }
  return { whereSql: where.join(' AND '), params };
}

router.get('/list', wrap(async (req, res) => {
  const { page, pageSize, offset } = parsePage(req.query);
  const { whereSql, params } = buildWhere(req.query);
  const total = (await queryOne(`SELECT COUNT(*) AS c FROM orders o JOIN user u ON u.id = o.user_id WHERE ${whereSql}`, params)).c;
  const list = await query(
    `${LIST_SQL} WHERE ${whereSql} ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  ok(res, { list, total, page, pageSize });
}));

// 导出（注意：必须注册在 /:id 之前，否则会被 /:id 吞掉）
router.get('/export', wrap(async (req, res) => {
  const { whereSql, params } = buildWhere(req.query);
  const list = await query(
    `${LIST_SQL} WHERE ${whereSql} ORDER BY o.created_at DESC, o.id DESC LIMIT 10000`,
    params
  );
  await sendExcel(res, `订单导出-${dayjs().format('YYYYMMDD-HHmmss')}.xlsx`,
    ['订单号', '用户ID', '用户昵称', '手机号', '渠道', '订单项', '原价(元)', '实付(元)', '支付方式', '支付状态', '履约状态', '关闭原因', '下单时间', '支付时间'],
    list.map(o => [
      o.order_no, o.user_id, o.user_nickname, o.user_phone,
      USER_CHANNEL_LABELS[o.channel] || o.channel,
      o.sku_name,
      (o.original_price / 100).toFixed(2),
      (o.pay_amount / 100).toFixed(2),
      PAY_METHOD_LABELS[o.pay_method] || o.pay_method || '',
      o.close_type ? (o.close_type === 'TIMEOUT' ? '已关闭(超时)' : '已关闭') : PAY_STATUS_LABELS[o.pay_status] || o.pay_status,
      FULFILL_STATUS_LABELS[o.fulfill_status] || o.fulfill_status,
      o.close_type ? `${CLOSE_TYPE_LABELS[o.close_type] || o.close_type}${o.cancel_reason ? `：${o.cancel_reason}` : ''}` : '',
      o.created_at, o.paid_at || '',
    ])
  );
}));

router.get('/:id', wrap(async (req, res) => {
  const order = (await query(`${LIST_SQL} WHERE o.id = ?`, [req.params.id]))[0];
  if (!order) throw new HttpError('订单不存在', 404);
  const refunds = await query(
    `SELECT r.*, a.username AS admin_username FROM order_refund r LEFT JOIN admin_user a ON a.id = r.admin_user_id
     WHERE r.order_id = ? ORDER BY r.id DESC`,
    [req.params.id]
  );
  const refunded = (await queryOne('SELECT COALESCE(SUM(amount),0) AS s FROM order_refund WHERE order_id = ?', [req.params.id])).s;
  ok(res, { order: { ...order, refundedAmount: refunded, refundable: order.pay_amount - refunded }, refunds });
}));

router.post('/:id/cancel', wrap(async (req, res) => {
  await orderOps.cancelOrder(toInt(req.params.id), {
    closeType: 'ADMIN_CANCEL',
    reason: (req.body && req.body.reason) || '后台取消',
    req,
  });
  ok(res);
}));

router.post('/:id/refund', wrap(async (req, res) => {
  const { amount, reason } = req.body || {};
  const cents = Math.round(Number(amount));
  if (!Number.isFinite(cents) || cents <= 0) throw new HttpError('请输入正确的退款金额');
  if (!reason || !String(reason).trim()) throw new HttpError('请填写退款原因');
  await orderOps.refundOrder(toInt(req.params.id), cents, String(reason).trim(), req);
  ok(res);
}));

module.exports = router;
