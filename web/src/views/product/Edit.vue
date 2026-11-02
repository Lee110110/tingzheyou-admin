<template>
  <div>
    <el-card shadow="never">
      <div class="head">
        <el-button @click="router.back()">← 返回</el-button>
        <span class="title">{{ isEdit ? `编辑商品：${form.name || id}` : '新建商品' }}</span>
      </div>

      <el-form label-width="120px" class="form">
        <el-divider content-position="left">基础信息（商品仅承载对外展示信息，履约配置在 SKU 维度）</el-divider>
        <el-row>
          <el-col :span="12">
            <el-form-item label="卡名称" required>
              <el-input v-model="form.name" placeholder="如：听着游全国会员卡" />
            </el-form-item>
            <el-form-item label="卡副标题">
              <el-input v-model="form.subtitle" placeholder="一句话卖点" />
            </el-form-item>
            <el-form-item label="上架状态">
              <el-select v-model="form.status" style="width: 160px">
                <el-option v-for="o in PRODUCT_STATUS_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="详情图">
          <ImageListUpload v-model="form.detailImages" hint="最多 9 张" />
        </el-form-item>
        <el-form-item label="购买须知">
          <el-input v-model="form.purchaseNotice" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="协议文本">
          <el-input v-model="form.agreement" type="textarea" :rows="4" />
        </el-form-item>

        <el-divider content-position="left">SKU 配置（卡类型 / 有效期 / 权益 / 使用范围 / 渠道 / 库存）</el-divider>
        <el-alert
          type="info" :closable="false" show-icon class="sku-tip"
          title="用户能去哪些景区以订单快照里的 SKU 配置为准；修改 SKU 的可用范围只对新下单生效，已开卡会员权益不变。"
        />
        <el-table :data="form.skus" empty-text="暂无数据" class="sku-table">
          <el-table-column label="规格" width="110">
            <template #default="{ row }">{{ skuDisplayName(row) }}</template>
          </el-table-column>
          <el-table-column label="卡类型" width="80">
            <template #default="{ row }">
              <el-tag :type="row.cardType === 'COUNT' ? 'warning' : 'primary'" size="small">
                {{ CARD_TYPE_LABELS[row.cardType] || row.cardType }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="有效期 / 权益" width="150">
            <template #default="{ row }">{{ skuBenefitText(row) }}</template>
          </el-table-column>
          <el-table-column label="使用范围" min-width="200">
            <template #default="{ row }">
              <div>{{ regionText(row.regions) }}</div>
              <div class="dim">{{ scopeText(row) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="归属渠道" width="160">
            <template #default="{ row }">
              {{ row.platforms.map(p => USER_CHANNEL_LABELS[p] || p).join('、') || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="库存" width="110">
            <template #default="{ row }">
              <span v-if="row.stock == null">不限量</span>
              <template v-else>余 {{ row.stock }}<el-tag v-if="row.stock <= 0" type="info" size="small" style="margin-left: 4px">售罄</el-tag></template>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row, $index }">
              <el-button link type="primary" @click="openSkuDialog(row, $index)">编辑</el-button>
              <el-button link type="danger" @click="form.skus.splice($index, 1)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-button style="margin-top: 10px" type="primary" plain @click="openSkuDialog()">＋ 添加 SKU</el-button>
      </el-form>

      <div class="footer-bar">
        <el-button @click="router.back()">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </div>
    </el-card>

    <!-- SKU 配置弹窗：履约信息全部在 SKU 维度配置 -->
    <el-dialog v-model="skuDialogVisible" :title="skuForm.id ? `编辑 SKU：${skuDisplayName(skuForm)}` : '添加 SKU'" width="720px" destroy-on-close>
      <el-form label-width="110px">
        <el-form-item label="卡类型" required>
          <el-radio-group v-model="skuForm.cardType" @change="onCardTypeChange">
            <el-radio v-for="o in CARD_TYPE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="skuForm.cardType === 'DURATION'" label="有效期" required>
          <el-select v-model="skuForm.durationMonths" style="width: 200px">
            <el-option v-for="o in durationSpecOptions" :key="o.value" :value="o.value" :label="o.label" />
          </el-select>
        </el-form-item>
        <template v-else>
          <el-form-item label="次数" required>
            <el-input-number v-model="skuForm.useCount" :min="1" :max="9999" :controls="false" style="width: 140px" />
            <span class="dim" style="margin-left: 8px">次</span>
          </el-form-item>
          <el-form-item label="次卡时间窗" required>
            <el-select v-model="skuForm.validType" style="width: 200px">
              <el-option v-for="o in VALID_TYPE_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
            </el-select>
            <div class="dim" style="width: 100%">次卡开通后需在该时间窗内使用完次数</div>
          </el-form-item>
        </template>

        <el-form-item label="生效方式">
          <el-radio-group v-model="skuForm.effectiveMode">
            <el-radio v-for="o in EFFECTIVE_MODE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="skuForm.effectiveMode === 'SPECIFIED'" label="指定生效时间" required>
          <el-date-picker v-model="skuForm.effectiveAt" type="datetime" placeholder="选择生效时间" value-format="YYYY-MM-DD HH:mm:ss" style="width: 220px" />
        </el-form-item>
        <el-form-item label="过期自动失效">
          <el-switch v-model="skuForm.autoInvalid" />
          <span class="dim" style="margin-left: 8px">有效期结束后自动置为已过期</span>
        </el-form-item>

        <el-form-item label="地理范围">
          <el-radio-group v-model="skuForm.regionsMode">
            <el-radio value="NATIONWIDE">全国</el-radio>
            <el-radio value="SPECIFY">指定省市</el-radio>
          </el-radio-group>
          <RegionCascader v-if="skuForm.regionsMode === 'SPECIFY'" v-model="skuForm.regionCodes" multiple class="block" />
        </el-form-item>
        <el-form-item label="权益范围">
          <el-radio-group v-model="skuForm.scopeType">
            <el-radio value="LEVEL">按景区级别</el-radio>
            <el-radio value="SCENIC">指定景区</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="skuForm.scopeType === 'LEVEL'" label="景区级别" required>
          <el-checkbox-group v-model="skuForm.scopeLevels">
            <el-checkbox v-for="o in SCENIC_LEVEL_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item v-if="skuForm.scopeType === 'SCENIC'" label="选择景区" required>
          <el-select v-model="skuForm.scopeScenicIds" multiple filterable placeholder="可搜索选择多个景区" style="width: 100%">
            <el-option v-for="a in areaOptions" :key="a.id" :value="a.id" :label="a.name" />
          </el-select>
        </el-form-item>

        <el-form-item label="归属渠道" required>
          <el-checkbox-group v-model="skuForm.platforms">
            <el-checkbox v-for="o in SKU_PLATFORM_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-form-item label="是否限量">
          <el-switch v-model="skuForm.isLimited" />
        </el-form-item>
        <el-form-item v-if="skuForm.isLimited" label="库存" required>
          <el-input-number v-model="skuForm.stock" :min="0" :max="999999" :controls="false" style="width: 140px" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="skuDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmSku">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { productApi, scenicApi } from '../../api';
import {
  CARD_TYPE_OPTIONS, CARD_TYPE_LABELS, EFFECTIVE_MODE_OPTIONS, PRODUCT_STATUS_OPTIONS,
  SCENIC_LEVEL_OPTIONS, SKU_PLATFORM_OPTIONS, USER_CHANNEL_LABELS, VALID_TYPE_OPTIONS, VALID_TYPE_LABELS,
} from '../../constants';
import { getRegionNames } from '../../utils/region';
import RegionCascader from '../../components/RegionCascader.vue';
import ImageListUpload from '../../components/ImageListUpload.vue';

const route = useRoute();
const router = useRouter();
const id = route.params.id;
const isEdit = id !== undefined;
const saving = ref(false);
const areaOptions = ref([]);
const regionNames = ref({});

const form = reactive({
  name: '',
  subtitle: '',
  status: 'OFF',
  detailImages: [],
  purchaseNotice: '',
  agreement: '',
  skus: [], // 每条 SKU 独立承载履约配置
});

function parseJson(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s;
  try { return JSON.parse(s) || []; } catch (e) { return []; }
}

onMounted(async () => {
  regionNames.value = await getRegionNames();
  const areaData = await scenicApi.areas({ page: 1, pageSize: 100 });
  areaOptions.value = areaData.list;
  if (isEdit) {
    const p = await productApi.detail(id);
    form.name = p.name;
    form.subtitle = p.subtitle || '';
    form.status = p.status;
    form.detailImages = parseJson(p.detail_images);
    form.purchaseNotice = p.purchase_notice || '';
    form.agreement = p.agreement || '';
    form.skus = (p.skus || []).map(s => ({
      id: s.id,
      cardType: s.card_type,
      durationMonths: s.duration_months,
      useCount: s.use_count,
      validType: s.valid_type,
      effectiveMode: s.effective_mode,
      effectiveAt: s.effective_at || null,
      autoInvalid: s.auto_invalid === 1,
      regions: parseJson(s.regions),
      scopeType: s.scope_type,
      scopeLevels: parseJson(s.scope_levels),
      scopeScenicIds: parseJson(s.scope_scenic_ids).map(Number),
      platforms: parseJson(s.platforms),
      stock: s.stock,
    }));
  }
});

// ---------- SKU 弹窗 ----------
const skuDialogVisible = ref(false);
const skuEditIndex = ref(-1);
const skuForm = reactive({
  id: null, cardType: 'DURATION', durationMonths: 3, useCount: 10, validType: 'D365',
  effectiveMode: 'IMMEDIATE', effectiveAt: null, autoInvalid: true,
  regionsMode: 'NATIONWIDE', regionCodes: [], scopeType: 'LEVEL', scopeLevels: [], scopeScenicIds: [],
  platforms: ['MINI_PROGRAM'], isLimited: false, stock: null,
});

// 时长卡有效期预设：三个月 / 六个月 / 一年 / 永久（历史数据里的其他规格动态补入选项）
const DURATION_PRESETS = [
  { value: 3, label: '季卡（3个月）' },
  { value: 6, label: '半年卡（6个月）' },
  { value: 12, label: '年卡（12个月）' },
  { value: 0, label: '永久卡（永久有效）' },
];
const durationSpecOptions = ref([...DURATION_PRESETS]);

function openSkuDialog(row, index) {
  skuEditIndex.value = row ? index : -1;
  Object.assign(skuForm, {
    id: null, cardType: 'DURATION', durationMonths: 3, useCount: 10, validType: 'D365',
    effectiveMode: 'IMMEDIATE', effectiveAt: null, autoInvalid: true,
    regionsMode: 'NATIONWIDE', regionCodes: [], scopeType: 'LEVEL', scopeLevels: [], scopeScenicIds: [],
    platforms: ['MINI_PROGRAM'], isLimited: false, stock: null,
  }, row ? {
    id: row.id, cardType: row.cardType,
    durationMonths: row.durationMonths, useCount: row.useCount, validType: row.validType,
    effectiveMode: row.effectiveMode, effectiveAt: row.effectiveAt, autoInvalid: row.autoInvalid,
    regionsMode: row.regions.includes('NATIONWIDE') || !row.regions.length ? 'NATIONWIDE' : 'SPECIFY',
    regionCodes: row.regions.includes('NATIONWIDE') || !row.regions.length ? [] : [...row.regions],
    scopeType: row.scopeType, scopeLevels: [...row.scopeLevels], scopeScenicIds: [...row.scopeScenicIds],
    platforms: [...row.platforms],
    isLimited: row.stock != null, stock: row.stock,
  } : {});
  if (skuForm.cardType === 'DURATION') ensureDurationOption(skuForm.durationMonths);
  skuDialogVisible.value = true;
}

function onCardTypeChange() {
  if (skuForm.cardType === 'DURATION') ensureDurationOption(skuForm.durationMonths);
}

function ensureDurationOption(current) {
  if (current == null || current === '') return;
  if (!durationSpecOptions.value.some(o => o.value === Number(current))) {
    durationSpecOptions.value = [...DURATION_PRESETS, { value: Number(current), label: `${current}个月` }];
  }
}

function confirmSku() {
  const spec = skuForm.cardType === 'DURATION' ? skuForm.durationMonths : skuForm.useCount;
  if (spec === null || spec === undefined || spec === '') return ElMessage.warning(skuForm.cardType === 'DURATION' ? '请选择 SKU 有效期' : '请输入次卡次数');
  if (skuForm.effectiveMode === 'SPECIFIED' && !skuForm.effectiveAt) return ElMessage.warning('请选择 SKU 指定生效时间');
  if (skuForm.regionsMode === 'SPECIFY' && !skuForm.regionCodes.length) return ElMessage.warning('请选择 SKU 指定省市');
  if (skuForm.scopeType === 'LEVEL' && !skuForm.scopeLevels.length) return ElMessage.warning('请勾选 SKU 可用景区级别');
  if (skuForm.scopeType === 'SCENIC' && !skuForm.scopeScenicIds.length) return ElMessage.warning('请选择 SKU 指定可用景区');
  if (!skuForm.platforms.length) return ElMessage.warning('请选择 SKU 归属渠道');
  if (skuForm.isLimited && (skuForm.stock == null || skuForm.stock < 0)) return ElMessage.warning('请输入 SKU 库存');
  const item = {
    id: skuForm.id || null,
    cardType: skuForm.cardType,
    durationMonths: skuForm.cardType === 'DURATION' ? skuForm.durationMonths : null,
    useCount: skuForm.cardType === 'COUNT' ? skuForm.useCount : null,
    validType: skuForm.validType,
    effectiveMode: skuForm.effectiveMode,
    effectiveAt: skuForm.effectiveMode === 'SPECIFIED' ? skuForm.effectiveAt : null,
    autoInvalid: skuForm.autoInvalid,
    regions: skuForm.regionsMode === 'NATIONWIDE' ? ['NATIONWIDE'] : [...skuForm.regionCodes],
    scopeType: skuForm.scopeType,
    scopeLevels: skuForm.scopeType === 'LEVEL' ? [...skuForm.scopeLevels] : [],
    scopeScenicIds: skuForm.scopeType === 'SCENIC' ? [...skuForm.scopeScenicIds] : [],
    platforms: [...skuForm.platforms],
    stock: skuForm.isLimited ? skuForm.stock : null,
  };
  // 同配置去重（与后端规则一致：卡类型 + 规格 + 权益范围 + 地理范围）
  const key = skuDedupeKey(item);
  const dup = form.skus.some((s, i) => i !== skuEditIndex.value && skuDedupeKey(s) === key);
  if (dup) return ElMessage.warning('SKU 配置重复：同卡类型、规格、使用范围的 SKU 只能配置一条');
  if (skuEditIndex.value >= 0) form.skus[skuEditIndex.value] = item;
  else form.skus.push(item);
  skuDialogVisible.value = false;
}

function skuDedupeKey(s) {
  const spec = s.cardType === 'DURATION' ? s.durationMonths : s.useCount;
  const scopeKey = s.scopeType === 'SCENIC'
    ? `SCENIC:${[...s.scopeScenicIds].sort((a, b) => a - b).join(',')}`
    : `LEVEL:${[...s.scopeLevels].sort().join(',')}`;
  const regionKey = s.regions.includes('NATIONWIDE') ? 'NATIONWIDE' : [...s.regions].sort().join(',');
  return [s.cardType, spec, scopeKey, regionKey].join('|');
}

// ---------- 展示 ----------
function skuDisplayName(s) {
  if (s.cardType === 'COUNT') return `${s.useCount}次卡`;
  return ({ 1: '月卡', 3: '季卡', 6: '半年卡', 12: '年卡', 0: '永久卡' }[s.durationMonths]) || `${s.durationMonths}个月卡`;
}
function skuBenefitText(s) {
  if (s.cardType === 'COUNT') return `${s.useCount} 次 · ${VALID_TYPE_LABELS[s.validType] || s.validType}`;
  return s.durationMonths === 0 ? '永久有效' : `${s.durationMonths} 个月`;
}
function regionText(regions) {
  const arr = Array.isArray(regions) ? regions : parseJson(regions);
  if (!arr.length || arr.includes('NATIONWIDE')) return '全国';
  return arr.map(c => regionNames.value[c] || c).join('、');
}
function scopeText(s) {
  if (s.scopeType === 'SCENIC') return `指定景区：${s.scopeScenicIds.map(i => areaById(i)?.name || `#${i}`).join('、')}`;
  return `${s.scopeLevels.join('、') || '-'} 级景区`;
}
function areaById(scenicId) {
  return areaOptions.value.find(a => a.id === scenicId);
}

// ---------- 保存 ----------
async function save() {
  if (!form.name) return ElMessage.warning('请输入卡名称');
  if (!form.skus.length) return ElMessage.warning('请至少配置一个 SKU');
  const body = {
    name: form.name,
    subtitle: form.subtitle,
    detailImages: form.detailImages,
    purchaseNotice: form.purchaseNotice,
    agreement: form.agreement,
    status: form.status,
    skus: form.skus.map(s => ({
      id: s.id || undefined,
      cardType: s.cardType,
      durationMonths: s.durationMonths,
      useCount: s.useCount,
      validType: s.validType,
      effectiveMode: s.effectiveMode,
      effectiveAt: s.effectiveMode === 'SPECIFIED' ? s.effectiveAt : null,
      autoInvalid: s.autoInvalid,
      regions: s.regions,
      scopeType: s.scopeType,
      scopeLevels: s.scopeLevels,
      scopeScenicIds: s.scopeScenicIds,
      platforms: s.platforms,
      stock: s.stock,
    })),
  };
  saving.value = true;
  try {
    if (isEdit) {
      await productApi.update(id, body);
      ElMessage.success('已保存');
    } else {
      await productApi.create(body);
      ElMessage.success('已创建');
    }
    router.back();
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.head { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; }
.title { font-size: 16px; font-weight: 600; }
.form { margin-top: 8px; }
.block { width: 100%; margin-top: 6px; }
.sku-table { width: 100%; margin-top: 10px; }
.sku-tip { margin-bottom: 10px; }
.dim { color: #909399; font-size: 12px; }
.footer-bar { margin-top: 16px; padding-top: 12px; border-top: 1px solid #ebeef5; }
</style>
