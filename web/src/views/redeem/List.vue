<template>
  <div>
    <el-card class="page-card" shadow="never">
      <div class="filter-bar">
        <el-input v-model="query.keyword" placeholder="批次名称 / 批次ID" clearable @keyup.enter="search" />
        <el-select v-model="query.status" placeholder="状态" clearable style="width: 120px">
          <el-option v-for="o in REDEEM_BATCH_STATUS_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div style="flex: 1" />
        <el-button type="primary" @click="openDialog">生成兑换码</el-button>
      </div>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" element-loading-text="数据加载中" :data="list" empty-text="暂无数据">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="批次" min-width="220">
          <template #default="{ row }">
            <div class="name">
              {{ row.name }}
              <el-tag v-if="row.expired" type="info" size="small">已过期</el-tag>
              <el-tag v-if="row.status === 'VOID'" type="danger" size="small">已作废</el-tag>
            </div>
            <div class="dim">{{ row.product_name ? `${row.product_name} / ${row.sku_name}` : '权益码（未关联 SKU）' }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="quantity" label="生成数量" width="90" />
        <el-table-column prop="used_count" label="已使用" width="80" />
        <el-table-column label="剩余" width="80">
          <template #default="{ row }">{{ row.remaining }}</template>
        </el-table-column>
        <el-table-column label="有效期" width="170">
          <template #default="{ row }">
            <div>{{ REDEEM_VALID_LABELS[row.valid_type] || row.valid_type }}</div>
            <div v-if="row.expire_at" class="dim">至 {{ row.expire_at }}</div>
          </template>
        </el-table-column>
        <el-table-column label="使用范围" width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ scopeText(row) }}</template>
        </el-table-column>
        <el-table-column label="可用级别" width="100">
          <template #default="{ row }">{{ levelText(row) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'">{{ REDEEM_BATCH_STATUS_LABELS[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_by" label="创建人" width="90" />
        <el-table-column prop="created_at" label="创建时间" width="160" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push(`/redeem/${row.id}`)">批次详情</el-button>
            <el-button v-if="row.status === 'ACTIVE'" link type="danger" @click="voidBatch(row)">作废</el-button>
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

    <el-dialog v-model="dialogVisible" title="生成兑换码批次" width="640px" :close-on-click-modal="false">
      <el-form label-width="110px">
        <el-form-item label="批次名称" required>
          <el-input v-model="form.name" placeholder="如：五一渠道推广码" />
        </el-form-item>
        <el-form-item label="生成数量" required>
          <el-input-number v-model="form.quantity" :min="1" :max="5000" />
          <span class="dim" style="margin-left: 8px">1 - 5000 张</span>
        </el-form-item>
        <el-form-item label="有效期" required>
          <el-select v-model="form.validType" style="width: 200px">
            <el-option v-for="o in REDEEM_VALID_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
          </el-select>
        </el-form-item>
        <el-form-item label="使用范围">
          <el-radio-group v-model="form.scopeMode">
            <el-radio value="NATIONWIDE">全国</el-radio>
            <el-radio value="SPECIFY">指定省市</el-radio>
            <el-radio value="SCENIC">指定景区</el-radio>
          </el-radio-group>
          <RegionCascader v-if="form.scopeMode === 'SPECIFY'" v-model="form.regionCodes" multiple class="block" />
          <el-select
            v-if="form.scopeMode === 'SCENIC'"
            v-model="form.scenicIds"
            multiple
            filterable
            placeholder="可搜索选择多个景区"
            class="block"
          >
            <el-option v-for="a in areaOptions" :key="a.id" :value="a.id" :label="a.name" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.scopeMode !== 'SCENIC'" label="可用级别">
          <el-radio-group v-model="form.levelsMode">
            <el-radio value="ALL">全部级别</el-radio>
            <el-radio value="SPECIFY">指定级别</el-radio>
          </el-radio-group>
          <el-checkbox-group v-if="form.levelsMode === 'SPECIFY'" v-model="form.levelValues" class="block">
            <el-checkbox v-for="o in SCENIC_LEVEL_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-alert
          type="info"
          :closable="false"
          title="兑换码无需关联 SKU：兑换成功后，会员权益（使用范围、可用级别、有效期）以本批次设置为准"
        />
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">生成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { redeemApi, scenicApi } from '../../api';
import {
  REDEEM_BATCH_STATUS_OPTIONS, REDEEM_BATCH_STATUS_LABELS, REDEEM_VALID_OPTIONS, REDEEM_VALID_LABELS,
  SCENIC_LEVEL_OPTIONS, PAGE_SIZE,
} from '../../constants';
import RegionCascader from '../../components/RegionCascader.vue';
import { getRegionNames } from '../../utils/region';

