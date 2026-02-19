<template>
  <aside class="w-64 flex-none flex flex-col gap-6">
    <div class="px-2">
      <h1 class="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
        {{ $t('common.settings') }}
      </h1>
      <p class="text-xs text-on-surface-muted mt-1 uppercase tracking-widest font-bold opacity-60">
        {{ $t('settings.preferences') }}
      </p>
    </div>

    <nav class="flex flex-col gap-2">
      <button v-for="tab in tabs" :key="tab.name" @click="$emit('update:modelValue', tab.name)"
        class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group relative overflow-hidden text-left"
        :class="modelValue === tab.name
          ? 'bg-primary/10 text-primary font-bold shadow-sm'
          : 'hover:bg-surface-overlay text-on-surface-muted hover:text-on-surface'">

        <!-- Active Indicator -->
        <div v-if="modelValue === tab.name"
          class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full"></div>

        <div
          :class="[tab.icon, modelValue === tab.name ? 'text-primary' : 'text-on-surface-muted group-hover:text-on-surface']"
          class="text-xl transition-colors"></div>
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <!-- App Info Small -->
    <div class="mt-auto px-4 py-4 rounded-xl bg-surface-panel/30 border border-border/50 backdrop-blur-sm">
      <div class="flex items-center gap-3 mb-2">
        <div class="w-8 h-8 rounded-lg bg-surface-panel flex items-center justify-center border border-border">
          <img src="/logo.svg" class="w-5 h-5" alt="Logo" />
        </div>
        <div>
          <div class="text-sm font-bold">{{ pkg.name }}</div>
          <div class="text-[10px] text-on-surface-muted font-mono">v{{ appVersion }}</div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import pkg from '../../../package.json'
import { useAppUpdater } from '@/composables/useAppUpdater'

defineProps<{
  modelValue: string
}>()

defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const { t } = useI18n()
const { appVersion } = useAppUpdater()

const tabs = computed(() => [
  { name: 'general', label: t('settings.general'), icon: 'i-material-symbols-tune' },
  { name: 'network', label: t('settings.network'), icon: 'i-material-symbols-wifi' },
  { name: 'logs', label: t('settings.logs'), icon: 'i-material-symbols-article' },
  { name: 'about', label: t('settings.about'), icon: 'i-material-symbols-info-outline' },
])
</script>
