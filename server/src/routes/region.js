const router = require('express').Router();
const { query } = require('../config/db');
const { wrap, ok } = require('../utils/helpers');
const { authRequired } = require('../middleware/auth');

// 全国省市树（省 → 市），录入和筛选共用
router.get('/tree', authRequired, wrap(async (req, res) => {
  const rows = await query('SELECT code, parent_code, name, level FROM region ORDER BY id');
  const provinces = rows.filter(r => r.level === 1).map(r => ({ code: r.code, name: r.name, children: [] }));
  const byCode = new Map(provinces.map(p => [p.code, p]));
  rows.filter(r => r.level === 2).forEach(city => {
    const p = byCode.get(city.parent_code);
    if (p) p.children.push({ code: city.code, name: city.name });
  });
  ok(res, provinces);
}));

module.exports = router;
