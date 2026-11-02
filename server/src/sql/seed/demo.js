/**
 * 演示业务数据：覆盖各状态的订单、会员、兑换码、推荐位等，保证后台每个页面可直接验证。
 * 可重复执行（每次清空业务表后重建）。用法：npm run demo
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const dayjs = require('dayjs');
const { query, queryOne } = require('../../config/db');
const { genOrderNo, genCode } = require('../../utils/helpers');
const redeemService = require('../../services/redeem');
const orderOps = require('../../services/orderOps');
const { buildSkuSnapshot } = require('../../services/skuSnapshot');

const now = () => dayjs();
const ts = (d) => dayjs(d).format('YYYY-MM-DD HH:mm:ss');
const hoursAgo = (h) => dayjs().subtract(h, 'hour');

// skuId → productId（addOrder 自动回填商品）；skuId → SKU 行（下单时生成权益快照）
let skuProductMap = {};
let skuRowMap = {};

async function addOrder({ userId, type, channel, skuId, productId, skuName, original, pay, payStatus, fulfill = 'NONE', payMethod = 'WECHAT', createdAt, paidAt = null }) {
  if (!productId) productId = skuProductMap[skuId] || null;
  const snapshot = skuId && skuRowMap[skuId] ? JSON.stringify(buildSkuSnapshot(skuRowMap[skuId])) : null;
  const r = await query(
    `INSERT INTO orders (order_no, user_id, type, channel, product_id, sku_id, sku_name, sku_snapshot, original_price, pay_amount, pay_status, fulfill_status, pay_method, paid_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [genOrderNo(), userId, type, channel, productId, skuId, skuName, snapshot, original, pay, payStatus, fulfill, payMethod, paidAt ? ts(paidAt) : null, ts(createdAt)]
  );
  return r.insertId;
}

async function main() {
  console.log('[demo] 清空业务表…');
  await query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['orders', 'order_refund', 'membership', 'redeem_code', 'redeem_batch', 'price_plan_sku', 'price_plan', 'product_sku', 'product', 'recommendation', 'scenic_spot', 'scenic_area', 'user', 'op_log']) {
    await query(`TRUNCATE TABLE ${t}`);
  }
  await query('SET FOREIGN_KEY_CHECKS = 1');

  // 运营员测试账号
  await query(
    "INSERT INTO admin_user (username, password_hash, real_name, role_id, status) VALUES ('operator', ?, '运营小刘', 2, 1) ON DUPLICATE KEY UPDATE real_name = VALUES(real_name), role_id = 2",
    [bcrypt.hashSync('Oper@123456', 10)]
  );

  // ---------- 景区 ----------
  const areas = [
    ['gugong', '故宫博物院', '5A', '110000', '110100', '中国明清两代的皇家宫殿，世界文化遗产。', '08:30-17:00（周一闭馆）', '北京市东城区景山前街4号', 1],
    ['badaling', '八达岭长城', '5A', '110000', '110100', '万里长城的重要组成部分，明长城中保存最好的一段。', '06:30-19:00', '北京市延庆区军都山关沟古道北口', 1],
    ['summer', '颐和园', '5A', '110000', '110100', '清朝皇家园林，以昆明湖、万寿山为基址。', '06:00-20:00', '北京市海淀区新建宫门路19号', 1],
    ['xihu', '西湖风景名胜区', '5A', '330000', '330100', '杭州西湖，以秀丽的湖光山色和众多名胜古迹闻名。', '全天开放（收费景点 08:00-17:30）', '浙江省杭州市西湖区龙井路1号', 1],
    ['lingyin', '灵隐寺', '4A', '330000', '330100', '中国佛教名寺，始建于东晋，香火鼎盛。', '07:00-18:00', '浙江省杭州市西湖区法云弄1号', 1],
    ['waitan', '外滩', 'OTHER', '310000', '310100', '上海的城市名片，夜景尤为迷人。', '全天开放', '上海市黄浦区中山东一路', 1],
    ['mingzhu', '东方明珠', '5A', '310000', '310100', '上海的标志性文化景观建筑。', '09:00-21:00', '上海市浦东新区世纪大道1号', 1],
    ['bingmayong', '秦始皇兵马俑', '5A', '610000', '610100', '世界第八大奇迹，秦始皇陵陪葬坑。', '08:30-17:00', '陕西省西安市临潼区秦陵路', 1],
    ['dayanta', '大雁塔', '4A', '610000', '610100', '唐代古塔，玄奘法师主持修建。', '08:00-17:30', '陕西省西安市雁塔区雁塔南路', 1],
    ['zhangjiajie', '张家界国家森林公园', '5A', '430000', '430800', '中国第一个国家森林公园，峰林奇观。', '07:00-18:00', '湖南省张家界市武陵源区', 0],
    ['gulangyu', '鼓浪屿', '5A', '350000', '350200', '音乐之岛，万国建筑博览。', '全天开放（轮渡 05:45-00:30）', '福建省厦门市思明区鼓浪屿', 1],
    ['huanghelou', '黄鹤楼', '5A', '420000', '420100', '江南三大名楼之一，天下江山第一楼。', '08:30-17:00', '湖北省武汉市武昌区蛇山', 1],
    ['qingcheng', '青城山', '4A', '510000', '510100', '道教名山，青城天下幽。', '08:00-17:00', '四川省成都市都江堰市青城山路', 1],
  ];
  const areaId = {};
  for (const [key, name, level, prov, city, desc, openTime, address, status] of areas) {
    const r = await query(
      'INSERT INTO scenic_area (name, description, level, open_time, province_code, city_code, address, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [name, desc, level, openTime, prov, city, address, status, ts(hoursAgo(24 * 30))]
    );
    areaId[key] = r.insertId;
  }

  // ---------- 景点 ----------
  const spotList = [
    ['gugong', '太和殿', '俗称金銮殿，明清两代皇帝举行大典的场所。'],
    ['gugong', '乾清宫', '明代皇帝的寝宫，清代康熙前期的处理政务之所。'],
    ['gugong', '御花园', '宫廷园林，古树参天，亭台精致。'],
    ['badaling', '北一楼', '八达岭长城北线第一座敌楼，登城必到之处。'],
    ['badaling', '好汉坡', '坡度最陡的一段，登顶可获"好汉"之名。'],
    ['summer', '长廊', '728米的长廊，绘有一万四千余幅彩画。'],
    ['summer', '昆明湖', '占全园面积四分之三的湖面，可泛舟。'],
    ['xihu', '断桥残雪', '西湖十景之一，白娘子与许仙相会之地。'],
    ['xihu', '雷峰塔', '夕照名塔，可俯瞰西湖全景。'],
    ['xihu', '三潭印月', '西湖三岛之一，月夜泛舟胜地。'],
    ['lingyin', '大雄宝殿', '灵隐寺主殿，供奉释迦牟尼佛像。'],
    ['lingyin', '飞来峰', '石灰岩山峰，遍布五代以来的石窟造像。'],
    ['waitan', '外滩观景台', '全长约1.5公里，一览浦江两岸风光。'],
    ['mingzhu', '观光层', '263米高空俯瞰上海市区。'],
    ['bingmayong', '一号坑', '规模最大的兵马俑坑，步兵军阵。'],
    ['bingmayong', '二号坑', '由骑兵、战车和弩兵组成的混编军阵。'],
    ['dayanta', '塔顶远眺', '登塔顶俯瞰曲江景区。'],
    ['zhangjiajie', '金鞭溪', '全长5.7公里的峡谷溪流，被誉为"山水画廊"。'],
    ['zhangjiajie', '袁家界', '《阿凡达》哈利路亚山原型取景地。'],
    ['gulangyu', '日光岩', '鼓浪屿最高点，俯瞰全岛。'],
    ['gulangyu', '菽庄花园', '利用天然地形建成的海滨园林。'],
    ['huanghelou', '主楼观景台', '五层主楼，极目楚天舒。'],
    ['qingcheng', '上清宫', '青城山最高处的道观。'],
  ];
  const spotId = {};
  for (const [areaKey, name, desc] of spotList) {
    const r = await query(
      'INSERT INTO scenic_spot (scenic_area_id, name, description, created_at) VALUES (?,?,?,?)',
      [areaId[areaKey], name, desc, ts(hoursAgo(24 * 29))]
    );
    spotId[name] = r.insertId;
  }

  // ---------- 商品 + SKU ----------
  // 商品仅承载展示信息；卡类型/有效期/范围/渠道/库存等履约配置在 SKU 维度
  const products = [
    {
      key: 'p1', name: '听着游全国会员卡', subtitle: '全国 5A/4A 景区讲解畅听', status: 'ON',
      skus: [
        { key: 'p1_month', cardType: 'DURATION', months: 1, regions: ['NATIONWIDE'], scopeLevels: ['5A', '4A'], platforms: ['MINI_PROGRAM', 'IOS', 'H5'], base: 3000, original: 4900 },
        { key: 'p1_quarter', cardType: 'DURATION', months: 3, regions: ['NATIONWIDE'], scopeLevels: ['5A', '4A'], platforms: ['MINI_PROGRAM', 'IOS', 'H5'], base: 7800, original: 12800 },
        { key: 'p1_year', cardType: 'DURATION', months: 12, regions: ['NATIONWIDE'], scopeLevels: ['5A', '4A'], platforms: ['MINI_PROGRAM', 'IOS', 'H5'], base: 26800, original: 36800 },
        // 差异化范围演示：同商品下北京专属半年卡
        { key: 'p1_half_bj', cardType: 'DURATION', months: 6, regions: ['110000'], scopeLevels: ['5A'], platforms: ['MINI_PROGRAM'], base: 12800, original: 16800 },
      ],
    },
    {
      key: 'p2', name: '北京畅听卡', subtitle: '北京地区 5A 景区讲解畅听', status: 'ON',
      skus: [
        { key: 'p2_month', cardType: 'DURATION', months: 1, regions: ['110000'], scopeLevels: ['5A'], platforms: ['MINI_PROGRAM'], base: 2000, original: 3000 },
        { key: 'p2_year', cardType: 'DURATION', months: 12, regions: ['110000'], scopeLevels: ['5A'], platforms: ['MINI_PROGRAM'], base: 9900, original: 15800 },
      ],
    },
    {
      key: 'p3', name: '全国景区次卡', subtitle: '按次收听，全国 5A/4A 景区通用', status: 'ON',
      skus: [
        { key: 'p3_10', cardType: 'COUNT', count: 10, validType: 'D365', regions: ['NATIONWIDE'], scopeLevels: ['5A', '4A'], platforms: ['MINI_PROGRAM', 'IOS'], base: 4900, original: 6900, stock: 499 },
        { key: 'p3_20', cardType: 'COUNT', count: 20, validType: 'D365', regions: ['NATIONWIDE'], scopeLevels: ['5A', '4A'], platforms: ['MINI_PROGRAM', 'IOS'], base: 8800, original: 12800, stock: 500 },
      ],
    },
    {
      key: 'p4', name: '城市纪念体验卡', subtitle: '指定景区畅听体验', status: 'HALTED',
      skus: [
        { key: 'p4_quarter', cardType: 'DURATION', months: 3, scopeType: 'SCENIC', scopeScenicIds: [areaId.gugong, areaId.xihu, areaId.bingmayong], platforms: ['H5'], base: 5800, original: 8800 },
      ],
    },
  ];
  const skuId = {};
  for (const p of products) {
    const r = await query(
      'INSERT INTO product (name, subtitle, detail_images, purchase_notice, agreement, status, created_at) VALUES (?,?,?,?,?,?,?)',
      [p.name, p.subtitle, JSON.stringify([]), '本卡为虚拟商品，开卡后不支持无理由退款。', '《会员服务协议》……', p.status, ts(hoursAgo(24 * 20))]
    );
    const productId = r.insertId;
    for (const s of p.skus) {
      const months = s.cardType === 'DURATION' ? s.months : null;
      const count = s.cardType === 'COUNT' ? s.count : null;
      const name = s.cardType === 'DURATION'
        ? ({ 1: '月卡', 3: '季卡', 12: '年卡' }[months] || (months === 0 ? '永久卡' : `${months}个月卡`))
        : `${count}次卡`;
      const scopeType = s.scopeType === 'SCENIC' ? 'SCENIC' : 'LEVEL';
      const regions = s.regions || ['NATIONWIDE'];
      const scopeLevels = s.scopeLevels || [];
      const scopeScenicIds = s.scopeScenicIds || [];
      const validType = s.validType || 'D365';
      const sr = await query(
        `INSERT INTO product_sku (product_id, card_type, name, duration_months, use_count, valid_type, effective_mode, auto_invalid, regions, scope_type, scope_levels, scope_scenic_ids, platforms, discount, base_price, original_price, stock, created_at)
         VALUES (?,?,?,?,?,?,'IMMEDIATE',1,?,?,?,?,?,NULL,0,0,?)`,
        [productId, s.cardType, name, months, count, validType,
          JSON.stringify(regions), scopeType, JSON.stringify(scopeLevels), JSON.stringify(scopeScenicIds),
          JSON.stringify(s.platforms || ['MINI_PROGRAM']), s.stock == null ? null : s.stock, ts(hoursAgo(24 * 20))]
      );
      skuId[s.key] = sr.insertId;
      skuProductMap[sr.insertId] = productId;
      skuRowMap[sr.insertId] = {
        card_type: s.cardType, duration_months: months, use_count: count, valid_type: validType,
        regions, scope_type: scopeType, scope_levels: scopeLevels, scope_scenic_ids: scopeScenicIds,
      };
    }
  }

  // ---------- 定价方案（优先级越大越优先；end_at 为空 = 长期有效） ----------
  const plans = [
    ['双11大促', 100, 'ALL', 'ALL', now().subtract(3, 'day'), now().add(27, 'day'), 'ENABLED', [
      ['p1_year', 36800, 19900], ['p3_20', 12800, 6900],
    ]],
    ['iOS 专享老客回馈', 10, 'IOS', 'OLD', dayjs('2026-01-01 00:00:00'), dayjs('2026-12-31 23:59:59'), 'ENABLED', [
      ['p1_month', 4900, 2700], ['p1_quarter', 12800, 6800],
    ]],
    ['小程序新客专享价', 20, 'MINI_PROGRAM', 'NEW', dayjs('2026-01-01 00:00:00'), null, 'ENABLED', [
      ['p1_year', 36800, 24800],
    ]],
    ['过期会员召回价', 30, 'ALL', 'EXPIRED_MEMBER', dayjs('2026-01-01 00:00:00'), null, 'ENABLED', [
      ['p1_quarter', 12800, 5800], ['p1_year', 36800, 15800],
    ]],
    ['早鸟特惠', 50, 'MINI_PROGRAM', 'ALL', dayjs('2026-08-01 00:00:00'), dayjs('2026-09-30 23:59:59'), 'ENABLED', [
      ['p3_10', 6900, 3900],
    ]],
    ['周年庆特惠（未启用）', 50, 'ALL', 'ALL', dayjs('2026-11-11 00:00:00'), dayjs('2026-12-12 23:59:59'), 'DISABLED', [
      ['p2_year', 15800, 11800],
    ]],
  ];
  for (const [name, priority, channel, audience, start, end, status, items] of plans) {
    const r = await query(
      'INSERT INTO price_plan (name, priority, channel, audience, start_at, end_at, status, created_by) VALUES (?,?,?,?,?,?,?,?)',
      [name, priority, channel, audience, ts(start), end ? ts(end) : null, status, 'admin']
    );
    for (const [skuKey, original, sale] of items) {
      await query('INSERT INTO price_plan_sku (plan_id, sku_id, original_price, sale_price) VALUES (?,?,?,?)',
        [r.insertId, skuId[skuKey], original, sale]);
    }
  }

  // ---------- 用户 ----------
  const users = [
    ['u1', '旅行家小王', '13800001111', 'MINI_PROGRAM', hoursAgo(24 * 58)],
    ['u2', '爱听讲解的Lisa', '13900002222', 'IOS', hoursAgo(24 * 74)],
    ['u3', '老张游天下', '13700003333', 'H5', hoursAgo(24 * 100)],
    ['u4', '背包客阿杰', '13600004444', 'MINI_PROGRAM', hoursAgo(27 * 24)],
    ['u5', '带娃游学的妈妈', '13500005555', 'MINI_PROGRAM', hoursAgo(18 * 24)],
    ['u6', '山野骑行侠', '13400006666', 'IOS', hoursAgo(8 * 24)],
    ['u7', '文化深度游客', '13300007777', 'H5', hoursAgo(139 * 24)],
    ['u8', '周末去哪玩', '13200008888', 'MINI_PROGRAM', hoursAgo(3 * 24)],
  ];
  const uid = {};
  for (const [key, nickname, phone, channel, registered] of users) {
    const r = await query(
      'INSERT INTO user (nickname, phone, channel, registered_at, last_login_at) VALUES (?,?,?,?,?)',
      [nickname, phone, channel, ts(registered), ts(hoursAgo(5))]
    );
    uid[key] = r.insertId;
  }

  // ---------- 兑换码批次 ----------
  // skuKey 为 null 时是权益码（不关联 SKU，权益来自批次自身）；scenicIds 非空时为指定景区模式
  async function createBatch(name, skuKey, quantity, validType, regions, levels, usedCount, scenicIds = []) {
    const expireAt = validType === 'PERMANENT' ? null : ts(now().add({ M3: 3, M6: 6, Y1: 12 }[validType], 'month'));
    const r = await query(
      'INSERT INTO redeem_batch (name, sku_id, quantity, valid_type, expire_at, regions, levels, scenic_ids, status, used_count, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,\'ACTIVE\',0,\'admin\',?)',
      [name, skuKey ? skuId[skuKey] : null, quantity, validType, expireAt,
        JSON.stringify(scenicIds.length ? ['NATIONWIDE'] : regions), JSON.stringify(scenicIds.length ? [] : levels),
        JSON.stringify(scenicIds), ts(hoursAgo(24 * 10))]
    );
    const id = r.insertId;
    const codes = new Set();
    while (codes.size < quantity) codes.add(genCode());
    const values = [...codes].map(c => [id, c]);
    for (let i = 0; i < values.length; i += 500) {
      await query('INSERT INTO redeem_code (batch_id, code) VALUES ?', [values.slice(i, i + 500)]);
    }
    return { id, usedCount };
  }

  const b1 = await createBatch('五一渠道推广码', 'p1_year', 200, 'M6', ['NATIONWIDE'], ['ALL'], 0);
  await createBatch('北京地推码', 'p2_year', 50, 'Y1', ['110000'], ['5A'], 0);
  const b3 = await createBatch('双十一作废批次', 'p3_10', 20, 'M3', ['NATIONWIDE'], ['ALL'], 0);
  // 权益码（不关联 SKU）：全国模式 + 指定景区模式
  await createBatch('新用户全国体验码', null, 100, 'M3', ['NATIONWIDE'], ['ALL'], 0);
  const b5 = await createBatch('西湖景区体验码', null, 30, 'PERMANENT', ['NATIONWIDE'], [], 0, [areaId.xihu, areaId.lingyin]);

  // 兑换（走真实兑换服务，生成会员记录；兑换不开订单）
  for (const userKey of ['u4', 'u5', 'u6']) {
    const codeRow = await queryOne("SELECT code FROM redeem_code WHERE batch_id = ? AND status = 'UNUSED' LIMIT 1", [b1.id]);
    await redeemService.redeemCode({ userId: uid[userKey], code: codeRow.code });
  }
  // 权益码·指定景区：u2 兑换（无在途会员）
  const b5Code = await queryOne("SELECT code FROM redeem_code WHERE batch_id = ? AND status = 'UNUSED' LIMIT 1", [b5.id]);
  await redeemService.redeemCode({ userId: uid.u2, code: b5Code.code });
  // B3：先兑换 1 张，再作废整批（已兑换的会员不受影响）
  const b3Code = await queryOne("SELECT code FROM redeem_code WHERE batch_id = ? AND status = 'UNUSED' LIMIT 1", [b3.id]);
  await redeemService.redeemCode({ userId: uid.u7, code: b3Code.code });
  await query("UPDATE redeem_batch SET status = 'VOID' WHERE id = ?", [b3.id]);
  await query("UPDATE redeem_code SET status = 'VOID' WHERE batch_id = ? AND status = 'UNUSED'", [b3.id]);

  // ---------- 订单 ----------
  // 待支付（新）
  await addOrder({ userId: uid.u1, type: 'MEMBER_CARD', channel: 'MINI_PROGRAM', skuId: skuId.p1_month, productId: 0, skuName: '月卡', original: 4900, pay: 3000, payStatus: 'UNPAID', createdAt: hoursAgo(0.2) });
  // 待支付（2小时前 → 服务启动后由定时任务演示超时关闭）
  await addOrder({ userId: uid.u2, type: 'MEMBER_CARD', channel: 'IOS', skuId: skuId.p3_10, productId: 0, skuName: '10次卡', original: 6900, pay: 3900, payStatus: 'UNPAID', createdAt: hoursAgo(2) });

  // 已支付待开卡
  await addOrder({ userId: uid.u3, type: 'MEMBER_CARD', channel: 'MINI_PROGRAM', skuId: skuId.p1_year, productId: 0, skuName: '年卡', original: 36800, pay: 24800, payStatus: 'PAID', fulfill: 'WAIT_ACTIVATE', createdAt: hoursAgo(1), paidAt: hoursAgo(1) });
  await addOrder({ userId: uid.u6, type: 'MEMBER_CARD', channel: 'IOS', skuId: skuId.p2_year, productId: 0, skuName: '年卡', original: 15800, pay: 11800, payStatus: 'PAID', fulfill: 'WAIT_ACTIVATE', createdAt: hoursAgo(48), paidAt: hoursAgo(48) });

  // 已支付待开卡 → 开卡（生成会员）→ 部分退款（会员失效）
  const o6 = await addOrder({ userId: uid.u3, type: 'MEMBER_CARD', channel: 'IOS', skuId: skuId.p1_year, productId: 0, skuName: '年卡', original: 36800, pay: 19900, payStatus: 'PAID', fulfill: 'WAIT_ACTIVATE', createdAt: hoursAgo(24 * 8), paidAt: hoursAgo(24 * 8) });
  await redeemService.activateOrder(o6);
  await orderOps.refundOrder(o6, 5000, '活动差价补偿', null);

  // 已支付待开卡 → 开卡（正常会员）
  const o4 = await addOrder({ userId: uid.u1, type: 'MEMBER_CARD', channel: 'IOS', skuId: skuId.p1_quarter, productId: 0, skuName: '季卡', original: 12800, pay: 6800, payStatus: 'PAID', fulfill: 'WAIT_ACTIVATE', createdAt: hoursAgo(24 * 5), paidAt: hoursAgo(24 * 5) });
  await redeemService.activateOrder(o4);

  // 未开卡全额退款
  const o7 = await addOrder({ userId: uid.u4, type: 'MEMBER_CARD', channel: 'MINI_PROGRAM', skuId: skuId.p2_year, productId: 0, skuName: '年卡', original: 15800, pay: 15800, payStatus: 'PAID', fulfill: 'WAIT_ACTIVATE', createdAt: hoursAgo(24 * 6), paidAt: hoursAgo(24 * 6) });
  await orderOps.refundOrder(o7, 15800, '用户未开卡申请退款', null);

  // 支付失败
  await addOrder({ userId: uid.u2, type: 'MEMBER_CARD', channel: 'H5', skuId: skuId.p3_20, productId: 0, skuName: '20次卡', original: 12800, pay: 12800, payStatus: 'PAY_FAILED', createdAt: hoursAgo(24 * 3) });

  // 已开卡的次卡（剩余 4 次）
  const o12 = await addOrder({ userId: uid.u8, type: 'MEMBER_CARD', channel: 'MINI_PROGRAM', skuId: skuId.p3_10, productId: 0, skuName: '10次卡', original: 6900, pay: 4900, payStatus: 'PAID', fulfill: 'WAIT_ACTIVATE', createdAt: hoursAgo(24 * 4), paidAt: hoursAgo(24 * 4) });
  await redeemService.activateOrder(o12);
  await query('UPDATE membership SET remaining_count = 4 WHERE order_id = ?', [o12]);

  // 超时关闭
  const o9 = await addOrder({ userId: uid.u5, type: 'MEMBER_CARD', channel: 'IOS', skuId: skuId.p1_month, productId: 0, skuName: '月卡', original: 4900, pay: 2700, payStatus: 'UNPAID', createdAt: hoursAgo(3) });
  await orderOps.cancelOrder(o9, { closeType: 'TIMEOUT', reason: '支付超时自动关闭' });

  // 历史过期会员（用于"过期会员"标签演示）
  await query(
    `INSERT INTO membership (user_id, product_id, sku_id, source, order_id, start_at, end_at, status, remaining_count, activated_at, scope_regions, scope_levels, scope_scenic_ids, created_at)
     VALUES (?,?,?, 'PURCHASE', NULL, ?, ?, 'EXPIRED', NULL, ?, ?, ?, NULL, ?)`,
    [uid.u2, 1, skuId.p1_month, ts(dayjs('2026-05-01 10:00:00')), ts(dayjs('2026-06-01 10:00:00')), ts(dayjs('2026-05-01 10:00:00')),
      JSON.stringify(['NATIONWIDE']), JSON.stringify(['5A', '4A']), ts(dayjs('2026-05-01 10:00:00'))]
  );

  // ---------- 推荐位 ----------
  const recs = [
    [spotId['太和殿'], '', '', '', 100],
    [spotId['断桥残雪'], '西湖十景 · 断桥残雪', '手动配置的标题不会被景点更新覆盖', '', 80],
    [spotId['一号坑'], '', '', '', 60],
    [spotId['金鞭溪'], '', '', '', 40], // 所在景区已下架 → 演示"不可用"
  ];
  for (const [spot, title, summary, cover, weight] of recs) {
    await query('INSERT INTO recommendation (spot_id, title, summary, cover, weight) VALUES (?,?,?,?,?)',
      [spot, title, summary, cover, weight]);
  }

  // ---------- 样例日志 ----------
  const logs = [
    ['admin', 'auth', '登录成功', 'admin', '127.0.0.1'],
    ['admin', 'scenic', '新增景区', '故宫博物院', '127.0.0.1'],
    ['admin', 'product', '创建商品', '听着游全国会员卡', '127.0.0.1'],
    ['operator', 'pricing', '创建定价方案', '双11大促', '127.0.0.1'],
  ];
  for (const [username, module, action, target, ip] of logs) {
    await query(
      'INSERT INTO op_log (admin_user_id, username, module, action, target, ip) VALUES (?,?,?,?,?,?)',
      [username === 'admin' ? 1 : 2, username, module, action, target, ip]
    );
  }

  console.log('[demo] 演示数据写入完成。');
  console.log('  管理员：admin / Admin@123456');
  console.log('  运营员：operator / Oper@123456');
  console.log('  提示：有一条 2 小时前的待支付订单，服务启动 1 分钟内会被定时任务自动关闭（演示超时关单）。');
  process.exit(0);
}

main().catch(e => {
  console.error('[demo] 失败：', e);
  process.exit(1);
});
