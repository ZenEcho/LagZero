<template>
  <n-config-provider :theme="theme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <n-modal-provider>
            <router-view />
          </n-modal-provider>
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { darkTheme, type GlobalThemeOverrides } from 'naive-ui'
import { useTheme, type ThemeColor } from './composables/useTheme'

const { isDark, themeColor } = useTheme()

const theme = computed(() => isDark.value ? darkTheme : null)

const themeColors: Record<ThemeColor, { primary: string; hover: string; pressed: string }> = {
  green: { primary: '#10b981', hover: '#059669', pressed: '#047857' },
  blue: { primary: '#3b82f6', hover: '#2563eb', pressed: '#1d4ed8' },
  purple: { primary: '#8b5cf6', hover: '#7c3aed', pressed: '#6d28d9' },
  orange: { primary: '#f97316', hover: '#ea580c', pressed: '#c2410c' },
  red: { primary: '#ef4444', hover: '#dc2626', pressed: '#b91c1c' },
}

const themeOverrides = computed<GlobalThemeOverrides>(() => {
  const color = themeColors[themeColor.value] || themeColors.green

  const common = {
    primaryColor: color.primary,
    primaryColorHover: color.hover,
    primaryColorPressed: color.pressed,
    primaryColorSuppl: color.hover,
  }

  return {
    common,
    Button: {
      textColorPrimary: '#ffffff',
      textColorHoverPrimary: '#ffffff',
      textColorPressedPrimary: '#ffffff',
      textColorFocusPrimary: '#ffffff',
      textColorDisabledPrimary: '#ffffff',
      colorPrimary: color.primary,
      colorHoverPrimary: color.hover,
      colorPressedPrimary: color.pressed,
      colorFocusPrimary: color.hover,
      colorDisabledPrimary: color.primary,
      borderPrimary: `1px solid ${color.primary}`,
      borderHoverPrimary: `1px solid ${color.hover}`,
      borderPressedPrimary: `1px solid ${color.pressed}`,
      borderFocusPrimary: `1px solid ${color.hover}`,
      borderDisabledPrimary: `1px solid ${color.primary}`,
      // Also ensure error/warning buttons have white text
      textColorError: '#ffffff',
      textColorHoverError: '#ffffff',
      textColorPressedError: '#ffffff',
      textColorFocusError: '#ffffff',
      textColorWarning: '#ffffff',
      textColorHoverWarning: '#ffffff',
      textColorPressedWarning: '#ffffff',
      textColorFocusWarning: '#ffffff',
    }
  }
})
</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap');

html,
body,
#app {
  height: 100%;
  width: 100%;
  margin: 0;
  overflow: hidden;
  background-color: var(--color-background);
  color: var(--color-on-surface);
  font-family: 'Noto Sans SC', 'Source Han Sans SC', system-ui, -apple-system, sans-serif;
}
</style>
