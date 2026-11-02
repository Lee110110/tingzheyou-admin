<template>
  <div class="image-upload">
    <div v-if="modelValue" class="preview">
      <el-image :src="modelValue" fit="cover" style="width: 100px; height: 100px" :preview-src-list="[modelValue]" />
      <div class="mask">
        <el-icon size="18" color="#fff" style="cursor: pointer" @click="clear"><Delete /></el-icon>
      </div>
    </div>
    <el-button v-else :loading="uploading" @click="pick">上传图片</el-button>
    <input ref="inputRef" type="file" accept="image/*" style="display: none" @change="onChange" />
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
  if (file.size > 10 * 1024 * 1024) return ElMessage.warning('图片不能超过 10MB');
  uploading.value = true;
  try {
    const data = await uploadApi.image(file);
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
.image-upload { display: inline-block; }
.preview { position: relative; width: 100px; height: 100px; border-radius: 6px; overflow: hidden; }
.mask {
  position: absolute; inset: 0; background: rgba(0,0,0,.45);
  display: none; align-items: center; justify-content: center;
}
.preview:hover .mask { display: flex; }
.hint { color: #909399; font-size: 12px; margin-top: 4px; }
</style>
