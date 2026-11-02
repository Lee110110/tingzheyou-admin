<template>
  <el-input-number
    :model-value="yuan"
    :min="0"
    :precision="2"
    :step="1"
    :controls="false"
    placeholder="金额（元）"
    style="width: 140px"
    @update:model-value="onUpdate"
  />
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: Number, default: null },
});
const emit = defineEmits(['update:modelValue']);

const yuan = computed(() => (props.modelValue == null ? null : props.modelValue / 100));

function onUpdate(v) {
  emit('update:modelValue', v == null || v === '' ? null : Math.round(Number(v) * 100));
}
</script>
