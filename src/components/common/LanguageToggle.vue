<template>
  <button @click="toggleLanguage"
    class="relative w-7 h-7 flex items-center justify-center rounded hover:bg-on-surface/10 transition-colors overflow-hidden group focus:outline-none"
    :title="$t('settings.language')" :aria-label="$t('settings.language')">
    <div class="relative w-5 h-5">
      <div
        class="absolute inset-0 transform transition-transform duration-300 ease-spring flex items-center justify-center text-on-surface-variant group-hover:text-on-surface font-bold text-xs"
        :class="isZh ? 'opacity-100 scale-100' : 'opacity-0 scale-75'">
        ZH
      </div>
      <div
        class="absolute inset-0 transform transition-transform duration-300 ease-spring flex items-center justify-center text-on-surface-variant group-hover:text-on-surface font-bold text-xs"
        :class="!isZh ? 'opacity-100 scale-100' : 'opacity-0 scale-75'">
        EN
      </div>
    </div>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useI18n } from 'vue-i18n'

const settingsStore = useSettingsStore()
const { locale } = useI18n()

const isZh = computed(() => settingsStore.language === 'zh-CN')

function toggleLanguage() {
  const next = isZh.value ? 'en-US' : 'zh-CN'
  settingsStore.language = next
  locale.value = next
}
</script>

<style scoped>
.ease-spring {
  transition-timing-function: cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
</style>
