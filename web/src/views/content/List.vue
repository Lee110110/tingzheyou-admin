<template>
  <div>
    <el-card class="page-card" shadow="never">
      <div class="filter-bar">
        <el-select v-model="query.type" placeholder="类型" clearable style="width: 150px" @change="search">
          <el-option v-for="o in CONTENT_TYPE_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-input v-model="query.keyword" placeholder="标题" clearable @keyup.enter="search" />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div style="flex: 1" />
        <el-button type="primary" @click="openDialog()">新增内容位</el-button>
      </div>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" element-loading-text="数据加载中" :data="list" empty-text="暂无数据">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <el-tag :type="CONTENT_TYPE_TAG[row.type]" size="small">{{ CONTENT_TYPE_LABELS[row.type] || row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="标题" min-width="160">
          <template #default="{ row }">{{ row.title }}</template>
        </el-table-column>
        <el-table-column label="图片" width="120">
          <template #default="{ row }">
            <el-image v-if="row.image" :src="row.image" fit="cover" class="thumb" :preview-src-list="[row.image]" />
            <span v-else class="dim">-</span>
          </template>
        </el-table-column>
        <el-table-column label="链接类型" width="120">
          <template #default="{ row }">{{ LINK_TYPE_LABELS[row.link_type] || row.link_type }}</template>
        </el-table-column>
        <el-table-column label="链接" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ row.link_url }}</template>
        </el-table-column>
        <el-table-column prop="weight" label="权重" width="80" />
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

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑内容位' : '新增内容位'" width="600px">
      <el-form label-width="90px">
        <el-form-item label="类型" required>
          <el-select v-model="form.type" style="width: 200px">
            <el-option v-for="o in CONTENT_TYPE_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题" required>
          <el-input v-model="form.title" placeholder="请输入标题" />
        </el-form-item>
        <el-form-item label="图片" required>
          <ImageUpload v-model="form.image" hint="10MB 内" />
        </el-form-item>
        <el-form-item label="链接类型">
          <el-select v-model="form.linkType" style="width: 200px">
            <el-option v-for="o in LINK_TYPE_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
          </el-select>
        </el-form-item>
        <el-form-item label="跳转链接" required>
          <el-input v-model="form.linkUrl" :placeholder="form.linkType === 'MINI_PROGRAM' ? '小程序页面路径，如 /pages/spot/detail?id=1' : 'https:// 开头的网页地址'" />
        </el-form-item>
        <el-form-item label="权重">
          <el-input-number v-model="form.weight" :min="0" :max="9999" />
          <span class="dim" style="margin-left: 8px">数值越大越靠前</span>
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
import { ElMessage, ElMessageBox } from 'element-plus';
import { contentApi } from '../../api';
import { CONTENT_TYPE_OPTIONS, CONTENT_TYPE_LABELS, CONTENT_TYPE_TAG, LINK_TYPE_OPTIONS, LINK_TYPE_LABELS, PAGE_SIZE } from '../../constants';
import ImageUpload from '../../components/ImageUpload.vue';

const loading = ref(false);
const list = ref([]);
const total = ref(0);
const page = ref(1);
const query = reactive({ type: '', keyword: '' });

const dialogVisible = ref(false);
const saving = ref(false);
const form = reactive({ id: null, type: 'AD', title: '', image: '', linkType: 'H5', linkUrl: '', weight: 0 });

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const data = await contentApi.list({ page: page.value, pageSize: PAGE_SIZE, type: query.type || '', keyword: query.keyword || '' });
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
  query.type = '';
  query.keyword = '';
  search();
}

function openDialog(row) {
  form.id = null;
  form.type = 'AD';
  form.title = '';
  form.image = '';
  form.linkType = 'H5';
  form.linkUrl = '';
  form.weight = 0;
  if (row) {
    form.id = row.id;
    form.type = row.type;
    form.title = row.title;
    form.image = row.image || '';
    form.linkType = row.link_type || 'H5';
    form.linkUrl = row.link_url || '';
    form.weight = row.weight || 0;
  }
  dialogVisible.value = true;
}

async function save() {
  if (!form.type) return ElMessage.warning('请选择类型');
  if (!form.title) return ElMessage.warning('请输入标题');
  if (!form.image) return ElMessage.warning('请上传图片');
  if (!form.linkUrl) return ElMessage.warning('请输入跳转链接');
  saving.value = true;
  try {
    const body = { type: form.type, title: form.title, image: form.image, linkType: form.linkType, linkUrl: form.linkUrl, weight: form.weight };
    if (form.id) {
      await contentApi.update(form.id, body);
      ElMessage.success('已保存');
    } else {
      await contentApi.create(body);
      ElMessage.success('已新增');
    }
    dialogVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除内容位「${row.title}」？`, '删除确认', { type: 'warning' });
  } catch (e) { return; }
  await contentApi.remove(row.id);
  ElMessage.success('已删除');
  if (list.value.length === 1 && page.value > 1) page.value -= 1;
  load();
}
</script>

<style scoped>
.thumb { width: 64px; height: 44px; border-radius: 4px; }
.dim { color: #909399; font-size: 13px; }
</style>
