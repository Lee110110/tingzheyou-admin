<template>
  <div>
    <el-card class="page-card" shadow="never">
      <div class="filter-bar">
        <el-input v-model="query.keyword" placeholder="方案名称" clearable @keyup.enter="search" />
        <el-select v-model="query.audience" placeholder="适用人群" clearable style="width: 120px">
          <el-option v-for="o in PLAN_AUDIENCE_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-select v-model="query.channel" placeholder="渠道" clearable style="width: 120px">
          <el-option v-for="o in PLAN_CHANNEL_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-select v-model="query.status" placeholder="状态" clearable style="width: 110px">
          <el-option v-for="o in PLAN_STATUS_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div style="flex: 1" />
        <el-button @click="resolveVisible = true">命中测试</el-button>
        <el-button type="primary" @click="openDialog()">新建方案</el-button>
      </div>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" element-loading-text="数据加载中" :data="list" empty-text="暂无数据">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="方案" min-width="200">
          <template #default="{ row }">
            <div class="name">
              {{ row.name }}
              <el-tag v-if="row.expired" type="info" size="small">已过期</el-tag>
            </div>
            <div class="dim">
              <el-tag size="small" :type="row.audience === 'ALL' ? 'info' : 'warning'">{{ PLAN_AUDIENCE_LABELS[row.audience] || row.audience }}</el-tag>
              <el-tag size="small" style="margin-left: 4px">{{ PLAN_CHANNEL_LABELS[row.channel] || row.channel }}</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="优先级" width="90">
          <template #default="{ row }">
            <el-tag :type="row.priority >= 100 ? 'danger' : row.priority >= 50 ? 'warning' : 'info'" size="small">{{ row.priority }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="绑定 SKU" min-width="240">
          <template #default="{ row }">
            <div v-for="it in row.items" :key="it.skuId" class="sku-item">
              <span class="dim">{{ it.productName }} / {{ it.skuName }}</span>
              <span class="money">¥{{ (it.salePrice / 100).toFixed(2) }}</span>
              <span class="dim line-through">¥{{ (it.originalPrice / 100).toFixed(2) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="生效周期" width="210">
          <template #default="{ row }">
            <div>{{ row.start_at }}</div>
            <div class="dim">至 {{ row.end_at || '长期有效' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'ENABLED' ? 'success' : 'info'">{{ PLAN_STATUS_LABELS[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_by" label="创建人" width="100" />
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="row.expired" @click="openDialog(row)">编辑</el-button>
            <el-button
              v-if="row.status === 'ENABLED'" link type="warning" :disabled="row.expired"
              @click="toggleStatus(row, 'DISABLED')"
            >停用</el-button>
            <el-button
              v-else link type="success" :disabled="row.expired"
              @click="toggleStatus(row, 'ENABLED')"
            >启用</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          :page-size="PAGE_SIZE"
          :total="total"
          layout="total, prev, pager, next, jumper"
          @current-change="load"
        />
      </div>
    </el-card>

    <!-- 新建 / 编辑方案（新建默认停用，手动启用后参与价格匹配） -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑定价方案' : '新建定价方案'" width="780px" :close-on-click-modal="false">
      <el-alert
        type="info" :closable="false" show-icon style="margin-bottom: 14px"
        :title="form.id ? '命中规则：优先级大的优先 → 渠道精确 > 全部渠道 → 创建时间新的优先' : '新建方案默认为停用状态，保存后需手动启用才参与价格匹配'"
      />
      <el-form label-width="100px">
        <el-row>
          <el-col :span="12">
            <el-form-item label="方案名称" required>
              <el-input v-model="form.name" placeholder="如：双11大促" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="优先级" required>
              <el-input-number v-model="form.priority" :min="0" :max="999" :controls="false" style="width: 120px" />
              <span class="dim" style="margin-left: 8px">0-999，数值越大命中优先级越高</span>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
            <el-form-item label="适用人群" required>
              <el-select v-model="form.audience" style="width: 100%">
                <el-option v-for="o in PLAN_AUDIENCE_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="适用渠道" required>
              <el-select v-model="form.channel" style="width: 100%">
                <el-option v-for="o in PLAN_CHANNEL_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
              </el-select>
              <div class="dim" style="width: 100%">仅作价格匹配条件，不能超出 SKU 的可售卖渠道范围</div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
            <el-form-item label="上线时间" required>
              <el-date-picker v-model="form.startAt" type="datetime" placeholder="上线时间" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="长期有效">
              <el-switch v-model="form.isPermanent" />
            </el-form-item>
            <el-form-item v-if="!form.isPermanent" label="失效时间" required>
              <el-date-picker v-model="form.endAt" type="datetime" placeholder="失效时间" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="定价 SKU" required>
          <div class="sku-picker">
            <el-select v-model="pickerProductId" filterable placeholder="选择商品载入 SKU" style="width: 220px" @change="loadProductSkus">
              <el-option v-for="p in productOptions" :key="p.id" :value="p.id" :label="p.name" />
            </el-select>
            <el-button style="margin-left: 8px" :disabled="!pickerSkus.length" @click="toggleSelectAllCurrent">全选本商品</el-button>
            <el-button type="primary" plain style="margin-left: 8px" :disabled="!pendingSkus.length" @click="addPickedSkus">
              添加已选（{{ pendingSkus.length }}）
            </el-button>
            <el-button v-if="pendingSkus.length" link type="danger" style="margin-left: 8px" @click="clearPicked">清空已选</el-button>
          </div>
          <el-table
            v-if="pickerSkus.length" ref="pickerTable" :data="pickerSkus" size="small" style="margin-top: 8px"
            @selection-change="sel => (pickerSelected = sel)"
          >
            <el-table-column type="selection" width="40" />
            <el-table-column prop="name" label="SKU" min-width="100" />
            <el-table-column label="卡类型" width="80">
              <template #default="{ row }">{{ row.card_type === 'COUNT' ? '次卡' : '时长卡' }}</template>
            </el-table-column>
            <el-table-column label="可售卖渠道" min-width="140">
              <template #default="{ row }">{{ parsePlatforms(row.platforms).map(p => PLAN_CHANNEL_LABELS[p] || p).join('、') || '-' }}</template>
            </el-table-column>
          </el-table>
          <div v-if="pendingSkus.length" class="dim" style="margin-top: 6px">
            待添加 {{ pendingSkus.length }} 个 SKU（切换商品勾选会保留，已在清单中的自动跳过）
          </div>
        </el-form-item>

        <el-form-item v-if="form.items.length" label=" ">
          <div class="batch-bar">
            <span class="dim">批量设置：</span>
            <span class="dim">原价</span>
            <PriceInput v-model="batchOriginal" />
            <span class="dim" style="margin-left: 8px">售价</span>
            <PriceInput v-model="batchSale" />
            <el-button size="small" type="primary" plain style="margin-left: 12px" @click="applyBatchPrice(form.items)">应用到全部</el-button>
            <el-button size="small" :disabled="!itemSelected.length" @click="applyBatchPrice(itemSelected)">
              应用到选中（{{ itemSelected.length }}）
            </el-button>
            <el-button size="small" @click="clearItemPrices">清空价格</el-button>
          </div>
          <el-table
            :data="form.items" size="small" style="width: 100%; margin-top: 4px"
            @selection-change="sel => (itemSelected = sel)"
          >
            <el-table-column type="selection" width="40" />
            <el-table-column label="商品" min-width="140">
              <template #default="{ row }">{{ row.productName }}</template>
            </el-table-column>
            <el-table-column prop="skuName" label="SKU" min-width="90" />
            <el-table-column label="划线原价（元）" width="170">
              <template #default="{ row }">
                <PriceInput v-model="row.originalPrice" />
              </template>
            </el-table-column>
            <el-table-column label="售卖价（元）" width="170">
              <template #default="{ row }">
                <PriceInput v-model="row.salePrice" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="70">
              <template #default="{ $index }">
                <el-button link type="danger" @click="form.items.splice($index, 1)">移除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 命中测试 -->
    <el-dialog v-model="resolveVisible" title="定价命中测试" width="560px">
      <el-form label-width="100px">
        <el-form-item label="商品">
          <el-select v-model="resolve.productId" filterable style="width: 100%" @change="onResolveProductChange">
            <el-option v-for="p in productOptions" :key="p.id" :value="p.id" :label="p.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="SKU">
          <el-select v-model="resolve.skuId" style="width: 100%">
            <el-option v-for="s in resolveSkus" :key="s.id" :value="s.id" :label="s.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="渠道">
          <el-select v-model="resolve.channel" style="width: 100%">
            <el-option v-for="o in PLAN_CHANNEL_OPTIONS.filter(o => o.value !== 'ALL')" :key="o.value" :value="o.value" :label="o.label" />
          </el-select>
        </el-form-item>
        <el-form-item label="适用人群">
          <el-select v-model="resolve.audience" style="width: 100%">
            <el-option v-for="o in PLAN_AUDIENCE_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
          </el-select>
        </el-form-item>
        <el-form-item label=" ">
          <el-button type="primary" :loading="resolving" @click="runResolve">测试命中</el-button>
        </el-form-item>
      </el-form>
      <el-descriptions v-if="resolveResult" :column="1" border>
        <el-descriptions-item label="命中方案">{{ resolveResult.planName }}</el-descriptions-item>
        <el-descriptions-item label="优先级">{{ resolveResult.planPriority ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="售卖价">
          <span class="money">¥{{ ((resolveResult.salePrice ?? 0) / 100).toFixed(2) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="划线原价">¥{{ ((resolveResult.originalPrice || 0) / 100).toFixed(2) }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import { pricingApi, productApi } from '../../api';
import {
  PLAN_AUDIENCE_OPTIONS, PLAN_AUDIENCE_LABELS, PLAN_CHANNEL_OPTIONS, PLAN_CHANNEL_LABELS,
  PLAN_STATUS_OPTIONS, PLAN_STATUS_LABELS, PAGE_SIZE,
} from '../../constants';
import PriceInput from '../../components/PriceInput.vue';

const loading = ref(false);
const list = ref([]);
const total = ref(0);
const page = ref(1);
const query = reactive({ keyword: '', audience: '', channel: '', status: '' });

const productOptions = ref([]);

const dialogVisible = ref(false);
const saving = ref(false);
const form = reactive({
  id: null, name: '', priority: 0, audience: 'ALL', channel: 'ALL',
  startAt: null, endAt: null, isPermanent: false, items: [],
});
const pickerProductId = ref('');
const pickerSkus = ref([]);
const pickerSelected = ref([]);
const pickerTable = ref(null);
// 跨商品累积勾选：切换商品不清空，添加时统一并入定价清单
const pickedSkus = ref([]); // [{ skuId, skuName, productId, productName }]

// 待添加的 SKU = 累积勾选 ∪ 当前表格勾选（去重，去掉已在清单中的），按钮实时跟随
const pendingSkus = computed(() => {
  const cur = pickerSelected.value.map(s => ({
    skuId: s.id, skuName: s.name, productId: pickerProductId.value || null,
    productName: (productOptions.value.find(p => p.id === pickerProductId.value) || {}).name || '',
  }));
  const map = new Map();
  [...pickedSkus.value, ...cur].forEach(p => {
    if (!map.has(p.skuId)) map.set(p.skuId, p);
  });
  return [...map.values()].filter(p => !form.items.some(it => it.skuId === p.skuId));
});

// 定价清单批量填价
const batchOriginal = ref(null);
const batchSale = ref(null);
const itemSelected = ref([]);

const resolveVisible = ref(false);
const resolving = ref(false);
const resolve = reactive({ productId: '', skuId: '', channel: 'MINI_PROGRAM', audience: 'ALL' });
const resolveSkus = ref([]);
const resolveResult = ref(null);

onMounted(async () => {
  load();
  productOptions.value = await productApi.all('');
});

async function load() {
  loading.value = true;
  try {
    const data = await pricingApi.list({
      page: page.value, pageSize: PAGE_SIZE,
      keyword: query.keyword || '', audience: query.audience || '', channel: query.channel || '', status: query.status || '',
    });
    list.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  load();
}

function reset() {
  query.keyword = '';
  query.audience = '';
  query.channel = '';
  query.status = '';
  search();
}

function parsePlatforms(p) {
  if (!p) return [];
  return Array.isArray(p) ? p : (JSON.parse(p) || []);
}

function openDialog(row) {
  form.id = null;
  form.name = '';
  form.priority = 0;
  form.audience = 'ALL';
  form.channel = 'ALL';
  form.startAt = null;
  form.endAt = null;
  form.isPermanent = false;
  form.items = [];
  pickerProductId.value = '';
  pickerSkus.value = [];
  pickerSelected.value = [];
  pickedSkus.value = [];
  batchOriginal.value = null;
  batchSale.value = null;
  itemSelected.value = [];
  if (row) {
    form.id = row.id;
    form.name = row.name;
    form.priority = row.priority ?? 0;
    form.audience = row.audience || 'ALL';
    form.channel = row.channel;
    form.startAt = row.start_at;
    form.endAt = row.end_at || null;
    form.isPermanent = !row.end_at;
    form.items = row.items.map(it => ({ ...it }));
  }
  dialogVisible.value = true;
}

// 切换商品前，把当前商品的表格勾选并入累积（当前商品以表格勾选为准覆盖）
function commitCurrentSelection() {
  const pid = pickerProductId.value;
  if (!pid) return;
  const others = pickedSkus.value.filter(p => p.productId !== pid);
  const cur = pickerSelected.value
    .filter(s => !others.some(p => p.skuId === s.id))
    .map(s => ({
      skuId: s.id, skuName: s.name, productId: pid,
      productName: (productOptions.value.find(p => p.id === pid) || {}).name || '',
    }));
  pickedSkus.value = [...others, ...cur];
}

async function loadProductSkus(productId) {
  commitCurrentSelection();
  if (!productId) { pickerSkus.value = []; return; }
  const p = await productApi.detail(productId);
  pickerSkus.value = p.skus || [];
}

// 全选 / 取消全选当前商品的 SKU
function toggleSelectAllCurrent() {
  if (!pickerSkus.value.length || !pickerTable.value) return;
  const allSelected = pickerSkus.value.every(s => pickerSelected.value.some(sel => sel.id === s.id));
  pickerSkus.value.forEach(s => pickerTable.value.toggleRowSelection(s, !allSelected));
}

function clearPicked() {
  pickedSkus.value = [];
  if (pickerTable.value) pickerSkus.value.forEach(s => pickerTable.value.toggleRowSelection(s, false));
}

async function addPickedSkus() {
  commitCurrentSelection(); // 未切换商品直接点添加时，先把当前勾选并入
  if (!pickedSkus.value.length) return ElMessage.warning('请先勾选要定价的 SKU');
  const toAdd = pickedSkus.value.filter(p => !form.items.some(it => it.skuId === p.skuId));
  if (!toAdd.length) return ElMessage.warning('勾选的 SKU 均已在定价清单中');
  for (const p of toAdd) {
    form.items.push({
      skuId: p.skuId, skuName: p.skuName, productName: p.productName,
      originalPrice: null, salePrice: null,
    });
  }
  // 冲突提示（批量一次查询）：SKU 已绑定其他启用方案（不阻止保存）
  const boundMap = await pricingApi.skuBoundBatch(toAdd.map(p => p.skuId), form.id || null);
  const conflicts = Object.entries(boundMap || {});
  if (conflicts.length) {
    ElNotification.warning({
      title: '优先级冲突提醒',
      message: conflicts.map(([skuId, names]) => {
        const it = toAdd.find(p => p.skuId === Number(skuId));
        return `SKU「${it ? it.skuName : `#${skuId}`}」已绑定启用中的方案：${names.join('、')}`;
      }).join('；') + '，将按命中规则（优先级 > 渠道精确 > 创建时间）取价',
      duration: 6000,
    });
  }
  clearPicked();
}

// 批量填价：只覆盖已填的一侧（原价/售价），另一侧保留原值；应用后仍可逐行单独修改
function applyBatchPrice(rows) {
  if (batchOriginal.value == null && batchSale.value == null) return ElMessage.warning('请先填写批量设置的原价或售价');
  if (!rows || !rows.length) return ElMessage.warning('没有可应用的 SKU 行');
  rows.forEach(r => {
    if (batchOriginal.value != null) r.originalPrice = batchOriginal.value;
    if (batchSale.value != null) r.salePrice = batchSale.value;
  });
  ElMessage.success(`已批量应用到 ${rows.length} 行`);
}

function clearItemPrices() {
  form.items.forEach(r => { r.originalPrice = null; r.salePrice = null; });
  ElMessage.success('已清空价格，可重新批量设置或逐行填写');
}

async function save() {
  if (!form.name) return ElMessage.warning('请输入方案名称');
  if (!form.startAt) return ElMessage.warning('请选择上线时间');
  if (!form.isPermanent && !form.endAt) return ElMessage.warning('请选择失效时间，或勾选长期有效');
  if (!form.items.length) return ElMessage.warning('请添加要定价的 SKU');
  for (const it of form.items) {
    if (it.originalPrice == null || it.salePrice == null) return ElMessage.warning('请填写完整的划线原价和售卖价');
    if (it.salePrice > it.originalPrice) return ElMessage.warning(`SKU「${it.skuName}」售卖价不能高于划线原价`);
  }
  const body = {
    name: form.name, priority: form.priority ?? 0, audience: form.audience, channel: form.channel,
    startAt: form.startAt, endAt: form.isPermanent ? null : form.endAt,
    items: form.items.map(it => ({ skuId: it.skuId, originalPrice: it.originalPrice, salePrice: it.salePrice })),
  };
  saving.value = true;
  try {
    const data = form.id ? await pricingApi.update(form.id, body) : await pricingApi.create(body);
    // 保存后统一提示冲突（后端返回 warnings，不阻止保存）
    (data.warnings || []).forEach(w => {
      ElNotification.warning({
        title: '优先级冲突提醒',
        message: `SKU「${w.skuName}」同时处于启用方案：${w.planNames.join('、')}，将按命中规则取价`,
        duration: 6000,
      });
    });
    ElMessage.success(form.id ? '已保存' : '已创建（默认停用，启用后参与价格匹配）');
    dialogVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(row, status) {
  await pricingApi.setStatus(row.id, status);
  ElMessage.success(status === 'ENABLED' ? '已启用，参与价格匹配' : '已停用');
  load();
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除方案「${row.name}」？删除后其 SKU 定价立即失效。`, '删除确认', { type: 'warning' });
  } catch (e) { return; }
  await pricingApi.remove(row.id);
  ElMessage.success('已删除');
  if (list.value.length === 1 && page.value > 1) page.value -= 1;
  load();
}

async function onResolveProductChange(productId) {
  resolve.skuId = '';
  resolveResult.value = null;
  if (!productId) { resolveSkus.value = []; return; }
  const p = await productApi.detail(productId);
  resolveSkus.value = p.skus || [];
}

async function runResolve() {
  if (!resolve.skuId) return ElMessage.warning('请选择 SKU');
  resolving.value = true;
  try {
    resolveResult.value = await pricingApi.resolve(resolve.skuId, resolve.channel, resolve.audience);
  } finally {
    resolving.value = false;
  }
}
</script>

<style scoped>
.name { font-weight: 600; display: flex; align-items: center; gap: 6px; }
.dim { color: #909399; font-size: 12px; }
.sku-item { display: flex; gap: 10px; align-items: center; line-height: 22px; }
.line-through { text-decoration: line-through; }
.sku-picker { display: flex; align-items: center; }
.batch-bar { display: flex; align-items: center; gap: 6px; width: 100%; flex-wrap: wrap; margin-bottom: 4px; }
</style>
