<template>
  <div>
    <el-card class="page-card" shadow="never">
      <div class="filter-bar">
        <el-select v-model="query.module" placeholder="模块" clearable style="width: 140px">
          <el-option v-for="o in LOG_MODULE_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-input v-model="query.keyword" placeholder="操作人 / 操作对象" clearable @keyup.enter="search" />
        <el-date-picker
          v-model="query.range"
          type="daterange"
          value-format="YYYY-MM-DD"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
        />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" element-loading-text="数据加载中" :data="list" empty-text="暂无数据">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="expand">
              <div v-if="row.before_json"><b>变更前：</b><pre>{{ pretty(row.before_json) }}</pre></div>
              <div v-if="row.after_json"><b>变更后：</b><pre>{{ pretty(row.after_json) }}</pre></div>
              <div v-if="!row.before_json && !row.after_json" class="dim">无变更明细</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="created_at" label="时间" width="160" />
        <el-table-column prop="username" label="操作人" width="110" />
        <el-table-column label="模块" width="100">
          <template #default="{ row }">{{ LOG_MODULE_LABELS[row.module] || row.module }}</template>
        </el-table-column>
        <el-table-column prop="action" label="操作" width="150" />
        <el-table-column prop="target" label="操作对象" min-width="180" show-overflow-tooltip />
        <el-table-column prop="ip" label="IP" width="120" />
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
import { logApi } from '../../api';
import { LOG_MODULE_OPTIONS, LOG_MODULE_LABELS, PAGE_SIZE } from '../../constants';

const loading = ref(false);
const list = ref([]);
const total = ref(0);
const page = ref(1);
const query = reactive({ module: '', keyword: '', range: null });

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const data = await logApi.list({
      page: page.value, pageSize: PAGE_SIZE,
      module: query.module || '', keyword: query.keyword || '',
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
  query.module = '';
  query.keyword = '';
  query.range = null;
  search();
}

function pretty(json) {
  if (json == null) return '';
  if (typeof json === 'string') {
    try { return JSON.stringify(JSON.parse(json), null, 2); } catch (e) { return json; }
  }
  return JSON.stringify(json, null, 2);
}
</script>

<style scoped>
.expand { padding: 4px 12px; }
.expand pre {
  background: #f5f7fa; padding: 10px; border-radius: 4px;
  font-size: 12px; max-height: 260px; overflow: auto; margin: 6px 0;
}
</style>
