<template>
  <div>
    <el-card class="page-card" shadow="never">
      <div class="filter-bar">
        <el-input v-model="query.keyword" placeholder="标题" clearable @keyup.enter="search" />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div style="flex: 1" />
        <el-button type="primary" @click="openDialog">新增推荐位</el-button>
      </div>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" element-loading-text="数据加载中" :data="list" empty-text="暂无数据">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="推荐位" min-width="260">
          <template #default="{ row }">
            <div class="rec-cell">
              <el-image v-if="row.cover" :src="row.cover" fit="cover" class="thumb" :preview-src-list="[row.cover]" />
              <div v-else class="thumb thumb-empty">无封面</div>
              <div>
                <div class="name">{{ row.title }}</div>
                <div class="dim">{{ row.spot_name }} · {{ row.area_name }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="摘要" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ row.summary || '-' }}</template>
        </el-table-column>
        <el-table-column label="可用状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.area_status !== 1" type="danger">不可用</el-tag>
            <el-tag v-else type="success">可用</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="权重（越大越靠前）" width="220">
          <template #default="{ row }">
            <div class="weight-cell">
              <el-input-number v-model="row.weight" :min="0" :max="9999" :controls="false" style="width: 90px" size="small" />
              <el-button v-if="row.weight !== row._origWeight" link type="primary" @click="saveWeight(row)">保存</el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160" />
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
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

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑推荐位' : '新增推荐位'" width="600px">
      <el-form label-width="100px">
        <el-form-item v-if="!form.id" label="选择景点" required>
          <el-select
            v-model="form.spotId"
            filterable
            remote
            :remote-method="searchSpots"
            :loading="spotSearching"
            placeholder="输入景点名称搜索"
            style="width: 100%"
          >
            <el-option v-for="s in spotOptions" :key="s.id" :value="s.id" :label="`${s.name}（${s.area_name}）`" />
          </el-select>
          <div class="dim" style="width: 100%">景区已下架的景点仍可选择，但推荐位会标记为不可用</div>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="form.title" :placeholder="form.id ? '' : '留空则使用景点名称'" />
        </el-form-item>
        <el-form-item label="摘要">
          <el-input v-model="form.summary" type="textarea" :rows="2" :placeholder="form.id ? '' : '留空则使用景点描述'" />
        </el-form-item>
        <el-form-item label="封面图">
          <ImageUpload v-model="form.cover" :hint="form.id ? '' : '留空则使用景点图片'" />
        </el-form-item>
        <el-form-item label="权重">
          <el-input-number v-model="form.weight" :min="0" :max="9999" />
          <span class="dim" style="margin-left: 8px">数值越大越靠前</span>
        </el-form-item>
        <el-alert v-if="!form.id" type="info" :closable="false" title="创建后手动修改的标题/摘要/封面不会被景点信息覆盖" />
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
import { ElMessage, ElMessageBox } from 'element-plus';
import { recommendApi, scenicApi } from '../../api';
import { PAGE_SIZE } from '../../constants';
import ImageUpload from '../../components/ImageUpload.vue';

const loading = ref(false);
const list = ref([]);
const total = ref(0);
const page = ref(1);
const query = reactive({ keyword: '' });

const dialogVisible = ref(false);
const saving = ref(false);
const spotSearching = ref(false);
const spotOptions = ref([]);
const form = reactive({ id: null, spotId: null, title: '', summary: '', cover: '', weight: 0 });

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const data = await recommendApi.list({ page: page.value, pageSize: PAGE_SIZE, keyword: query.keyword || '' });
    list.value = data.list.map(r => ({ ...r, _origWeight: r.weight }));
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
  search();
}

async function searchSpots(keyword) {
  if (!keyword) { spotOptions.value = []; return; }
  spotSearching.value = true;
  try {
    spotOptions.value = await scenicApi.searchSpots(keyword);
  } finally {
    spotSearching.value = false;
  }
}

function openDialog(row) {
  form.id = null;
  form.spotId = null;
  form.title = '';
  form.summary = '';
  form.cover = '';
  form.weight = 0;
  spotOptions.value = [];
  if (row) {
    form.id = row.id;
    form.title = row.title;
    form.summary = row.summary || '';
    form.cover = row.cover || '';
    form.weight = row.weight;
  }
  dialogVisible.value = true;
}

async function save() {
  if (!form.id && !form.spotId) return ElMessage.warning('请选择景点');
  if (form.id && !form.title) return ElMessage.warning('请输入标题');
  saving.value = true;
  try {
    if (form.id) {
      await recommendApi.update(form.id, { title: form.title, summary: form.summary, cover: form.cover, weight: form.weight });
      ElMessage.success('已保存');
    } else {
      await recommendApi.create({ spotId: form.spotId, title: form.title, summary: form.summary, cover: form.cover, weight: form.weight });
      ElMessage.success('已新增');
    }
    dialogVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function saveWeight(row) {
  await recommendApi.update(row.id, { title: row.title, summary: row.summary || '', cover: row.cover || '', weight: row.weight });
  row._origWeight = row.weight;
  ElMessage.success('权重已更新，列表按权重重新排序');
  load();
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除推荐位「${row.title}」？`, '删除确认', { type: 'warning' });
  } catch (e) { return; }
  await recommendApi.remove(row.id);
  ElMessage.success('已删除');
  if (list.value.length === 1 && page.value > 1) page.value -= 1;
  load();
}
</script>

<style scoped>
.rec-cell { display: flex; align-items: center; gap: 10px; }
.thumb { width: 64px; height: 44px; border-radius: 4px; flex: none; }
.thumb-empty { display: flex; align-items: center; justify-content: center; background: #f0f2f5; color: #c0c4cc; font-size: 12px; }
.name { font-weight: 600; }
.weight-cell { display: flex; align-items: center; gap: 8px; }
</style>
