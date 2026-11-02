const path = require('path');
const express = require('express');
const cors = require('cors');
const { authRequired } = require('./middleware/auth');
const { notFoundHandler, errorHandler } = require('./middleware/error');

const authRoutes = require('./routes/auth');
const regionRoutes = require('./routes/region');
const uploadRoutes = require('./routes/upload');
const scenicRoutes = require('./routes/scenic');
const productRoutes = require('./routes/product');
const pricingRoutes = require('./routes/pricing');
const redeemRoutes = require('./routes/redeem');
const orderRoutes = require('./routes/order');
const userRoutes = require('./routes/user');
const recommendRoutes = require('./routes/recommend');
const contentRoutes = require('./routes/content');
const logRoutes = require('./routes/log');
const systemRoutes = require('./routes/system');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

const api = express.Router();
api.use('/auth', authRoutes);
api.use(authRequired); // 其余接口均需登录
api.use('/region', regionRoutes);
api.use('/upload', uploadRoutes);
api.use('/scenic', scenicRoutes);
api.use('/product', productRoutes);
api.use('/pricing', pricingRoutes);
api.use('/redeem', redeemRoutes);
api.use('/order', orderRoutes);
api.use('/user', userRoutes);
api.use('/recommend', recommendRoutes);
api.use('/content', contentRoutes);
api.use('/log', logRoutes);
api.use('/system', systemRoutes);
app.use('/api/v1', api);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
