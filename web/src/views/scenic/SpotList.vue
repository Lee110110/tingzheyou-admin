<template>
  <div>
    <el-card class="page-card" shadow="never">
      <div class="filter-bar">
        <el-button @click="router.back()">← 返回</el-button>
        <span class="title">景区：{{ areaName || '...' }}</span>
        <div style="flex: 1" />
        <el-button type="primary" @click="openDialog()">新增景点</el-button>
      </div>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" element-loading-text="数据加载中" :data="list" empty-text="暂无数据">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="景点名称" min-width="160">
          <template #default="{ row }">
            <div class="spot-cell">
              <el-image v-if="row.image" :src="row.image" fit="cover" class="thumb" :preview-src-list="[row.image]" />
              <div v-else class="thumb thumb-empty">无图</div>
              <span class="spot-name">{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="景点描述" min-width="200" show-overflow-tooltip />
        <el-table-column label="试听" width="70" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.is_audition" type="success" size="small">试听</el-tag>
            <span v-else class="dim">-</span>
          </template>
        </el-table-column>
        <el-table-column label="必听" width="70" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.is_must_listen" type="danger" size="small">必听</el-tag>
            <span v-else class="dim">-</span>
          </template>
        </el-table-column>
        <el-table-column label="讲解音频" width="280">
          <template #default="{ row }">
            <audio v-if="row.audio" :src="row.audio" controls style="height: 32px; width: 250px" />
            <span v-else class="dim">未上传</span>
          </template>
        </el-table-column>
        <el-table-column label="上架状态" width="90">
          <template #default="{ row }">
            <el-switch :model-value="row.status === 1" @change="v => toggleStatus(row, v)" />
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160" />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑景点' : '新增景点'" width="620px">
      <el-form label-width="90px">
        <el-form-item label="景点名称" required>
          <el-input v-model="form.name" placeholder="请输入景点名称" />
        </el-form-item>
        <el-form-item label="景点描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="讲解词">
          <el-input v-model="form.narration" type="textarea" :rows="4" placeholder="讲解音频对应的文字内容" />
        </el-form-item>
        <el-form-item label="景点图片">
          <ImageUpload v-model="form.image" hint="10MB 内" />
        </el-form-item>
        <el-form-item label="讲解音频">
          <AudioUpload v-model="form.audio" hint="50MB 内" />
        </el-form-item>
        <el-form-item label="景点围栏">
          <FenceEditor v-model="form.fence" />
        </el-form-item>
        <el-form-item label="试听/必听">
          <el-checkbox v-model="form.isAudition">允许试听</el-checkbox>
          <el-checkbox v-model="form.isMustListen">设为必听</el-checkbox>
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
import ImageUpload from '../../components/ImageUpload.vue';
import AudioUpload from '../../components/AudioUpload.vue';
import FenceEditor from '../../components/FenceEditor.vue';

const route = useRoute();
const router = useRouter();
const areaId = route.params.id;
const areaName = ref('');
const loading = ref(false);
const list = ref([]);

const dialogVisible = ref(false);
const saving = ref(false);
const form = reactive({ id: null, name: '', description: '', narration: '', image: '', audio: '', fence: null, isAudition: false, isMustListen: false });

onMounted(async () => {
  const area = await scenicApi.area(areaId);
  areaName.value = area.name;
  load();
});

async function load() {
  loading.value = true;
  try {
    list.value = await scenicApi.spots(areaId);
  } finally {
    loading.value = false;
  }
}

function openDialog(row) {
  if (row) {
    form.id = row.id;
    form.name = row.name;
    form.description = row.description || '';
    form.narration = row.narration || '';
    form.image = row.image || '';
    form.audio = row.audio || '';
    form.fence = row.fence || null;
    form.isAudition = !!row.is_audition;
    form.isMustListen = !!row.is_must_listen;
  } else {
    form.id = null;
    form.name = '';
    form.description = '';
    form.narration = '';
    form.image = '';
    form.audio = '';
    form.fence = null;
    form.isAudition = false;
    form.isMustListen = false;
  }
  dialogVisible.value = true;
}

async function save() {
  if (!form.name) return ElMessage.warning('请输入景点名称');
  saving.value = true;
  try {
    const body = { name: form.name, description: form.description, narration: form.narration, image: form.image, audio: form.audio, fence: form.fence, isAudition: form.isAudition, isMustListen: form.isMustListen };
    if (form.id) {
      await scenicApi.updateSpot(form.id, body);
      ElMessage.success('已保存');
    } else {
      await scenicApi.createSpot(areaId, body);
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
    await ElMessageBox.confirm(`确定删除景点「${row.name}」？`, '删除确认', { type: 'warning' });
  } catch (e) { return; }
  await scenicApi.deleteSpot(row.id);
  ElMessage.success('已删除');
  load();
}

async function toggleStatus(row, val) {
  await scenicApi.setSpotStatus(row.id, val ? 1 : 0);
  ElMessage.success(val ? '已上线' : '已下线（不展示在景点列表，线路中不可勾选）');
  load();
}
</script>

<style scoped>
.title { font-size: 16px; font-weight: 600; }
.spot-cell { display: flex; align-items: center; gap: 10px; }
.thumb { width: 56px; height: 38px; border-radius: 4px; flex: none; }
.thumb-empty { display: flex; align-items: center; justify-content: center; background: #f0f2f5; color: #c0c4cc; font-size: 12px; }
.spot-name { font-weight: 600; }
</style>
