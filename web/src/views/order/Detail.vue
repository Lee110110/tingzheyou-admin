<template>
  <div v-if="order">
    <el-card class="page-card" shadow="never">
      <div class="head">
        <el-button @click="router.back()">← 返回</el-button>
        <span class="title">订单：{{ order.order_no }}</span>
        <div style="flex: 1" />
        <el-button v-if="order.pay_status === 'UNPAID' && !order.close_type" type="warning" @click="cancelOrder">取消订单</el-button>
        <el-button
          v-if="['PAID', 'PART_REFUNDED'].includes(order.pay_status) && !order.close_type"
          type="danger" @click="openRefund"
        >退款</el-button>
      </div>

      <el-descriptions :column="3" border>
        <el-descriptions-item label="订单号" :span="2">{{ order.order_no }}</el-descriptions-item>
        <el-descriptions-item label="用户">
          <el-link type="primary" @click="router.push(`/user/${order.user_id}`)">{{ order.user_nickname || order.user_id }}</el-link>
          <span v-if="order.user_phone" class="dim">（{{ order.user_phone }}）</span>
        </el-descriptions-item>
        <el-descriptions-item label="渠道">{{ USER_CHANNEL_LABELS[order.channel] || order.channel }}</el-descriptions-item>
        <el-descriptions-item label="订单项">{{ order.sku_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="所属景区">{{ order.scenic_area_name || (order.product_id ? '全国通用' : '-') }}</el-descriptions-item>
        <el-descriptions-item label="原价">¥{{ (order.original_price / 100).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="实付">
          <span class="money">¥{{ (order.pay_amount / 100).toFixed(2) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="支付方式">{{ order.pay_method === 'REDEEM_CODE' ? '兑换码' : order.pay_method || '-' }}</el-descriptions-item>
        <el-descriptions-item label="支付状态">
          <template v-if="order.close_type">
            <el-tag type="info">已关闭（{{ CLOSE_TYPE_LABELS[order.close_type] || order.close_type }}）</el-tag>
          </template>
          <el-tag v-else :type="PAY_STATUS_TAG[order.pay_status]">{{ PAY_STATUS_LABELS[order.pay_status] || order.pay_status }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="履约状态">{{ FULFILL_STATUS_LABELS[order.fulfill_status] || '-' }}</el-descriptions-item>
        <el-descriptions-item label="下单时间">{{ order.created_at }}</el-descriptions-item>
        <el-descriptions-item label="支付时间">{{ order.paid_at || '-' }}</el-descriptions-item>
        <el-descriptions-item v-if="order.cancel_reason" label="取消/关闭原因" :span="2">
          {{ order.cancel_reason }}
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card shadow="never">
      <template #header>状态流转</template>
      <el-steps :active="flowActive" :status="flowStatus" align-center>
        <el-step v-for="s in flowSteps" :key="s.title" :title="s.title" :description="s.description" />
      </el-steps>
    </el-card>

    <el-card shadow="never">
      <template #header>退款记录（已退 ¥{{ (order.refundedAmount / 100).toFixed(2) }}，可退 ¥{{ (order.refundable / 100).toFixed(2) }}）</template>
      <el-table :data="refunds" empty-text="暂无数据">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="退款金额" width="130">
          <template #default="{ row }">
            <span class="money">¥{{ (row.amount / 100).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="退款原因" min-width="160" />
        <el-table-column prop="admin_username" label="操作人" width="120" />
        <el-table-column prop="created_at" label="退款时间" width="170" />
      </el-table>
    </el-card>

    <!-- 退款弹窗 -->
    <el-dialog v-model="refundVisible" title="订单退款" width="460px">
      <el-form label-width="100px">
        <el-form-item label="实付金额">¥{{ (order.pay_amount / 100).toFixed(2) }}</el-form-item>
        <el-form-item label="已退款">¥{{ (order.refundedAmount / 100).toFixed(2) }}</el-form-item>
        <el-form-item label="可退余额">¥{{ (order.refundable / 100).toFixed(2) }}</el-form-item>
        <el-form-item label="退款金额（元）" required>
          <el-input-number v-model="refundForm.yuan" :min="0.01" :max="order.refundable / 100" :precision="2" :controls="false" style="width: 160px" />
        </el-form-item>
        <el-form-item label="退款原因" required>
          <el-input v-model="refundForm.reason" type="textarea" :rows="2" placeholder="必填" />
        </el-form-item>
        <el-alert
          v-if="order.fulfill_status === 'ACTIVATED'"
          type="warning" :closable="false"
          title="该订单已开卡：退款后会员将立即失效，次卡剩余次数作废"
        />
      </el-form>
      <template #footer>
        <el-button @click="refundVisible = false">取消</el-button>
        <el-button type="danger" :loading="refunding" @click="doRefund">确认退款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { orderApi } from '../../api';
import {
  PAY_STATUS_LABELS, PAY_STATUS_TAG, FULFILL_STATUS_LABELS,
  CLOSE_TYPE_LABELS, USER_CHANNEL_LABELS,
} from '../../constants';

const route = useRoute();
const router = useRouter();
const orderId = route.params.id;
const order = ref(null);
const refunds = ref([]);

const refundVisible = ref(false);
const refunding = ref(false);
const refundForm = reactive({ yuan: null, reason: '' });

onMounted(load);

async function load() {
  const data = await orderApi.detail(orderId);
  order.value = data.order;
  refunds.value = data.refunds;
}

// 状态流转（会员卡订单）：待支付 → 已支付待开卡 → 已开卡（权益生效）
const flowSteps = computed(() => [{ title: '待支付' }, { title: '已支付待开卡' }, { title: '已开卡（权益生效）' }]);

const flowActive = computed(() => {
  const o = order.value;
  if (!o) return 0;
  if (o.fulfill_status === 'ACTIVATED') return 3;
  if (o.paid_at) return 2;
  return 1;
});

const flowStatus = computed(() => (order.value && order.value.close_type ? 'error' : 'process'));

async function cancelOrder() {
  let reason = '';
  try {
    const { value } = await ElMessageBox.prompt('确定取消该待支付订单？取消后库存将释放。', '取消订单', {
      inputPlaceholder: '取消原因（可留空）',
      type: 'warning',
    });
    reason = value || '';
  } catch (e) { return; }
  await orderApi.cancel(orderId, reason);
  ElMessage.success('订单已取消');
  load();
}

function openRefund() {
  refundForm.yuan = order.value.refundable / 100;
  refundForm.reason = '';
  refundVisible.value = true;
}

async function doRefund() {
  if (!refundForm.yuan) return ElMessage.warning('请输入退款金额');
  if (!refundForm.reason.trim()) return ElMessage.warning('请填写退款原因');
  refunding.value = true;
  try {
    await orderApi.refund(orderId, Math.round(refundForm.yuan * 100), refundForm.reason.trim());
    ElMessage.success('退款成功');
    refundVisible.value = false;
    load();
  } finally {
    refunding.value = false;
  }
}
</script>

<style scoped>
.head { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
.title { font-size: 16px; font-weight: 600; }
</style>
