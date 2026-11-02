// SKU 权益快照：下单时保存到订单，会员开卡以快照为准（SKU 配置后续变更不影响已下单订单）
function buildSkuSnapshot(sku) {
  return {
    card_type: sku.card_type,
    duration_months: sku.duration_months,
    use_count: sku.use_count,
    valid_type: sku.valid_type,
    regions: Array.isArray(sku.regions) ? sku.regions : [],
    scope_type: sku.scope_type,
    scope_levels: Array.isArray(sku.scope_levels) ? sku.scope_levels : [],
    scope_scenic_ids: Array.isArray(sku.scope_scenic_ids) ? sku.scope_scenic_ids : [],
  };
}

function parseSkuSnapshot(raw) {
  if (!raw) return null;
  try {
    const snap = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return snap && typeof snap === 'object' ? snap : null;
  } catch (e) {
    return null;
  }
}

module.exports = { buildSkuSnapshot, parseSkuSnapshot };
