<template>
  <div v-if="profile">
    <el-card class="page-card" shadow="never">
      <div class="head">
        <el-button @click="router.back()">← 返回</el-button>
        <span class="title">用户：{{ profile.nickname || profile.id }}</span>
      </div>
      <el-descriptions :column="3" border>
        <el-descriptions-item label="头像">
          <el-avatar :size="44" :src="profile.avatar || undefined" />
        </el-descriptions-item>
        <el-descriptions-item label="用户ID">{{ profile.id }}</el-descriptions-item>
        <el-descriptions-item label="昵称">{{ profile.nickname || '-' }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ profile.phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="注册渠道">{{ USER_CHANNEL_LABELS[profile.channel] || profile.channel }}</el-descriptions-item>
        <el-descriptions-item label="注册时间">{{ profile.registered_at }}</el-descriptions-item>
        <el-descriptions-item label="最近登录">{{ profile.last_login_at || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card shadow="never">
      <el-tabs v-model="tab" @tab-change="onTabChange">
        <el-tab-pane label="会员权益" name="membership">
          <h4>生效中</h4>
          <el-table :data="activeMemberships" empty-text="暂无数据" size="small">
            <el-table-column label="商品 / SKU" min-width="180">
              <template #default="{ row }">{{ row.product_name ? `${row.product_name} / ${row.sku_name}` : '权益兑换' }}</template>
            </el-table-column>
            <el-table-column label="来源" width="80">
              <template #default="{ row }">{{ MEMBERSHIP_SOURCE_LABELS[row.source] || row.source }}</template>
            </el-table-column>
            <el-table-column label="有效期" width="200">
              <template #default="{ row }">
                {{ row.start_at }} 至 {{ row.end_at || '永久' }}
              </template>
            </el-table-column>
            <el-table-column label="剩余次数" width="90">
              <template #default="{ row }">{{ row.remaining_count != null ? row.remaining_count + ' 次' : '-' }}</template>
            </el-table-column>
            <el-table-column label="权益范围" min-width="160">
              <template #default="{ row }">{{ scopeText(row) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="MEMBERSHIP_STATUS_TAG[row.status]">{{ MEMBERSHIP_STATUS_LABELS[row.status] }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
          <h4>历史记录</h4>
          <el-table :data="historyMemberships" empty-text="暂无数据" size="small">
            <el-table-column label="商品 / SKU" min-width="180">
              <template #default="{ row }">{{ row.product_name ? `${row.product_name} / ${row.sku_name}` : '权益兑换' }}</template>
            </el-table-column>
            <el-table-column label="来源" width="80">
              <template #default="{ row }">{{ MEMBERSHIP_SOURCE_LABELS[row.source] || row.source }}</template>
            </el-table-column>
            <el-table-column label="有效期" width="200">
              <template #default="{ row }">{{ row.start_at }} 至 {{ row.end_at || '永久' }}</template>
            </el-table-column>
            <el-table-column label="权益范围" min-width="160">
              <template #default="{ row }">{{ scopeText(row) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="MEMBERSHIP_STATUS_TAG[row.status]">{{ MEMBERSHIP_STATUS_LABELS[row.status] }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="订单记录" name="orders">
          <el-table v-loading="ordersLoading" element-loading-text="数据加载中" :data="orders" empty-text="暂无数据" size="small">
            <el-table-column label="订单号" width="200">
              <template #default="{ row }">
                <el-link type="primary" @click="router.push(`/order/${row.id}`)">{{ row.order_no }}</el-link>
              </template>
            </el-table-column>
            <el-table-column prop="sku_name" label="订单项" min-width="100" />
            <el-table-column label="实付" width="100">
              <template #default="{ row }">¥{{ (row.pay_amount / 100).toFixed(2) }}</template>
            </el-table-column>
            <el-table-column label="支付状态" width="100">
              <template #default="{ row }">{{ PAY_STATUS_LABELS[row.pay_status] || row.pay_status }}</template>
            </el-table-column>
            <el-table-column label="履约状态" width="90">
              <template #default="{ row }">{{ FULFILL_STATUS_LABELS[row.fulfill_status] || '-' }}</template>
            </el-table-column>
            <el-table-column prop="created_at" label="下单时间" width="160" />
          </el-table>
          <div class="pager">
            <el-pagination
              v-model:current-page="ordersPage"
              :page-size="PAGE_SIZE"
              :total="ordersTotal"
              layout="total, prev, pager, next, jumper"
              @current-change="loadOrders"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane label="兑换记录" name="redeems">
          <el-table v-loading="redeemsLoading" element-loading-text="数据加载中" :data="redeems" empty-text="暂无数据" size="small">
            <el-table-column prop="code" label="兑换码" width="130" />
            <el-table-column prop="batch_name" label="所属批次" min-width="140" />
            <el-table-column label="商品 / SKU" min-width="180">
              <template #default="{ row }">{{ row.product_name ? `${row.product_name} / ${row.sku_name}` : '权益兑换' }}</template>
            </el-table-column>
            <el-table-column prop="used_at" label="使用时间" width="160" />
          </el-table>
          <div class="pager">
            <el-pagination
              v-model:current-page="redeemsPage"
              :page-size="PAGE_SIZE"
              :total="redeemsTotal"
              layout="total, prev, pager, next, jumper"
              @current-change="loadRedeems"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { userApi, scenicApi } from '../../api';
import {
  PAY_STATUS_LABELS, FULFILL_STATUS_LABELS,
  MEMBERSHIP_STATUS_LABELS, MEMBERSHIP_STATUS_TAG, MEMBERSHIP_SOURCE_LABELS,
  USER_CHANNEL_LABELS, PAGE_SIZE,
} from '../../constants';
import { getRegionNames } from '../../utils/region';

const route = useRoute();
const router = useRouter();
const userId = route.params.id;
const tab = ref('membership');

const profile = ref(null);
const activeMemberships = ref([]);
const historyMemberships = ref([]);
const areaNames = ref({});
const regionNames = ref({});

const orders = ref([]);
const ordersTotal = ref(0);
const ordersPage = ref(1);
const ordersLoading = ref(false);

const redeems = ref([]);
const redeemsTotal = ref(0);
const redeemsPage = ref(1);
const redeemsLoading = ref(false);
const redeemsLoaded = ref(false);

onMounted(async () => {
  [regionNames.value] = await Promise.all([getRegionNames()]);
  const data = await userApi.detail(userId);
  profile.value = data.profile;
  activeMemberships.value = data.activeMemberships;
  historyMemberships.value = data.historyMemberships;
  // 景区名映射（按景区配置权益时显示用）
  const areaData = await scenicApi.areas({ page: 1, pageSize: 100 });
  const map = {};
  areaData.list.forEach(a => { map[a.id] = a.name; });
  areaNames.value = map;
  loadOrders();
});

// 切换 Tab 时按需加载（订单/兑换记录）
function onTabChange(name) {
  if (name === 'redeems' && !redeemsLoaded.value) loadRedeems();
}

function parseJson(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s;
  try { return JSON.parse(s) || []; } catch (e) { return []; }
}

function scopeText(m) {
  const parts = [];
  const regions = parseJson(m.scope_regions);
  parts.push(!regions.length || regions.includes('NATIONWIDE') ? '全国' : regions.map(c => regionNames.value[c] || c).join('、'));
  const levels = parseJson(m.scope_levels);
  const scenicIds = parseJson(m.scope_scenic_ids).map(Number);
  // 级别维度：指定了景区时级别为空则不展示（级别不生效）；未指定景区时空=全部级别
  if (levels.length && !levels.includes('ALL')) {
    parts.push(levels.join('、'));
  } else if (!scenicIds.length) {
    parts.push('全部级别');
  }
  if (scenicIds.length) parts.push(`指定景区：${scenicIds.map(id => areaNames.value[id] || `#${id}`).join('、')}`);
  return parts.join('；');
}

async function loadOrders() {
  ordersLoading.value = true;
  try {
    const data = await userApi.orders(userId, { page: ordersPage.value, pageSize: PAGE_SIZE });
    orders.value = data.list;
    ordersTotal.value = data.total;
  } finally {
    ordersLoading.value = false;
  }
}

async function loadRedeems() {
  redeemsLoading.value = true;
  try {
    const data = await userApi.redeems(userId, { page: redeemsPage.value, pageSize: PAGE_SIZE });
    redeems.value = data.list;
    redeemsTotal.value = data.total;
    redeemsLoaded.value = true;
  } finally {
    redeemsLoading.value = false;
  }
}
</script>

<style scoped>
.head { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
.title { font-size: 16px; font-weight: 600; }
h4 { margin: 10px 0 8px; color: #303133; }
</style>
