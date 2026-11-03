<template>
  <div>
    <el-card class="page-card" shadow="never">
      <div class="filter-bar">
        <el-button @click="router.back()">← 返回</el-button>
        <span class="title">景区：{{ areaName || '...' }} · 线路管理</span>
        <div style="flex: 1" />
        <el-button type="primary" @click="openDialog()">创建路线</el-button>
      </div>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" element-loading-text="数据加载中" :data="list" empty-text="暂无数据">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="线路名称" min-width="200" />
        <el-table-column label="景点数" width="90">
          <template #default="{ row }">{{ row.spot_count }}</template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="170" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑路线' : '创建路线'" width="720px">
      <el-form label-width="90px">
        <el-form-item label="路线名称" required>
          <el-input v-model="form.name" placeholder="请输入路线名称" />
        </el-form-item>
        <el-form-item label="包含景点">
          <div class="route-spots">
            <div v-if="!allSpots.length" class="dim">该景区暂无可用景点，请先在「景点管理」中添加或开启</div>
            <div v-for="s in allSpots" :key="s.id" class="spot-row">
              <el-checkbox v-model="s.checked" @change="onCheckChange(s)">{{ s.name }}</el-checkbox>
              <div class="order-box" v-if="s.checked">
                <span class="dim">顺序</span>
                <el-input-number v-model="s.sortOrder" :min="0" :max="9999" :controls="false" size="small" style="width: 80px" />
                <el-button link type="danger" @click="s.checked = false">移出本路线</el-button>
              </div>
            </div>
            <div v-if="disabledCount" class="dim">另有 {{ disabledCount }} 个已关闭的景点，不可勾选（可在「景点管理」中开启）</div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { scenicApi } from '../../api';

const route = useRoute();
const router = useRouter();
const areaId = route.params.id;
const areaName = ref('');
const loading = ref(false);
const list = ref([]);
const allSpots = ref([]); // 当前景区可用景点（仅开启状态，含 checked / sortOrder 用于编辑）
const disabledCount = ref(0); // 已关闭景点数（不参与勾选）

const dialogVisible = ref(false);
const saving = ref(false);
const form = reactive({ id: null, name: '' });

onMounted(async () => {
  const area = await scenicApi.area(areaId);
  areaName.value = area.name;
  const spots = await scenicApi.spots(areaId);
  disabledCount.value = spots.filter(s => s.status !== 1).length;
  allSpots.value = spots.filter(s => s.status === 1).map(s => ({ id: s.id, name: s.name, checked: false, sortOrder: 0 }));
  load();
});

async function load() {
  loading.value = true;
  try {
    list.value = await scenicApi.routes(areaId);
  } finally {
    loading.value = false;
  }
}

function resetSpotState() {
  allSpots.value.forEach(s => { s.checked = false; s.sortOrder = 0; });
}

function onCheckChange(s) {
  if (s.checked && s.sortOrder == null) s.sortOrder = 0;
}

async function openDialog(row) {
  form.id = null;
  form.name = '';
  resetSpotState();
  if (row) {
    form.id = row.id;
    form.name = row.name;
    const detail = await scenicApi.routeDetail(row.id);
    detail.spots.forEach(rs => {
      const s = allSpots.value.find(x => x.id === rs.id);
      if (s) { s.checked = true; s.sortOrder = rs.sort_order || 0; }
    });
  }
  dialogVisible.value = true;
}

async function save() {
  if (!form.name) return ElMessage.warning('请输入路线名称');
  const spots = allSpots.value
    .filter(s => s.checked)
    .map(s => ({ spotId: s.id, sortOrder: Number(s.sortOrder) || 0 }));
  if (!spots.length) return ElMessage.warning('线路至少包含一个景点');
  saving.value = true;
  try {
    if (form.id) {
      await scenicApi.updateRoute(form.id, { name: form.name, spots });
      ElMessage.success('已保存');
    } else {
      await scenicApi.createRoute(areaId, { name: form.name, spots });
      ElMessage.success('已创建');
    }
    dialogVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除路线「${row.name}」？删除后不影响景区下景点本身。`, '删除确认', { type: 'warning' });
  } catch (e) { return; }
  await scenicApi.removeRoute(row.id);
  ElMessage.success('已删除');
  load();
}
</script>

<style scoped>
.title { font-size: 16px; font-weight: 600; }
.route-spots { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.spot-row { display: flex; align-items: center; gap: 12px; padding: 4px 0; }
.order-box { display: flex; align-items: center; gap: 6px; }
.dim { color: #909399; font-size: 13px; }
</style>
