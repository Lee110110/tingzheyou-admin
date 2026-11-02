class HttpError extends Error {
  constructor(msg, code = 400) {
    super(msg);
    this.code = code;
    this.httpStatus = typeof code === 'number' && code >= 400 && code < 600 ? code : 400;
  }
}

// async 路由包装，错误统一交给 errorHandler
function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function parsePage(q = {}) {
  const page = Math.max(1, parseInt(q.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function ok(res, data = null, msg = 'ok') {
  res.json({ code: 0, msg, data });
}

function genOrderNo() {
  return 'T' + Date.now() + Math.floor(1000 + Math.random() * 9000);
}

// 兑换码字符集：数字 + 大写字母，排除易混淆的 0/O/1/I
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

function toInt(v, d = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
}

function like(keyword) {
  return `%${String(keyword || '').trim()}%`;
}

module.exports = { HttpError, wrap, parsePage, ok, genOrderNo, genCode, toInt, like };
