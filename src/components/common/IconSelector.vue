<template>
  <div class="flex items-center gap-2 w-full">
    <div class="w-10 h-10 bg-surface rounded border border-border overflow-hidden flex items-center justify-center">
      <img v-if="modelValue" :src="modelValue" class="w-full h-full object-cover" />
      <div v-else class="i-material-symbols-image text-xl text-on-surface-muted"></div>
    </div>
    <n-input :value="modelValue || ''" @update:value="$emit('update:modelValue', $event)" placeholder="支持 URL 或 file://..." />
    <n-button @click="handlePickImage">选择文件</n-button>
    <n-button quaternary @click="$emit('update:modelValue', '')">清空</n-button>
  </div>
</template>

<script setup lang="ts">
import { useFilePicker } from '@/composables/useFilePicker'

defineProps<{
  modelValue?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const { pickImage } = useFilePicker()

async function handlePickImage() {
  const url = await pickImage()
  if (url) {
    emit('update:modelValue', url)
  }
}
</script>
