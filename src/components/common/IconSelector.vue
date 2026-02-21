<template>
  <div class="flex flex-col sm:flex-row gap-4 w-full">
    <!-- Image Preview Area -->
    <div 
      class="group relative w-full sm:w-32 h-32 flex-shrink-0 bg-surface-variant/30 rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-all duration-300 overflow-hidden flex items-center justify-center cursor-pointer"
      @click="handlePickImage"
    >
      <!-- Image Display -->
      <img v-if="modelValue" :src="modelValue" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
      
      <!-- Placeholder -->
      <div v-else class="flex flex-col items-center justify-center text-on-surface-muted gap-2 p-4 text-center">
        <div class="i-material-symbols-add-photo-alternate-outline text-3xl opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all"></div>
        <span class="text-[10px] font-medium opacity-70 group-hover:opacity-100 transition-opacity">点击上传</span>
      </div>

      <!-- Hover Overlay (Only when has image) -->
      <div v-if="modelValue" class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
        <div class="text-white text-xs font-medium flex items-center gap-1 bg-black/30 px-2 py-1 rounded-full border border-white/20">
          <div class="i-material-symbols-edit"></div>
          更换
        </div>
      </div>
    </div>

    <!-- Controls Area -->
    <div class="flex-1 flex flex-col justify-between py-1 min-w-0 gap-3">
      <div class="space-y-1">
        <div class="flex items-center justify-between">
          <label class="text-xs font-medium text-on-surface-muted">图片链接</label>
          <n-button v-if="modelValue"  type="error" size="small" @click="$emit('update:modelValue', '')" class="text-[10px] opacity-80 hover:opacity-100">
            <template #icon><div class="i-material-symbols-delete-outline"></div></template>
            移除图片
          </n-button>
        </div>
        
        <n-input-group>
          <n-input 
            :value="modelValue || ''" 
            @update:value="$emit('update:modelValue', $event)"
            placeholder="https://... 或 file://..." 
            size="small"
            class="flex-1"
          >
            <template #prefix>
              <div class="i-material-symbols-link text-on-surface-muted"></div>
            </template>
          </n-input>
          <n-button ghost size="small" @click="handlePickImage" title="从本地选择">
            <template #icon>
              <div class="i-material-symbols-folder-open-outline"></div>
            </template>
          </n-button>
        </n-input-group>
      </div>

      <div class="text-[10px] text-on-surface-muted leading-relaxed bg-surface-variant/20 p-2 rounded-lg border border-border/30">
        <div class="flex items-start gap-1.5">
          <div class="i-material-symbols-info-outline mt-0.5 text-primary/70 flex-shrink-0"></div>
          <span>支持 JPG, PNG, WEBP, GIF 格式。推荐尺寸 16:9 或 1:1，建议使用网络图片地址以获得更好的跨设备体验。</span>
        </div>
      </div>
    </div>
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