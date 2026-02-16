<template>
  <button @click="toggleTheme"
    class="relative w-7 h-7 flex items-center justify-center rounded hover:bg-on-surface/10 transition-colors overflow-hidden group focus:outline-none"
    :title="$t('settings.toggle_theme')" :aria-label="$t('settings.toggle_theme')">
    <div class="relative w-5 h-5">
      <div
        class="absolute inset-0 transform transition-transform duration-300 ease-spring flex items-center justify-center text-on-surface-variant group-hover:text-on-surface"
        :class="resolvedTheme === 'dark' ? 'rotate-0 opacity-100' : 'rotate-90 opacity-0'">
        <div class="i-material-symbols-dark-mode text-lg"></div>
      </div>
      <div
        class="absolute inset-0 transform transition-transform duration-300 ease-spring flex items-center justify-center text-on-surface-variant group-hover:text-on-surface"
        :class="resolvedTheme === 'light' ? 'rotate-0 opacity-100' : '-rotate-90 opacity-0'">
        <div class="i-material-symbols-light-mode text-lg"></div>
      </div>
    </div>
  </button>
</template>

<script setup lang="ts">
import { useTheme } from '@/composables/useTheme'

const { resolvedTheme, toggleTheme } = useTheme()
</script>

<style scoped>
.ease-spring {
  transition-timing-function: cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
</style>
