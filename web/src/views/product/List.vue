<template>
  <div>
    <el-card class="page-card" shadow="never">
      <div class="filter-bar">
        <el-input v-model="query.keyword" placeholder="卡名称" clearable @keyup.enter="search" />
        <el-select v-model="query.cardType" placeholder="卡类型" clearable style="width: 120px">
          <el-option v-for="o in CARD_TYPE_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-select v-model="query.status" placeholder="状态" clearable style="width: 120px">
          <el-option v-for="o in PRODUCT_STATUS_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div style="flex: 1" />
        <el-button type="primary" @click="router.push('/product/edit/new')">新增商品</el-button>
      </div>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" element-loading-text="数据加载中" :data="list" empty-text="暂无数据">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="商品" min-width="260">
          <template #default="{ row }">
            <div class="name">{{ row.name }}</div>
            <div class="dim">{{ row.subtitle || '-' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="卡类型" width="120">
          <template #default="{ row }">
            <el-tag
              v-for="t in parseCardTypes(row.card_types)" :key="t"
              :type="t === 'COUNT' ? 'warning' : 'primary'" size="small" style="margin-right: 4px"
            >{{ CARD_TYPE_LABELS[t] || t }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="SKU 规格数" width="100">
          <template #default="{ row }">
            <el-link type="primary" @click="router.push(`/product/edit/${row.id}`)">{{ row.sku_count }}</el-link>
          </template>
        </el-table-column>
        <el-table-column label="限量 / 库存" width="130">
          <template #default="{ row }">
            <template v-if="row.limited_sku_count > 0">
              <span>限量 · 余 {{ row.total_stock ?? 0 }}</span>
              <el-tag v-if="!row.in_stock_skus" type="info" style="margin-left: 4px">已售罄</el-tag>
            </template>
            <template v-else>不限量</template>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="PRODUCT_STATUS_TAG[row.status]">{{ PRODUCT_STATUS_LABELS[row.status] || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160" />
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push(`/product/edit/${row.id}`)">编辑</el-button>
            <el-dropdown @command="cmd => onCommand(cmd, row)">
              <el-button link type="primary">
                更多<el-icon><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="row.status !== 'ON'" command="ON">上架</el-dropdown-item>
                  <el-dropdown-item v-if="row.status !== 'OFF'" command="OFF">下架</el-dropdown-item>
                  <el-dropdown-item v-if="row.status !== 'HALTED'" command="HALTED">停售</el-dropdown-item>
                  <el-dropdown-item command="DELETE" divided>删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
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
import { ElMessage, ElMessageBox } from 'element-plus';
import { productApi } from '../../api';
import {
  CARD_TYPE_OPTIONS, CARD_TYPE_LABELS, PRODUCT_STATUS_OPTIONS, PRODUCT_STATUS_LABELS,
  PRODUCT_STATUS_TAG, PAGE_SIZE,
} from '../../constants';

const router = useRouter();
const loading = ref(false);
const list = ref([]);
const total = ref(0);
const page = ref(1);
const query = reactive({ keyword: '', cardType: '', status: '' });

function parseCardTypes(csv) {
  return csv ? String(csv).split(',').filter(Boolean) : [];
}

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const data = await productApi.list({
      page: page.value, pageSize: PAGE_SIZE,
      keyword: query.keyword || '', cardType: query.cardType || '', status: query.status || '',
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
  query.cardType = '';
  query.status = '';
  search();
}

async function onCommand(cmd, row) {
  if (cmd === 'DELETE') {
    try {
      await ElMessageBox.confirm(`确定删除商品「${row.name}」？被订单/定价方案/兑换码引用的商品无法删除。`, '删除确认', { type: 'warning' });
    } catch (e) { return; }
    await productApi.remove(row.id);
    ElMessage.success('已删除');
    if (list.value.length === 1 && page.value > 1) page.value -= 1;
    load();
  } else {
    await productApi.setStatus(row.id, cmd);
    ElMessage.success(`已${PRODUCT_STATUS_LABELS[cmd]}`);
    load();
  }
}
</script>

<style scoped>
.name { font-weight: 600; color: #303133; }
</style>
