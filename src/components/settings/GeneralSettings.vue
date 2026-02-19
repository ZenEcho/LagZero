<template>
  <div class="space-y-8 max-w-3xl animate-fade-in-up">
    <!-- Language Section -->
    <section>
      <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
        <div class="i-material-symbols-language text-primary"></div>
        {{ $t('settings.language') }}
      </h2>
      <div class="bg-surface/50 border border-border/50 rounded-2xl p-1 flex gap-2 w-fit backdrop-blur-sm">
        <button v-for="localeItem in availableLocales" :key="localeItem.code" @click="setLanguage(localeItem.code)"
          class="px-6 py-2.5 rounded-xl transition-all duration-200 font-medium relative overflow-hidden" :class="currentLocale === localeItem.code
            ? 'bg-surface text-primary shadow-sm ring-1 ring-border/50'
            : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-overlay/50'">
          {{ localeItem.name }}
        </button>
      </div>
    </section>

    <div class="w-full h-px bg-border/30"></div>

    <!-- Theme Section -->
    <section>
      <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
        <div class="i-material-symbols-palette-outline text-primary"></div>
        {{ $t('settings.theme_color') }}
      </h2>
      <div class="bg-surface-panel/50 border border-border/50 rounded-2xl p-6 backdrop-blur-sm">
        <div class="flex flex-wrap gap-4">
          <button v-for="color in themeColors" :key="color.value" @click="setThemeColor(color.value)"
            class="group relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300"
            :class="[
              color.bg,
              themeColor === color.value ? 'scale-110 shadow-lg ring-2 ring-offset-2 ring-offset-surface ring-current' : 'opacity-70 hover:opacity-100 hover:scale-105'
            ]" :title="color.label">
            <div v-if="themeColor === color.value"
              class="i-material-symbols-check text-white font-bold text-xl animate-scale-in">
            </div>
          </button>
        </div>
        <p class="mt-4 text-sm text-on-surface-muted">
          {{ $t('settings.theme_desc') }}
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTheme, type ThemeColor } from '@/composables/useTheme'

const { locale } = useI18n()
const { themeColor, setThemeColor } = useTheme()

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

function setLanguage(lang: string) {
  locale.value = lang
}
</script>