const router = useRouter();
const loading = ref(false);
const list = ref([]);
const total = ref(0);
const page = ref(1);
const query = reactive({ keyword: '', status: '' });
const regionNames = ref({});
const areaOptions = ref([]);
const areaNames = ref({});

const dialogVisible = ref(false);
const saving = ref(false);
const form = reactive({
  name: '', quantity: 100, validType: 'M6',
  scopeMode: 'NATIONWIDE', regionCodes: [], scenicIds: [], levelsMode: 'ALL', levelValues: [],
});

onMounted(async () => {
  load();
  regionNames.value = await getRegionNames();
  const areaData = await scenicApi.areas({ page: 1, pageSize: 100 });
  areaOptions.value = areaData.list;
  const map = {};
  areaData.list.forEach(a => { map[a.id] = a.name; });
  areaNames.value = map;
});

function parseJson(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s;
  try { return JSON.parse(s) || []; } catch (e) { return []; }
}

function scopeText(row) {
  const scenicIds = parseJson(row.scenic_ids).map(Number);
  if (scenicIds.length) return `指定景区：${scenicIds.map(id => areaNames.value[id] || `#${id}`).join('、')}`;
  return regionText(row.regions);
}

function regionText(regions) {
  const arr = parseJson(regions);
  if (!arr.length || arr.includes('NATIONWIDE')) return '全国';
  return arr.map(c => regionNames.value[c] || c).join('、');
}

function levelText(row) {
  if (parseJson(row.scenic_ids).length) return '—';
  const arr = parseJson(row.levels);
  if (!arr.length || arr.includes('ALL')) return '全部级别';
  return arr.join('、');
}

async function load() {
  loading.value = true;
  try {
    const data = await redeemApi.list({
      page: page.value, pageSize: PAGE_SIZE,
      keyword: query.keyword || '', status: query.status || '',
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
  query.status = '';
  search();
}

function openDialog() {
  form.name = '';
  form.quantity = 100;
  form.validType = 'M6';
  form.scopeMode = 'NATIONWIDE';
  form.regionCodes = [];
  form.scenicIds = [];
  form.levelsMode = 'ALL';
  form.levelValues = [];
  dialogVisible.value = true;
}

async function save() {
  if (!form.name) return ElMessage.warning('请输入批次名称');
  if (form.scopeMode === 'SPECIFY' && !form.regionCodes.length) return ElMessage.warning('请选择指定省市');
  if (form.scopeMode === 'SCENIC' && !form.scenicIds.length) return ElMessage.warning('请选择指定景区');
  if (form.scopeMode !== 'SCENIC' && form.levelsMode === 'SPECIFY' && !form.levelValues.length) {
    return ElMessage.warning('请勾选可用级别');
  }
  saving.value = true;
  try {
    const batch = await redeemApi.create({
      name: form.name,
      quantity: form.quantity,
      validType: form.validType,
      regions: form.scopeMode === 'SPECIFY' ? form.regionCodes : ['NATIONWIDE'],
      scenicIds: form.scopeMode === 'SCENIC' ? form.scenicIds : [],
      levels: form.scopeMode === 'SCENIC' ? [] : (form.levelsMode === 'ALL' ? ['ALL'] : form.levelValues),
    });
    ElMessage.success(`已生成 ${form.quantity} 张兑换码`);
    dialogVisible.value = false;
    router.push(`/redeem/${batch.id}`);
  } finally {
    saving.value = false;
  }
}

async function voidBatch(row) {
  try {
    await ElMessageBox.confirm(
      `确定作废批次「${row.name}」？未使用的 ${row.remaining} 张兑换码将全部作废，已使用的兑换码与对应会员不受影响。`,
      '作废确认', { type: 'warning' }
    );
  } catch (e) { return; }
  await redeemApi.void(row.id);
  ElMessage.success('已作废');
  load();
}
</script>

<style scoped>
.name { font-weight: 600; display: flex; align-items: center; gap: 6px; }
.block { width: 100%; margin-top: 6px; display: block; }
</style>
