// 枚举与展示文案（与后端 server/src/utils/constants.js 保持同步）

export const SCENIC_LEVEL_OPTIONS = [
  { value: '5A', label: '5A' },
  { value: '4A', label: '4A' },
  { value: 'OTHER', label: '其他' },
];
export const SCENIC_LEVEL_LABELS = { '5A': '5A', '4A': '4A', OTHER: '其他' };

export const CARD_TYPE_OPTIONS = [
  { value: 'DURATION', label: '时长卡' },
  { value: 'COUNT', label: '次卡' },
];
export const CARD_TYPE_LABELS = { DURATION: '时长卡', COUNT: '次卡' };

export const PRODUCT_STATUS_OPTIONS = [
  { value: 'ON', label: '上架' },
  { value: 'OFF', label: '下架' },
  { value: 'HALTED', label: '停售' },
];
export const PRODUCT_STATUS_LABELS = { ON: '上架', OFF: '下架', HALTED: '停售' };
export const PRODUCT_STATUS_TAG = { ON: 'success', OFF: 'info', HALTED: 'warning' };

export const EFFECTIVE_MODE_OPTIONS = [
  { value: 'IMMEDIATE', label: '买后立即生效' },
  { value: 'SPECIFIED', label: '指定时间生效' },
];
export const VALID_TYPE_OPTIONS = [
  { value: 'D30', label: '30 天' },
  { value: 'D365', label: '365 天' },
  { value: 'PERMANENT', label: '永久有效' },
];
export const VALID_TYPE_LABELS = { D30: '30天', D365: '365天', PERMANENT: '永久有效' };

export const PLAN_CHANNEL_OPTIONS = [
  { value: 'ALL', label: '全部渠道' },
  { value: 'MINI_PROGRAM', label: '小程序' },
  { value: 'IOS', label: 'iOS' },
  { value: 'ANDROID', label: '安卓' },
  { value: 'HARMONY', label: '鸿蒙' },
  { value: 'H5', label: 'H5' },
];
// 标签映射保留 APP / OFFLINE，用于展示历史数据
export const PLAN_CHANNEL_LABELS = { ALL: '全部渠道', MINI_PROGRAM: '小程序', IOS: 'iOS', ANDROID: '安卓', HARMONY: '鸿蒙', H5: 'H5', APP: 'APP(历史)', OFFLINE: '线下导购' };

// 定价适用人群（单选：全部用户 或 指定标签）
export const PLAN_AUDIENCE_OPTIONS = [
  { value: 'ALL', label: '全部用户' },
  { value: 'NEW', label: '新客' },
  { value: 'OLD', label: '老客' },
  { value: 'EXPIRED_MEMBER', label: '过期会员' },
  { value: 'AGENT', label: '代理商' },
];
export const PLAN_AUDIENCE_LABELS = { ALL: '全部用户', NEW: '新客', OLD: '老客', EXPIRED_MEMBER: '过期会员', AGENT: '代理商' };

export const PLAN_STATUS_OPTIONS = [
  { value: 'ENABLED', label: '启用中' },
  { value: 'DISABLED', label: '已停用' },
];
export const PLAN_STATUS_LABELS = { ENABLED: '启用中', DISABLED: '已停用' };

export const REDEEM_VALID_OPTIONS = [
  { value: 'M3', label: '3 个月' },
  { value: 'M6', label: '6 个月' },
  { value: 'Y1', label: '一年' },
  { value: 'PERMANENT', label: '无期限' },
];
export const REDEEM_VALID_LABELS = { M3: '3个月', M6: '6个月', Y1: '一年', PERMANENT: '无期限' };

export const REDEEM_BATCH_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: '进行中' },
  { value: 'VOID', label: '已作废' },
];
export const REDEEM_BATCH_STATUS_LABELS = { ACTIVE: '进行中', VOID: '已作废' };

export const CODE_STATUS_OPTIONS = [
  { value: 'UNUSED', label: '未使用' },
  { value: 'USED', label: '已使用' },
  { value: 'VOID', label: '已作废' },
];
export const CODE_STATUS_LABELS = { UNUSED: '未使用', USED: '已使用', VOID: '已作废' };
export const CODE_STATUS_TAG = { UNUSED: 'success', USED: 'info', VOID: 'danger' };

// 订单仅会员卡一种类型；标签映射保留 PHYSICAL/REDEEM，用于展示历史数据
export const ORDER_TYPE_OPTIONS = [
  { value: 'MEMBER_CARD', label: '会员卡购买' },
];
export const ORDER_TYPE_LABELS = { MEMBER_CARD: '会员卡购买', PHYSICAL: '实物订单', REDEEM: '兑换码兑换单' };

