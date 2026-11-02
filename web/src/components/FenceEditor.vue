<template>
  <div class="fence-editor">
    <el-select v-model="fenceType" placeholder="围栏类型" style="width: 140px" @change="onTypeChange">
      <el-option label="无围栏" value="NONE" />
      <el-option label="自由围栏" value="FREE" />
      <el-option label="半径围栏" value="RADIUS" />
    </el-select>

    <template v-if="fenceType === 'FREE'">
      <div class="hint">按顺序输入 4 个边界点（经纬度，保留 6 位小数）</div>
      <div v-for="(p, i) in freePoints" :key="i" class="pt-row">
        <span class="pt-idx">点{{ i + 1 }}</span>
        <el-input-number v-model="p.lng" :precision="6" :step="0.000001" :controls="false" placeholder="经度" class="coord" />
        <el-input-number v-model="p.lat" :precision="6" :step="0.000001" :controls="false" placeholder="纬度" class="coord" />
      </div>
    </template>

    <template v-else-if="fenceType === 'RADIUS'">
      <div class="pt-row">
        <span class="pt-idx">中心点</span>
        <el-input-number v-model="center.lng" :precision="6" :step="0.000001" :controls="false" placeholder="经度" class="coord" />
        <el-input-number v-model="center.lat" :precision="6" :step="0.000001" :controls="false" placeholder="纬度" class="coord" />
      </div>
      <div class="pt-row">
        <span class="pt-idx">半径</span>
        <el-input-number v-model="radius" :min="1" :step="100" :controls="false" placeholder="米" class="radius" />
        <span class="unit">米</span>
      </div>
    </template>

    <div v-if="fenceType === 'NONE'" class="hint">未设置围栏</div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: Object, default: null },
});
const emit = defineEmits(['update:modelValue']);

const fenceType = ref('NONE');
const freePoints = ref([
  { lng: null, lat: null },
  { lng: null, lat: null },
  { lng: null, lat: null },
  { lng: null, lat: null },
]);
const center = ref({ lng: null, lat: null });
const radius = ref(null);

// 由外部 modelValue 同步到内部表单
function applyModel(v) {
  if (v && v.type === 'FREE' && Array.isArray(v.points)) {
    fenceType.value = 'FREE';
    freePoints.value = [0, 1, 2, 3].map(i => ({
      lng: v.points[i] ? Number(v.points[i].lng) : null,
      lat: v.points[i] ? Number(v.points[i].lat) : null,
    }));
  } else if (v && v.type === 'RADIUS' && v.center) {
    fenceType.value = 'RADIUS';
    center.value = { lng: Number(v.center.lng), lat: Number(v.center.lat) };
    radius.value = Number(v.radius) || null;
  } else {
    fenceType.value = 'NONE';
  }
}
applyModel(props.modelValue);

function onTypeChange() {
  emitCurrent();
}

function emitCurrent() {
  let val = null;
  if (fenceType.value === 'FREE') {
    const pts = freePoints.value;
    if (pts.every(p => p.lng != null && p.lat != null)) {
      val = { type: 'FREE', points: pts.map(p => ({ lng: Number(p.lng), lat: Number(p.lat) })) };
    }
  } else if (fenceType.value === 'RADIUS') {
    if (center.value.lng != null && center.value.lat != null && radius.value) {
      val = {
        type: 'RADIUS',
        center: { lng: Number(center.value.lng), lat: Number(center.value.lat) },
        radius: Number(radius.value),
      };
    }
  }
  emit('update:modelValue', val);
}

// 任一数值变化即上报
watch([freePoints, center, radius], emitCurrent, { deep: true });
</script>

<style scoped>
.fence-editor { display: flex; flex-direction: column; gap: 8px; }
.hint { font-size: 12px; color: #909399; }
.pt-row { display: flex; align-items: center; gap: 8px; }
.pt-idx { width: 56px; flex: none; color: #606266; font-size: 13px; }
.coord { width: 160px; }
.radius { width: 160px; }
.unit { color: #909399; font-size: 13px; }
</style>
