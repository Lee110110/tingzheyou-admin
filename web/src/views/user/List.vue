<template>
  <div>
    <el-card class="page-card" shadow="never">
      <div class="filter-bar">
        <el-input v-model="query.keyword" placeholder="用户ID / 手机号 / 昵称" clearable @keyup.enter="search" />
        <el-select v-model="query.channel" placeholder="注册渠道" clearable style="width: 120px">
          <el-option v-for="o in USER_CHANNEL_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-select v-model="query.tag" placeholder="用户标签" clearable style="width: 120px">
          <el-option v-for="o in USER_TAG_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-date-picker
          v-model="query.range"
          type="daterange"
          value-format="YYYY-MM-DD"
          start-placeholder="注册开始"
          end-placeholder="注册结束"
        />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" element-loading-text="数据加载中" :data="list" empty-text="暂无数据">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="用户" min-width="190">
          <template #default="{ row }">
            <div class="user-cell">
              <el-avatar :size="34" :src="row.avatar || undefined" />
              <div>
                <div class="name">
                  <el-link type="primary" :underline="false" @click="openDetail(row.id)">{{ row.nickname || '-' }}</el-link>
                  <span v-if="row.active_expire_at" class="dot" />
                </div>
                <div class="dim">{{ row.phone || '-' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="注册渠道" width="100">
          <template #default="{ row }">{{ USER_CHANNEL_LABELS[row.channel] || row.channel }}</template>
        </el-table-column>
        <el-table-column label="用户标签" width="100">
          <template #default="{ row }">
            <el-tag v-if="tagOf(row) === 'MEMBER'" type="success">会员用户</el-tag>
            <el-tag v-else-if="tagOf(row) === 'EXPIRED_MEMBER'" type="info">过期会员</el-tag>
            <el-tag v-else type="warning">普通用户</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="会员到期" width="110">
          <template #default="{ row }">
            <span v-if="row.active_expire_at">{{ String(row.active_expire_at).slice(0, 10) }}</span>
            <span v-else class="dim">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="order_count" label="订单数" width="80" />
        <el-table-column label="累计消费" width="110">
          <template #default="{ row }">
            <span class="money">¥{{ (row.total_spent / 100).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="registered_at" label="注册时间" width="160" />
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push(`/user/${row.id}`)">详情</el-button>
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
import { userApi } from '../../api';
import { USER_CHANNEL_OPTIONS, USER_CHANNEL_LABELS, USER_TAG_OPTIONS, PAGE_SIZE } from '../../constants';

const router = useRouter();
const loading = ref(false);
const list = ref([]);
const total = ref(0);
const page = ref(1);
const query = reactive({ keyword: '', channel: '', tag: '', range: null });

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const data = await userApi.list({
      page: page.value, pageSize: PAGE_SIZE,
      keyword: query.keyword || '', channel: query.channel || '', tag: query.tag || '',
      startDate: (query.range && query.range[0]) || '',
      endDate: (query.range && query.range[1]) || '',
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
  query.channel = '';
  query.tag = '';
  query.range = null;
  search();
}

function tagOf(row) {
  if (row.active_expire_at) return 'MEMBER';
  if ((row.membership_count || 0) > 0) return 'EXPIRED_MEMBER';
  return 'NORMAL';
}

// 点击昵称新开页面查看用户详情
function openDetail(id) {
  window.open(router.resolve(`/user/${id}`).href, '_blank');
}
</script>

<style scoped>
.user-cell { display: flex; align-items: center; gap: 10px; }
.name { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #67c23a; display: inline-block; }
</style>
