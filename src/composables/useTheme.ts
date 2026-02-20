import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { Theme, ThemeColor } from '@/types'

export type { Theme, ThemeColor }

export function useTheme() {
  const settingsStore = useSettingsStore()
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)') // 监听系统主题变化
  const resolvedTheme = ref<'light' | 'dark'>('dark') 

  // Keep compatibility with existing code
  const theme = computed({
    get: () => settingsStore.theme,
    set: (val) => settingsStore.theme = val
  })
  
  const themeColor = computed({
    get: () => settingsStore.themeColor,
    set: (val) => settingsStore.themeColor = val
  })

  function applyTheme() {
    const root = document.documentElement
    const currentTheme = settingsStore.theme
    const isDark = currentTheme === 'dark' || (currentTheme === 'auto' && mediaQuery.matches)
    
    resolvedTheme.value = isDark ? 'dark' : 'light'
    
    // Apply dark mode
    if (isDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }

    // Apply theme color
    root.classList.remove('theme-green', 'theme-blue', 'theme-purple', 'theme-orange', 'theme-red')
    root.classList.add(`theme-${settingsStore.themeColor}`)
  }

  function setTheme(newTheme: Theme) {
    settingsStore.theme = newTheme
  }

  function setThemeColor(color: ThemeColor) {
    settingsStore.themeColor = color
  }

  function toggleTheme() {
    const next = resolvedTheme.value === 'dark' ? 'light' : 'dark'
    // If auto, force set to opposite of current resolved
    setTheme(next)
  }

  function handleSystemChange() {
    if (settingsStore.theme === 'auto') {
      applyTheme()
    }
  }

  // Sync with store changes
  watch(
    () => [settingsStore.theme, settingsStore.themeColor],
    () => {
      applyTheme()
    }
  )

  onMounted(() => {
    // Initial apply
    applyTheme()
    mediaQuery.addEventListener('change', handleSystemChange)
  })

  onUnmounted(() => {
    mediaQuery.removeEventListener('change', handleSystemChange)
  })

  const isDark = computed(() => resolvedTheme.value === 'dark')

  return {
    theme,
    resolvedTheme,
    isDark,
    themeColor,
    setTheme,
    setThemeColor,
    toggleTheme
  }
}
