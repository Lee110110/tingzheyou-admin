function notFoundHandler(req, res) {
  res.status(404).json({ code: 404, msg: '接口不存在' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err && err.httpStatus) {
    return res.status(err.httpStatus).json({ code: err.code || err.httpStatus, msg: err.message });
  }
  console.error('[error]', err);
  res.status(500).json({ code: 500, msg: '服务器内部错误' });
}

module.exports = { notFoundHandler, errorHandler };
