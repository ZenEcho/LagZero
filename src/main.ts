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
import { useLocalProxyStore } from './stores/local-proxy'

setupRuntimeLogging()

void initLatencySessionStore().catch((e) => {
  console.error('Failed to init latency session store:', e)
})

const app = createApp(App)
app.use(router)
app.use(pinia)
app.use(i18n)

const localProxyStore = useLocalProxyStore()
void localProxyStore.startLocalProxy('startup').catch((e) => {
  console.error('Failed to start local proxy on startup:', e)
})

app.mount('#app')
