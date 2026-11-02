<template>
  <div>
    <el-card class="page-card" shadow="never">
      <div class="head">
        <el-button @click="router.push('/redeem')">← 返回</el-button>
        <span class="title">批次：{{ batch?.name || '...' }}</span>
        <div style="flex: 1" />
        <el-button type="danger" v-if="batch && batch.status === 'ACTIVE'" @click="voidBatch">作废批次</el-button>
        <el-button @click="exportXlsx">导出 Excel</el-button>
      </div>
      <el-descriptions v-if="batch" :column="3" border>
        <el-descriptions-item label="批次ID">{{ batch.id }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="batch.status === 'ACTIVE' ? 'success' : 'danger'">{{ REDEEM_BATCH_STATUS_LABELS[batch.status] }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="关联 SKU">
          {{ batch.sku_id ? `${batch.product_name} / ${batch.sku_name}` : '权益码（未关联 SKU）' }}
        </el-descriptions-item>
        <el-descriptions-item label="生成数量">{{ batch.quantity }}</el-descriptions-item>
        <el-descriptions-item label="已使用">{{ batch.used_count }}</el-descriptions-item>
        <el-descriptions-item label="剩余">{{ batch.remaining }}</el-descriptions-item>
        <el-descriptions-item label="有效期">
          {{ REDEEM_VALID_LABELS[batch.valid_type] }}{{ batch.expire_at ? `（至 ${batch.expire_at}）` : '' }}
        </el-descriptions-item>
        <el-descriptions-item label="使用范围" :span="2">{{ scopeText(batch) }}</el-descriptions-item>
        <el-descriptions-item label="可用级别">{{ levelText(batch) }}</el-descriptions-item>
        <el-descriptions-item label="创建人">{{ batch.created_by }}</el-descriptions-item>
        <el-descriptions-item label="创建时间" :span="2">{{ batch.created_at }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card shadow="never">
      <div class="filter-bar" style="margin-bottom: 12px">
        <el-radio-group v-model="codeStatus" @change="loadCodes">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button v-for="o in CODE_STATUS_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</el-radio-button>
        </el-radio-group>
      </div>
      <el-table v-loading="loading" element-loading-text="数据加载中" :data="codes" empty-text="暂无数据">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="兑换码" width="140">
          <template #default="{ row }">
            <span class="code">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="CODE_STATUS_TAG[row.status]">{{ CODE_STATUS_LABELS[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="使用人" min-width="160">
          <template #default="{ row }">
            <template v-if="row.used_by">
              {{ row.used_by_name || row.used_by }}<span v-if="row.used_by_phone" class="dim">（{{ row.used_by_phone }}）</span>
            </template>
            <span v-else class="dim">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="used_at" label="使用时间" width="170">
          <template #default="{ row }">{{ row.used_at || '-' }}</template>
        </el-table-column>
        <el-table-column prop="created_at" label="生成时间" width="170" />
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          :page-size="PAGE_SIZE"
          :total="total"
          layout="total, prev, pager, next, jumper"
          @current-change="loadCodes"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { redeemApi, scenicApi } from '../../api';
import {
  REDEEM_BATCH_STATUS_LABELS, REDEEM_VALID_LABELS, CODE_STATUS_OPTIONS, CODE_STATUS_LABELS, CODE_STATUS_TAG, PAGE_SIZE,
} from '../../constants';
import { getRegionNames } from '../../utils/region';

const route = useRoute();
const router = useRouter();
const batchId = route.params.id;
const batch = ref(null);
const codes = ref([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const codeStatus = ref('');
const regionNames = ref({});
const areaNames = ref({});

onMounted(async () => {
  regionNames.value = await getRegionNames();
  const areaData = await scenicApi.areas({ page: 1, pageSize: 100 });
  const map = {};
  areaData.list.forEach(a => { map[a.id] = a.name; });
  areaNames.value = map;
  batch.value = await redeemApi.detail(batchId);
  loadCodes();
});

async function loadCodes() {
  loading.value = true;
  try {
    const data = await redeemApi.codes(batchId, {
      page: page.value, pageSize: PAGE_SIZE, status: codeStatus.value || '',
    });
    codes.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function parseJson(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s;
  try { return JSON.parse(s) || []; } catch (e) { return []; }
}

function scopeText(b) {
  const scenicIds = parseJson(b.scenic_ids).map(Number);
  if (scenicIds.length) return `指定景区：${scenicIds.map(id => areaNames.value[id] || `#${id}`).join('、')}`;
  return regionText(b.regions);
}

function regionText(regions) {
  const arr = parseJson(regions);
  if (!arr.length || arr.includes('NATIONWIDE')) return '全国';
  return arr.map(c => regionNames.value[c] || c).join('、');
}

function levelText(b) {
  if (parseJson(b.scenic_ids).length) return '—';
  const arr = parseJson(b.levels);
  if (!arr.length || arr.includes('ALL')) return '全部级别';
  return arr.join('、');
}

async function voidBatch() {
  try {
    await ElMessageBox.confirm(
      `确定作废批次「${batch.value.name}」？未使用的兑换码将全部作废，已使用的不受影响。`,
      '作废确认', { type: 'warning' }
    );
  } catch (e) { return; }
  await redeemApi.void(batchId);
  ElMessage.success('已作废');
  batch.value = await redeemApi.detail(batchId);
  loadCodes();
}

function exportXlsx() {
  redeemApi.exportCodes(batchId);
}
</script>

<style scoped>
.head { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
.title { font-size: 16px; font-weight: 600; }
.code { font-family: Consolas, Menlo, monospace; font-weight: 700; letter-spacing: 1px; }
</style>
