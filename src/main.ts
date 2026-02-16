import { createApp } from 'vue'
import 'virtual:uno.css'
import '@unocss/reset/tailwind.css'
import './style.css'
import './styles/themes.css'
import App from './App.vue'
import router from './router'
import pinia from './stores'
import i18n from './i18n'

createApp(App)
  .use(router)
  .use(pinia)
  .use(i18n)
  .mount('#app')
