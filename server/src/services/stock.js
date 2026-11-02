const { HttpError } = require('../utils/helpers');

// 库存流转：下单锁定 → 取消/关闭释放；支付成功转销量。stock 为 NULL 表示不限量。

async function lockStock(conn, skuId, count = 1) {
  const [rows] = await conn.query('SELECT stock FROM product_sku WHERE id = ? FOR UPDATE', [skuId]);
  const sku = rows[0];
  if (!sku || sku.stock === null || sku.stock === undefined) return;
  if (sku.stock < count) throw new HttpError('商品库存不足');
  await conn.query('UPDATE product_sku SET stock = stock - ?, locked_count = locked_count + ? WHERE id = ?', [count, count, skuId]);
}

async function releaseStock(conn, skuId, count = 1) {
  const [rows] = await conn.query('SELECT stock FROM product_sku WHERE id = ? FOR UPDATE', [skuId]);
  const sku = rows[0];
  if (!sku || sku.stock === null || sku.stock === undefined) return;
  await conn.query(
    'UPDATE product_sku SET stock = stock + ?, locked_count = GREATEST(locked_count - ?, 0) WHERE id = ?',
    [count, count, skuId]
  );
}

async function commitStock(conn, skuId, count = 1) {
  await conn.query(
    'UPDATE product_sku SET locked_count = GREATEST(locked_count - ?, 0), sales_count = sales_count + ? WHERE id = ?',
    [count, count, skuId]
  );
}

module.exports = { lockStock, releaseStock, commitStock };
