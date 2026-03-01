<template>
  <div class="flex-1 space-y-6 w-full animate-fade-in-up ">
    <section>
      <h2 class="text-xs font-bold uppercase tracking-widest text-primary mb-3 pl-1">
        {{ $t('settings.general') }}
      </h2>
      <div
        class="bg-surface-panel/50 border border-border/50 rounded-2xl flex flex-col divide-y divide-border/30 backdrop-blur-sm overflow-hidden shadow-sm">

        <!-- Language -->
        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-5 gap-4 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <div class="i-material-symbols-language text-xl"></div>
            </div>
            <div>
              <div class="font-bold text-sm">{{ $t('settings.language') }}</div>
            </div>
          </div>
          <div
            class="bg-surface-overlay/50 border border-border/30 rounded-xl p-1 flex gap-1 w-full sm:w-auto shrink-0">
            <button v-for="localeItem in availableLocales" :key="localeItem.code" @click="setLanguage(localeItem.code)"
              class="flex-1 sm:flex-none px-4 py-1.5 text-xs rounded-lg transition-all font-bold" :class="currentLocale === localeItem.code
                ? 'bg-surface text-primary shadow-sm ring-1 ring-border/50'
                : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-overlay/50'">
              {{ localeItem.name }}
            </button>
          </div>
        </div>

        <!-- Theme Mode -->
        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-5 gap-4 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <div class="i-material-symbols-brightness-6-outline text-xl"></div>
            </div>
            <div>
              <div class="font-bold text-sm">{{ $t('settings.theme_mode') }}</div>
            </div>
          </div>
          <div
            class="bg-surface-overlay/50 border border-border/30 rounded-xl p-1 flex gap-1 w-full sm:w-auto shrink-0">
            <button v-for="mode in themeModes" :key="mode.value" @click="setTheme(mode.value)"
              class="flex-1 sm:flex-none px-4 py-1.5 text-xs rounded-lg transition-all font-bold flex items-center justify-center gap-1.5"
              :class="theme === mode.value
                ? 'bg-surface text-primary shadow-sm ring-1 ring-border/50'
                : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-overlay/50'">
              <div :class="mode.icon" class="text-base text-current"></div>
              <span class="hidden sm:inline">{{ mode.label }}</span>
            </button>
          </div>
        </div>

        <!-- Theme Color -->
        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-5 gap-4 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <div class="i-material-symbols-palette-outline text-xl"></div>
            </div>
            <div>
              <div class="font-bold text-sm">{{ $t('settings.theme_color') }}</div>
              <div class="text-xs text-on-surface-muted mt-0.5">{{ $t('settings.theme_desc') }}</div>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 shrink-0">
            <button v-for="color in themeColors" :key="color.value" @click="setThemeColor(color.value)"
              class="group relative w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ring-2 ring-offset-2 ring-offset-surface"
              :class="[
                color.bg,
                themeColor === color.value ? 'scale-110 shadow-md ring-current' : 'ring-transparent opacity-60 hover:opacity-100'
              ]" :title="color.label">
              <div v-if="themeColor === color.value"
                class="i-material-symbols-check text-white font-bold text-sm animate-scale-in">
              </div>
            </button>
          </div>
        </div>

        <!-- Window Close Behavior -->
        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-5 gap-4 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <div class="i-material-symbols-close-rounded text-xl"></div>
            </div>
            <div>
              <div class="font-bold text-sm">{{ $t('settings.window_close_behavior') }}</div>
              <div class="text-xs text-on-surface-muted mt-0.5 line-clamp-2">{{
                $t('settings.window_close_behavior_desc') }}</div>
            </div>
          </div>
          <div
            class="bg-surface-overlay/50 border border-border/30 rounded-xl p-1 flex gap-1 w-full sm:w-auto shrink-0">
            <button v-for="action in windowCloseActions" :key="action.value" @click="setWindowCloseAction(action.value)"
              class="flex-1 sm:flex-none px-4 py-1.5 text-xs rounded-lg transition-all font-bold" :class="settingsStore.windowCloseAction === action.value
                ? 'bg-surface text-primary shadow-sm ring-1 ring-border/50'
                : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-overlay/50'">
              {{ action.label }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Developer Section -->
    <section>
      <h2 class="text-xs font-bold uppercase tracking-widest text-primary mb-3 pl-1">
        {{ $t('settings.developer') }}
      </h2>
      <div
        class="bg-surface-panel/50 border border-border/50 rounded-2xl flex flex-col divide-y divide-border/30 backdrop-blur-sm overflow-hidden shadow-sm">
        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-5 gap-4 hover:bg-surface-overlay/30 transition-colors">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <div class="i-material-symbols-developer-mode-outline text-xl"></div>
            </div>
            <div>
              <div class="font-bold text-sm">{{ $t('settings.developer') }}</div>
            </div>
          </div>
          <div class="shrink-0">
            <n-button secondary class="glass-button" @click="openDevTools">
              {{ $t('settings.open_devtools') }}
            </n-button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { electronApi } from '@/api'
import { useTheme, type ThemeColor, type Theme } from '@/composables/useTheme'
import { useSettingsStore, type WindowCloseAction } from '@/stores/settings'

const { locale, t } = useI18n()
const { theme, setTheme, themeColor, setThemeColor } = useTheme()
const settingsStore = useSettingsStore()

const currentLocale = computed(() => settingsStore.language)
const availableLocales = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'en-US', name: 'English' }
]

const themeModes = computed<{ value: Theme, label: string, icon: string }[]>(() => [
  { value: 'light', label: t('settings.theme_light'), icon: 'i-material-symbols-light-mode-outline' },
  { value: 'dark', label: t('settings.theme_dark'), icon: 'i-material-symbols-dark-mode-outline' },
  { value: 'auto', label: t('settings.theme_auto'), icon: 'i-material-symbols-hdr-auto' }
])

const themeColors: { value: ThemeColor, label: string, bg: string }[] = [
  { value: 'green', label: 'Green', bg: 'bg-[#10b981]' },
  { value: 'blue', label: 'Blue', bg: 'bg-[#3b82f6]' },
  { value: 'purple', label: 'Purple', bg: 'bg-[#8b5cf6]' },
  { value: 'orange', label: 'Orange', bg: 'bg-[#f97316]' },
  { value: 'red', label: 'Red', bg: 'bg-[#ef4444]' }
]

const windowCloseActions = computed<{ value: WindowCloseAction, label: string }[]>(() => [
  { value: 'ask', label: t('settings.window_close_ask') },
  { value: 'minimize', label: t('settings.window_close_minimize') },
  { value: 'quit', label: t('settings.window_close_quit') }
])

function isWindowCloseAction(value: unknown): value is WindowCloseAction {
  return value === 'ask' || value === 'minimize' || value === 'quit'
}

function setLanguage(lang: string) {
  settingsStore.language = lang
  locale.value = lang
}

async function setWindowCloseAction(action: WindowCloseAction) {
  settingsStore.windowCloseAction = action
  try {
    await electronApi.setWindowCloseAction(action)
  } catch {
    // ignore
  }
}

onMounted(async () => {
  try {
    const action = await electronApi.getWindowCloseAction()
    if (isWindowCloseAction(action)) {
      settingsStore.windowCloseAction = action
    }
  } catch {
    // ignore
  }
})

function openDevTools() {
  window.electron.openDevTools()
}
</script>
