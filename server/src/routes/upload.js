const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { wrap, ok, HttpError } = require('../utils/helpers');
const { authRequired } = require('../middleware/auth');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

function makeStorage(sub) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOAD_ROOT, sub);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  });
}

const imageUpload = multer({
  storage: makeStorage('images'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new HttpError('仅支持上传图片文件'));
  },
});

const audioUpload = multer({
  storage: makeStorage('audio'),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^audio\//.test(file.mimetype)) return cb(null, true);
    cb(new HttpError('仅支持上传音频文件'));
  },
});

router.post('/image', authRequired, imageUpload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new HttpError('请选择要上传的图片');
  ok(res, { url: `/uploads/images/${req.file.filename}` });
}));

router.post('/audio', authRequired, audioUpload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new HttpError('请选择要上传的音频');
  ok(res, { url: `/uploads/audio/${req.file.filename}` });
}));

module.exports = router;
