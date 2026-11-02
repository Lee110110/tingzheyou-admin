<template>
  <div class="audio-upload">
    <template v-if="modelValue">
      <audio :src="modelValue" controls style="height: 36px" />
      <el-button link type="danger" @click="clear">删除</el-button>
    </template>
    <el-button v-else :loading="uploading" @click="pick">上传音频</el-button>
    <input ref="inputRef" type="file" accept="audio/*" style="display: none" @change="onChange" />
    <div v-if="hint" class="hint">{{ hint }}</div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { uploadApi } from '../api';

const props = defineProps({
  modelValue: { type: String, default: '' },
  hint: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const uploading = ref(false);
const inputRef = ref(null);

function pick() {
  inputRef.value.click();
}

async function onChange(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) return ElMessage.warning('音频不能超过 50MB');
  uploading.value = true;
  try {
    const data = await uploadApi.audio(file);
    emit('update:modelValue', data.url);
  } finally {
    uploading.value = false;
  }
}

function clear() {
  emit('update:modelValue', '');
}
</script>

<style scoped>
.audio-upload { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.hint { color: #909399; font-size: 12px; width: 100%; }
</style>
