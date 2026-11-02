<template>
  <el-cascader
    :model-value="displayValue"
    :options="options"
    :props="cascaderProps"
    :placeholder="placeholder || (multiple ? '请选择省 / 市（可多选）' : '请选择省 / 市')"
    clearable
    :style="{ width: multiple ? '100%' : '240px' }"
    @update:model-value="onUpdate"
  />
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { getRegionTree } from '../utils/region';

const props = defineProps({
  modelValue: { type: Array, default: () => [] }, // 单选: [省code, 市code]；多选: 扁平的 code 数组
  placeholder: { type: String, default: '' },
  multiple: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const options = ref([]);
const codeToPath = ref({});

onMounted(async () => {
  const tree = await getRegionTree();
  options.value = tree;
  const map = {};
  tree.forEach(p => {
    map[p.code] = [p.code];
    p.children.forEach(c => { map[c.code] = [p.code, c.code]; });
  });
  codeToPath.value = map;
});

const cascaderProps = computed(() => ({ value: 'code', label: 'name', children: 'children', multiple: props.multiple }));

// 单选直接回显；多选把扁平 code 数组还原为级联路径
const displayValue = computed(() => {
  if (!props.multiple) return props.modelValue || [];
  return (props.modelValue || []).map(c => (codeToPath.value[c] || [c])).filter(p => p);
});

function onUpdate(val) {
  if (!props.multiple) {
    emit('update:modelValue', val || []);
    return;
  }
  // 多选：把 [[省,市],...] 拍平为去重后的 code 数组
  const codes = [];
  (val || []).forEach(path => path.forEach(c => { if (!codes.includes(c)) codes.push(c); }));
  emit('update:modelValue', codes);
}
</script>
