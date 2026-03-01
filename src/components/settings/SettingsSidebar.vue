<template>
  <aside class="flex flex-col h-full py-8 px-4 gap-6">
    <div class="px-2">
      <h1 class="text-2xl font-bold tracking-tight">
        {{ $t('common.settings') }}
      </h1>
      <p class="text-xs text-on-surface-muted mt-0.5">
        {{ $t('settings.preferences') }}
      </p>
    </div>

    <nav class="flex flex-col gap-1">
      <button v-for="tab in tabs" :key="tab.name" @click="$emit('update:modelValue', tab.name)"
        class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-left font-medium" :class="modelValue === tab.name
          ? 'bg-primary/10 text-primary shadow-sm'
          : 'hover:bg-surface-overlay text-on-surface-muted hover:text-on-surface'">

        <div :class="[tab.icon, modelValue === tab.name ? 'text-primary' : 'text-on-surface-muted']"
          class="text-lg transition-colors"></div>
        <span class="text-sm">{{ tab.label }}</span>
      </button>
    </nav>


  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  modelValue: string
}>()

defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const { t } = useI18n()


const tabs = computed(() => [
  { name: 'general', label: t('settings.general'), icon: 'i-material-symbols-tune' },
  { name: 'network', label: t('settings.network'), icon: 'i-material-symbols-wifi' },
  { name: 'logs', label: t('settings.logs'), icon: 'i-material-symbols-article' },
  { name: 'about', label: t('settings.about'), icon: 'i-material-symbols-info-outline' },
])
</script>
