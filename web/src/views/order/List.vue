<template>
  <div>
    <el-card class="page-card" shadow="never">
      <div class="filter-bar">
        <el-input v-model="query.orderNo" placeholder="订单号" clearable @keyup.enter="search" />
        <el-input v-model="query.userId" placeholder="用户ID" clearable style="width: 120px" @keyup.enter="search" />
        <el-input v-model="query.phone" placeholder="用户手机号" clearable @keyup.enter="search" />
        <el-select v-model="query.payStatus" multiple collapse-tags placeholder="支付状态" clearable style="width: 150px">
          <el-option v-for="o in PAY_STATUS_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-select v-model="query.channel" multiple collapse-tags placeholder="渠道" clearable style="width: 150px">
          <el-option v-for="o in USER_CHANNEL_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-select v-model="query.productId" placeholder="商品" clearable filterable style="width: 180px" @change="onProductChange">
          <el-option v-for="p in productOptions" :key="p.id" :value="p.id" :label="p.name" />
        </el-select>
        <el-select v-model="query.skuId" placeholder="SKU" clearable filterable style="width: 130px" :disabled="!query.productId">
          <el-option v-for="s in skuOptions" :key="s.id" :value="s.id" :label="s.name" />
        </el-select>
        <el-date-picker
          v-model="query.range"
          type="daterange"
          value-format="YYYY-MM-DD"
          start-placeholder="下单开始"
          end-placeholder="下单结束"
        />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div style="flex: 1" />
        <el-button :loading="exporting" @click="exportXlsx">导出</el-button>
      </div>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" element-loading-text="数据加载中" :data="list" empty-text="暂无数据">
        <el-table-column prop="order_no" label="订单号" width="200">
          <template #default="{ row }">
            <el-link type="primary" @click="router.push(`/order/${row.id}`)">{{ row.order_no }}</el-link>
          </template>
        </el-table-column>
        <el-table-column label="用户" min-width="120">
          <template #default="{ row }">{{ row.user_nickname || row.user_id }}</template>
        </el-table-column>
        <el-table-column label="手机号" width="130">
          <template #default="{ row }">{{ row.user_phone || '-' }}</template>
        </el-table-column>
        <el-table-column label="订单项" min-width="120">
          <template #default="{ row }">{{ row.sku_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="原价" width="100">
          <template #default="{ row }">
            <span class="dim">¥{{ (row.original_price / 100).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="实付" width="110">
          <template #default="{ row }">
            <span class="money">¥{{ (row.pay_amount / 100).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="支付方式" width="100">
          <template #default="{ row }">
            {{ row.pay_method ? (PAY_METHOD_LABELS[row.pay_method] || row.pay_method) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="订单状态" width="170">
          <template #default="{ row }">
            <template v-if="row.close_type">
              <el-tag type="info">已关闭（{{ CLOSE_TYPE_LABELS[row.close_type] || row.close_type }}）</el-tag>
            </template>
            <template v-else>
              <el-tag :type="PAY_STATUS_TAG[row.pay_status]">{{ PAY_STATUS_LABELS[row.pay_status] || row.pay_status }}</el-tag>
              <span v-if="row.pay_status !== 'UNPAID' && row.pay_status !== 'PAY_FAILED' && row.fulfill_status !== 'NONE'" class="dim">
                / {{ FULFILL_STATUS_LABELS[row.fulfill_status] }}
              </span>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="渠道" width="90">
          <template #default="{ row }">{{ USER_CHANNEL_LABELS[row.channel] || row.channel }}</template>
        </el-table-column>
        <el-table-column prop="created_at" label="下单时间" width="160" />
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push(`/order/${row.id}`)">详情</el-button>
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
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { orderApi, productApi } from '../../api';
import {
  PAY_STATUS_OPTIONS, PAY_STATUS_LABELS, PAY_STATUS_TAG,
  FULFILL_STATUS_LABELS, CLOSE_TYPE_LABELS, PAY_METHOD_LABELS, USER_CHANNEL_OPTIONS, USER_CHANNEL_LABELS, PAGE_SIZE,
} from '../../constants';

const router = useRouter();
const loading = ref(false);
const exporting = ref(false);
const list = ref([]);
const total = ref(0);
const page = ref(1);
const query = reactive({
  orderNo: '', userId: '', phone: '', payStatus: [], channel: [], productId: '', skuId: '', range: null,
});
const productOptions = ref([]);
const skuOptions = ref([]);

onMounted(async () => {
  load();
  productOptions.value = await productApi.all('');
});

function buildParams() {
  return {
    page: page.value, pageSize: PAGE_SIZE,
    orderNo: query.orderNo || '', userId: query.userId || '', phone: query.phone || '',
    payStatus: query.payStatus.length ? query.payStatus : '', channel: query.channel.length ? query.channel : '',
    productId: query.productId || '', skuId: query.skuId || '',
    startTime: (query.range && query.range[0]) || '', endTime: (query.range && query.range[1]) || '',
  };
}

async function load() {
  loading.value = true;
  try {
    const data = await orderApi.list(buildParams());
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
  query.orderNo = '';
  query.userId = '';
  query.phone = '';
  query.payStatus = [];
  query.channel = [];
  query.productId = '';
  query.skuId = '';
  query.range = null;
  skuOptions.value = [];
  search();
}

async function onProductChange(productId) {
  query.skuId = '';
  if (!productId) { skuOptions.value = []; return; }
  const p = await productApi.detail(productId);
  skuOptions.value = p.skus || [];
}

async function exportXlsx() {
  exporting.value = true;
  try {
    await orderApi.export(buildParams());
  } finally {
    exporting.value = false;
  }
}
</script>
