<template>
  <n-modal
    :show="modelValue"
    @update:show="$emit('update:modelValue', $event)"
    preset="card"
    :title="$t('common.import')"
    class="w-[600px]"
    :mask-closable="false"
  >
    <div class="flex flex-col gap-4">
      <p class="text-sm text-on-surface-muted">{{ $t('common.paste_link') }}</p>
      <n-input
        v-model:value="content"
        type="textarea"
        :rows="10"
        class="font-mono"
        placeholder="vmess://...&#10;ss://...&#10;https://subscription-url..."
      />
      
      <div class="text-xs text-on-surface-muted">
        Supported formats: VMess, VLESS, Shadowsocks, Trojan links, or Base64 subscription content.
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <n-button @click="close">{{ $t('common.cancel') }}</n-button>
        <n-button 
          type="primary" 
          @click="handleImport" 
          :loading="isImporting"
          :disabled="!content"
        >
          {{ $t('common.import') }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useNodeStore } from '@/stores/nodes'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'imported', count: number): void
}>()

const { t } = useI18n()
const message = useMessage()
const nodeStore = useNodeStore()
const content = ref('')
const isImporting = ref(false)

async function handleImport() {
  if (!content.value) return
  
  isImporting.value = true
  try {
    const count = await nodeStore.addNodes(content.value)
    if (count > 0) {
      emit('imported', count)
      message.success(t('common.import_success', { count }))
      close()
    } else {
      message.error(t('common.import_fail'))
    }
  } catch (e) {
    console.error(e)
    message.error('Import failed')
  } finally {
    isImporting.value = false
  }
}

function close() {
  content.value = ''
  emit('update:modelValue', false)
}
</script>
