<template>
  <div class="image-list-upload">
    <div v-for="(url, i) in modelValue" :key="i" class="item">
      <el-image :src="url" fit="cover" style="width: 90px; height: 90px" :preview-src-list="modelValue" :initial-index="i" />
      <div class="mask">
        <el-icon size="18" color="#fff" style="cursor: pointer" @click="remove(i)"><Delete /></el-icon>
      </div>
    </div>
    <el-button v-if="modelValue.length < 9" :loading="uploading" class="add-btn" @click="pick">＋ 上传图片</el-button>
    <input ref="inputRef" type="file" accept="image/*" style="display: none" @change="onChange" />
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { uploadApi } from '../api';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
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
    emit('update:modelValue', [...props.modelValue, data.url]);
  } finally {
    uploading.value = false;
  }
}

function remove(i) {
  const list = [...props.modelValue];
  list.splice(i, 1);
  emit('update:modelValue', list);
}
</script>

<style scoped>
.image-list-upload { display: flex; flex-wrap: wrap; gap: 8px; }
.item { position: relative; width: 90px; height: 90px; border-radius: 6px; overflow: hidden; }
.mask {
  position: absolute; inset: 0; background: rgba(0,0,0,.45);
  display: none; align-items: center; justify-content: center;
}
.item:hover .mask { display: flex; }
.add-btn { width: 90px; height: 90px; }
</style>
