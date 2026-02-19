import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { Theme, ThemeColor } from '@/types'

export type { Theme, ThemeColor }

const theme = ref<Theme>('auto')
const resolvedTheme = ref<'light' | 'dark'>('dark') // Default to dark
const themeColor = ref<ThemeColor>('green')

export function useTheme() {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

  function applyTheme() {
    const root = document.documentElement
    const isDark = theme.value === 'dark' || (theme.value === 'auto' && mediaQuery.matches)
    
    resolvedTheme.value = isDark ? 'dark' : 'light'
    
    // Apply dark mode
    if (isDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }

    // Apply theme color
    // Remove previous theme classes
    root.classList.remove('theme-green', 'theme-blue', 'theme-purple', 'theme-orange', 'theme-red')
    root.classList.add(`theme-${themeColor.value}`)
  }

  function setTheme(newTheme: Theme) {
    theme.value = newTheme
    localStorage.setItem('theme', newTheme)
    applyTheme()
  }

  function setThemeColor(color: ThemeColor) {
    themeColor.value = color
    localStorage.setItem('themeColor', color)
    applyTheme()
  }

  function toggleTheme() {
    const next = resolvedTheme.value === 'dark' ? 'light' : 'dark'
    setTheme(next)
  }

  function handleSystemChange() {
    if (theme.value === 'auto') {
      applyTheme()
    }
  }

  onMounted(() => {
    const savedTheme = localStorage.getItem('theme') as Theme
    if (savedTheme && ['light', 'dark', 'auto'].includes(savedTheme)) {
      theme.value = savedTheme
    }
    
    const savedColor = localStorage.getItem('themeColor') as ThemeColor
    if (savedColor && ['green', 'blue', 'purple', 'orange', 'red'].includes(savedColor)) {
      themeColor.value = savedColor
    }

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
