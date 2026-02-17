import { defineConfig, presetUno, presetAttributify, presetIcons, transformerDirectives } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      warn: true,
      collections: {
        carbon: () => import('@iconify-json/carbon/icons.json').then((i) => i.default),
        'material-symbols': () => import('@iconify-json/material-symbols/icons.json').then((i) => i.default),
      },
    }),
  ],
  transformers: [
    transformerDirectives(),
  ],
  theme: {
    breakpoints: {
      xs: '480px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
    },
    colors: {
      primary: 'rgba(var(--rgb-primary), <alpha-value>)',
      'primary-hover': 'rgba(var(--rgb-primary-hover), <alpha-value>)',
      'on-primary': 'rgba(var(--rgb-on-primary), <alpha-value>)',

      secondary: 'rgba(var(--rgb-secondary), <alpha-value>)',
      'secondary-hover': 'rgba(var(--rgb-secondary-hover), <alpha-value>)',
      'on-secondary': 'rgba(var(--rgb-on-secondary), <alpha-value>)',

      success: 'rgba(var(--rgb-success), <alpha-value>)',
      'success-bg': 'rgba(var(--rgb-success-bg), <alpha-value>)',
      'on-success': 'rgba(var(--rgb-on-success), <alpha-value>)',

      warning: 'rgba(var(--rgb-warning), <alpha-value>)',
      'warning-bg': 'rgba(var(--rgb-warning-bg), <alpha-value>)',
      'on-warning': 'rgba(var(--rgb-on-warning), <alpha-value>)',

      error: 'rgba(var(--rgb-error), <alpha-value>)',
      'error-bg': 'rgba(var(--rgb-error-bg), <alpha-value>)',
      'on-error': 'rgba(var(--rgb-on-error), <alpha-value>)',

      info: 'rgba(var(--rgb-info), <alpha-value>)',
      'info-bg': 'rgba(var(--rgb-info-bg), <alpha-value>)',
      'on-info': 'rgba(var(--rgb-on-info), <alpha-value>)',

      // Semantic Surface Colors
      background: 'rgba(var(--rgb-background), <alpha-value>)',
      surface: 'rgba(var(--rgb-surface), <alpha-value>)',
      'surface-panel': 'rgba(var(--rgb-surface-panel), <alpha-value>)',
      'surface-overlay': 'rgba(var(--rgb-surface-overlay), <alpha-value>)',

      // Semantic Text Colors
      'on-surface': 'rgba(var(--rgb-on-surface), <alpha-value>)',
      'on-surface-variant': 'rgba(var(--rgb-on-surface-variant), <alpha-value>)',
      'on-surface-muted': 'rgba(var(--rgb-on-surface-muted), <alpha-value>)',

      // Borders
      border: 'rgba(var(--rgb-border), <alpha-value>)',
      'border-hover': 'rgba(var(--rgb-border-hover), <alpha-value>)',

      // Overlay
      overlay: 'rgba(var(--rgb-overlay), <alpha-value>)',

      // Legacy support (to be refactored)
      dark: {
        bg: 'rgba(var(--rgb-surface), <alpha-value>)',
        panel: 'rgba(var(--rgb-surface-panel), <alpha-value>)',
      }
    }
  }
})
