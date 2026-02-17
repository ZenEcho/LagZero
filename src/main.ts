import { createApp } from 'vue'
import 'virtual:uno.css'
import '@unocss/reset/tailwind.css'
import './style.css'
import './styles/themes.css'
import App from './App.vue'
import router from './router'
import pinia from './stores'
import i18n from './i18n'
import { initLatencySessionStore } from './utils/latency-session'
import { setupRuntimeLogging } from './utils/runtime-logger'

setupRuntimeLogging()

void initLatencySessionStore().catch((e) => {
  console.error('Failed to init latency session store:', e)
})

createApp(App)
  .use(router)
  .use(pinia)
  .use(i18n)
  .mount('#app')
