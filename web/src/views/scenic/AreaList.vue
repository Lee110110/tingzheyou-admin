<template>
  <div>
    <el-card class="page-card" shadow="never">
      <div class="filter-bar">
        <RegionCascader v-model="query.region" placeholder="省 / 市筛选" />
        <el-select v-model="query.level" placeholder="级别" clearable style="width: 120px">
          <el-option v-for="o in SCENIC_LEVEL_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-input v-model="query.keyword" placeholder="景区名称" clearable @keyup.enter="search" />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <div style="flex: 1" />
        <el-button type="primary" @click="openDialog()">新增景区</el-button>
      </div>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" element-loading-text="数据加载中" :data="list" empty-text="暂无数据">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="景区" min-width="240">
          <template #default="{ row }">
            <div class="area-cell">
              <el-image v-if="row.cover_image" :src="row.cover_image" fit="cover" class="thumb" :preview-src-list="[row.cover_image]" />
              <div v-else class="thumb thumb-empty">无封面</div>
              <div>
                <div class="area-name">{{ row.name }}</div>
                <div class="dim">{{ row.address || '-' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="级别" width="80">
          <template #default="{ row }">
            <el-tag :type="row.level === '5A' ? 'danger' : row.level === '4A' ? 'warning' : 'info'">
              {{ SCENIC_LEVEL_LABELS[row.level] || row.level }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="所在省市" width="180">
          <template #default="{ row }">
            {{ regionNames[row.province_code] || row.province_code }}{{ row.city_code ? ' / ' + (regionNames[row.city_code] || row.city_code) : '' }}
          </template>
        </el-table-column>
        <el-table-column prop="open_time" label="开门时间" width="160" show-overflow-tooltip />
        <el-table-column label="景点数" width="80">
          <template #default="{ row }">
            <el-link type="primary" @click="goSpots(row)">{{ row.spot_count }}</el-link>
          </template>
        </el-table-column>
        <el-table-column label="上架状态" width="90">
          <template #default="{ row }">
            <el-switch :model-value="row.status === 1" @change="v => toggleStatus(row, v)" />
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160" />
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="goSpots(row)">管理景点</el-button>
            <el-button link type="primary" @click="goRoutes(row)">线路管理</el-button>
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

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑景区' : '新增景区'" width="640px">
      <el-form label-width="100px">
        <el-form-item label="景区名称" required>
          <el-input v-model="form.name" placeholder="请输入景区名称" />
        </el-form-item>
        <el-form-item label="所在省市" required>
          <RegionCascader v-model="form.region" />
        </el-form-item>
        <el-form-item label="景区级别">
          <el-select v-model="form.level" style="width: 160px">
            <el-option v-for="o in SCENIC_LEVEL_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
          </el-select>
        </el-form-item>
        <el-form-item label="开门时间">
          <el-input v-model="form.openTime" placeholder="如 08:30-17:00（周一闭馆）" />
        </el-form-item>
        <el-form-item label="景区地点">
          <el-input v-model="form.address" placeholder="详细地址" />
        </el-form-item>
        <el-form-item label="景区描述">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="封面图">
          <ImageUpload v-model="form.coverImage" hint="建议 16:9，10MB 内" />
        </el-form-item>
        <el-form-item label="播报内容">
          <AudioUpload v-model="form.broadcastAudio" hint="进入景区自动播放的音频，50MB 内" />
        </el-form-item>
        <el-form-item label="景区围栏">
          <FenceEditor v-model="form.fence" />
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
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { scenicApi } from '../../api';
import { SCENIC_LEVEL_OPTIONS, SCENIC_LEVEL_LABELS, PAGE_SIZE } from '../../constants';
import RegionCascader from '../../components/RegionCascader.vue';
import ImageUpload from '../../components/ImageUpload.vue';
import AudioUpload from '../../components/AudioUpload.vue';
import FenceEditor from '../../components/FenceEditor.vue';
import { getRegionNames } from '../../utils/region';

const router = useRouter();
const loading = ref(false);
const list = ref([]);
const total = ref(0);
const page = ref(1);
const regionNames = ref({});
const query = reactive({ region: [], level: '', keyword: '' });

const dialogVisible = ref(false);
const saving = ref(false);
const form = reactive({
  id: null, name: '', region: [], level: 'OTHER', openTime: '', address: '', description: '', coverImage: '', broadcastAudio: '', fence: null,
});

onMounted(async () => {
  regionNames.value = await getRegionNames();
  load();
});

function buildParams() {
  return {
    page: page.value, pageSize: PAGE_SIZE,
    provinceCode: query.region[0] || '', cityCode: query.region[1] || '',
    level: query.level || '', keyword: query.keyword || '',
  };
}

async function load() {
  loading.value = true;
  try {
    const data = await scenicApi.areas(buildParams());
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
  query.region = [];
  query.level = '';
  query.keyword = '';
  search();
}

function goSpots(row) {
  router.push(`/scenic/${row.id}/spots`);
}

function goRoutes(row) {
  router.push(`/scenic/${row.id}/routes`);
}

function openDialog(row) {
  if (row) {
    form.id = row.id;
    form.name = row.name;
    form.region = row.province_code ? [row.province_code, row.city_code].filter(Boolean) : [];
    form.level = row.level;
    form.openTime = row.open_time;
    form.address = row.address;
    form.description = row.description || '';
    form.coverImage = row.cover_image || '';
    form.broadcastAudio = row.broadcast_audio || '';
    form.fence = row.fence || null;
  } else {
    form.id = null;
    form.name = '';
    form.region = [];
    form.level = 'OTHER';
    form.openTime = '';
    form.address = '';
    form.description = '';
    form.coverImage = '';
    form.broadcastAudio = '';
    form.fence = null;
  }
  dialogVisible.value = true;
}

async function save() {
  if (!form.name) return ElMessage.warning('请输入景区名称');
  if (!form.region.length) return ElMessage.warning('请选择所在省市');
  const body = {
    name: form.name,
    provinceCode: form.region[0],
    cityCode: form.region[1] || '',
    level: form.level,
    openTime: form.openTime,
    address: form.address,
    description: form.description,
    coverImage: form.coverImage,
    broadcastAudio: form.broadcastAudio,
    fence: form.fence,
  };
  saving.value = true;
  try {
    if (form.id) {
      await scenicApi.updateArea(form.id, body);
      ElMessage.success('已保存');
    } else {
      await scenicApi.createArea(body);
      ElMessage.success('已新增');
    }
    dialogVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(row, val) {
  await scenicApi.setAreaStatus(row.id, val ? 1 : 0);
  ElMessage.success(val ? '已上架' : '已下架');
  load();
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除景区「${row.name}」？删除后前台不再展示，已购会员权益将不再包含该景区。`, '删除确认', { type: 'warning' });
  } catch (e) { return; }
  await scenicApi.deleteArea(row.id);
  ElMessage.success('已删除');
  if (list.value.length === 1 && page.value > 1) page.value -= 1;
  load();
}
</script>

<style scoped>
.area-cell { display: flex; align-items: center; gap: 10px; }
.thumb { width: 64px; height: 44px; border-radius: 4px; flex: none; }
.thumb-empty { display: flex; align-items: center; justify-content: center; background: #f0f2f5; color: #c0c4cc; font-size: 12px; }
.area-name { font-weight: 600; color: #303133; }
</style>
