import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

function isSupportedLocale(value: string | null): value is SupportedLocale {
  return !!value && SUPPORTED_LOCALES.includes(value as SupportedLocale)
}

function resolveInitialLocale(): SupportedLocale {
  const savedLocale = localStorage.getItem('settings-language')
  return isSupportedLocale(savedLocale) ? savedLocale : 'zh-CN'
}

const i18n = createI18n({
  legacy: false,
  locale: resolveInitialLocale(),
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS
  }
})

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== 'settings-language') return
    if (!isSupportedLocale(event.newValue)) return
    if (i18n.global.locale.value === event.newValue) return
    i18n.global.locale.value = event.newValue
  })
}

export default i18n