// 部分退款不作为筛选项；标签/颜色映射保留 PART_REFUNDED，用于展示历史数据
export const PAY_STATUS_OPTIONS = [
  { value: 'UNPAID', label: '待支付' },
  { value: 'PAID', label: '已支付' },
  { value: 'PAY_FAILED', label: '支付失败' },
  { value: 'REFUNDED', label: '已退款' },
];
export const PAY_STATUS_LABELS = { UNPAID: '待支付', PAID: '已支付', PAY_FAILED: '支付失败', REFUNDED: '已退款', PART_REFUNDED: '部分退款' };
export const PAY_STATUS_TAG = { UNPAID: 'warning', PAID: 'success', PAY_FAILED: 'info', REFUNDED: 'danger', PART_REFUNDED: 'warning' };

export const FULFILL_STATUS_LABELS = { NONE: '-', WAIT_ACTIVATE: '待开卡', ACTIVATED: '已开卡', EXCHANGED: '已兑换' };
export const CLOSE_TYPE_LABELS = { USER_CANCEL: '用户取消', ADMIN_CANCEL: '后台取消', TIMEOUT: '超时关闭' };
export const PAY_METHOD_LABELS = { WECHAT: '微信支付', REDEEM_CODE: '兑换码' };

export const USER_CHANNEL_OPTIONS = [
  { value: 'MINI_PROGRAM', label: '小程序' },
  { value: 'IOS', label: 'iOS' },
  { value: 'ANDROID', label: '安卓' },
  { value: 'HARMONY', label: '鸿蒙' },
  { value: 'H5', label: 'H5' },
];
// 标签映射保留 APP，用于展示历史数据
export const USER_CHANNEL_LABELS = { MINI_PROGRAM: '小程序', IOS: 'iOS', ANDROID: '安卓', HARMONY: '鸿蒙', H5: 'H5', APP: 'APP(历史)' };

// SKU 可售卖渠道
export const SKU_PLATFORM_OPTIONS = [
  { value: 'MINI_PROGRAM', label: '小程序' },
  { value: 'IOS', label: 'iOS' },
  { value: 'ANDROID', label: '安卓' },
  { value: 'HARMONY', label: '鸿蒙' },
  { value: 'H5', label: 'H5' },
];

export const USER_TAG_OPTIONS = [
  { value: 'MEMBER', label: '会员用户' },
  { value: 'EXPIRED_MEMBER', label: '过期会员' },
  { value: 'NORMAL', label: '普通用户' },
];

export const MEMBERSHIP_STATUS_LABELS = { ACTIVE: '生效中', EXPIRED: '已过期', REFUNDED: '已退卡' };
export const MEMBERSHIP_STATUS_TAG = { ACTIVE: 'success', EXPIRED: 'info', REFUNDED: 'danger' };
export const MEMBERSHIP_SOURCE_LABELS = { PURCHASE: '购买', REDEEM: '兑换' };

export const LOG_MODULE_OPTIONS = [
  { value: 'scenic', label: '景区管理' },
  { value: 'product', label: '商品管理' },
  { value: 'pricing', label: '定价管理' },
  { value: 'redeem', label: '兑换码管理' },
  { value: 'recommend', label: '推荐管理' },
  { value: 'content', label: '内容位管理' },
  { value: 'order', label: '订单管理' },
  { value: 'user', label: '用户管理' },
  { value: 'system', label: '权限管理' },
  { value: 'auth', label: '登录' },
];
export const LOG_MODULE_LABELS = {
  scenic: '景区管理', product: '商品管理', pricing: '定价管理', redeem: '兑换码管理',
  recommend: '推荐管理', content: '内容位管理', order: '订单管理', user: '用户管理',
  system: '权限管理', auth: '登录', settings: '系统设置',
};

// 内容位类型（合并广告与首页轮播图）
export const CONTENT_TYPE_OPTIONS = [
  { value: 'AD', label: '广告' },
  { value: 'BANNER', label: '首页轮播图' },
];
export const CONTENT_TYPE_LABELS = { AD: '广告', BANNER: '首页轮播图' };
export const CONTENT_TYPE_TAG = { AD: 'warning', BANNER: 'success' };

// 内容位跳转链接类型
export const LINK_TYPE_OPTIONS = [
  { value: 'H5', label: 'H5 链接' },
  { value: 'MINI_PROGRAM', label: '小程序链接' },
];
export const LINK_TYPE_LABELS = { H5: 'H5 链接', MINI_PROGRAM: '小程序链接' };

export const PAGE_SIZE = 20;
