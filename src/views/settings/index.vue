<template>
  <div class="p-6">
    <h1 class="text-2xl font-bold mb-4 text-on-surface">{{ $t('common.settings') }}</h1>

    <div class="bg-surface-panel p-6 rounded-lg space-y-6 border border-border">
      <!-- Language Settings -->
      <div>
        <h2 class="text-lg mb-4 text-on-surface-variant">{{ $t('settings.language') }}</h2>
        <div class="flex gap-4">
          <button v-for="locale in availableLocales" :key="locale.code" @click="setLanguage(locale.code)"
            class="px-4 py-2 rounded transition border" :class="currentLocale === locale.code
              ? 'bg-primary border-primary text-on-primary'
              : 'bg-surface border-border text-on-surface-muted hover:border-border-hover hover:text-on-surface'">
            {{ locale.name }}
          </button>
        </div>
      </div>

      <!-- Theme Settings -->
      <div>
        <h2 class="text-lg mb-4 text-on-surface-variant">{{ $t('settings.theme_color') }}</h2>
        <div class="flex gap-4">
          <button v-for="color in themeColors" :key="color.value" @click="setThemeColor(color.value)"
            class="w-10 h-10 rounded-full flex items-center justify-center transition border-2" :class="[
              color.bg,
              themeColor === color.value ? 'border-on-surface scale-110' : 'border-transparent hover:scale-105'
            ]" :title="color.label">
            <div v-if="themeColor === color.value" class="i-material-symbols-check text-white font-bold"></div>
          </button>
        </div>
      </div>


      <!-- Network Settings -->
      <div>
        <h2 class="text-lg mb-4 text-on-surface-variant">{{ $t('settings.network') }}</h2>
        <div class="space-y-4 max-w-md">
          <!-- Check Method -->
          <div class="flex items-center justify-between">
            <span class="text-on-surface">{{ $t('settings.check_method') }}</span>
            <div class="flex bg-surface-overlay rounded-lg p-1">
              <button v-for="method in ['ping', 'tcp']" :key="method" @click="setCheckMethod(method)"
                class="px-3 py-1 text-sm rounded transition" :class="settingsStore.checkMethod === method
                  ? 'bg-surface shadow text-on-surface'
                  : 'text-on-surface-muted hover:text-on-surface'">
                {{ method.toUpperCase() }}
              </button>
            </div>
          </div>

          <!-- Interval -->
          <div class="flex items-center justify-between">
            <span class="text-on-surface">{{ $t('settings.check_interval') }}</span>
            <select v-model.number="settingsStore.checkInterval"
              class="bg-surface border border-border rounded px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:border-primary">
              <option :value="1000">1s</option>
              <option :value="2000">2s</option>
              <option :value="5000">5s</option>
              <option :value="10000">10s</option>
              <option :value="30000">30s</option>
              <option :value="60000">1m</option>
            </select>
          </div>
        </div>
      </div>

      <div class="pt-4 border-t border-border">
        <p class="text-on-surface-muted">{{ $t('settings.coming_soon') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTheme, type ThemeColor } from '@/composables/useTheme'
import { useSettingsStore } from '@/stores/settings'

const { locale } = useI18n()
const { themeColor, setThemeColor } = useTheme()
const settingsStore = useSettingsStore()

const currentLocale = computed(() => locale.value)

const availableLocales = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'en-US', name: 'English' }
]

const themeColors: { value: ThemeColor, label: string, bg: string }[] = [
  { value: 'green', label: 'Green', bg: 'bg-[#3eaf7c]' },
  { value: 'blue', label: 'Blue', bg: 'bg-[#3b82f6]' },
  { value: 'purple', label: 'Purple', bg: 'bg-[#8b5cf6]' },
  { value: 'orange', label: 'Orange', bg: 'bg-[#f97316]' },
  { value: 'red', label: 'Red', bg: 'bg-[#ef4444]' }
]

function setCheckMethod(method: string) {
  // @ts-ignore
  settingsStore.checkMethod = method
}

function setLanguage(lang: string) {
  locale.value = lang
  // In a real app, you might want to save this to localStorage or electron-store
}
</script>
