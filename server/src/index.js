require('dotenv').config();
const app = require('./app');
const { closeExpiredOrders, expireMemberships } = require('./services/orderOps');

const PORT = Number(process.env.PORT || 3001);

app.listen(PORT, () => {
  console.log(`[houtai] server listening on http://localhost:${PORT}`);
});

// 定时任务：每分钟关闭支付超时的待支付订单、将过期会员置为已过期
setInterval(() => {
  closeExpiredOrders().catch(e => console.error('[timer] closeExpiredOrders', e.message));
  expireMemberships().catch(e => console.error('[timer] expireMemberships', e.message));
}, 60 * 1000);
