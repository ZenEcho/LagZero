import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

const savedLocale = localStorage.getItem('settings-language')
const defaultLocale = savedLocale && ['zh-CN', 'en-US'].includes(savedLocale) ? savedLocale : 'zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: defaultLocale, // default locale
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS
  }
})

export default i18n
