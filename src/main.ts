import { createApp, watch } from 'vue'
import 'virtual:uno.css'
import '@unocss/reset/tailwind.css'
import './assets/main.css'
import App from './App.vue'
import router from './router'
import pinia from './stores'
import i18n from './i18n'
import { initLatencySessionStore } from './utils/latency-session'
import { setupRuntimeLogging } from './utils/runtime-logger'
import { useLocalProxyStore } from './stores/local-proxy'
import { useNodeStore } from './stores/nodes'
import { useSettingsStore } from './stores/settings'

setupRuntimeLogging()

void initLatencySessionStore().catch((e) => {
  console.error('Failed to init latency session store:', e)
})

const app = createApp(App)
app.use(router)
app.use(pinia)
app.use(i18n)

const localProxyStore = useLocalProxyStore()
const nodeStore = useNodeStore()
const settingsStore = useSettingsStore()
let pendingStartAfterStarting = false

void localProxyStore.startLocalProxy('startup').catch((e) => {
  console.error('Failed to start local proxy on startup:', e)
})

watch(
  () => nodeStore.nodes.length,
  (len) => {
    if (len <= 0) {
      pendingStartAfterStarting = false
      if (localProxyStore.running || localProxyStore.starting) {
        void localProxyStore.stopLocalProxy().catch((e) => {
          console.error('Failed to stop local proxy after nodes became unavailable:', e)
        })
      }
      return
    }

    if (!settingsStore.localProxyEnabled) return
    if (localProxyStore.starting) {
      pendingStartAfterStarting = true
      return
    }

    void localProxyStore.handleNodeListChanged().catch((e) => {
      console.error('Failed to handle node list change for local proxy:', e)
    })
  }
)

watch(
  () => localProxyStore.starting,
  (starting, prev) => {
    if (!prev || starting) return
    if (!pendingStartAfterStarting) return

    pendingStartAfterStarting = false
    if (!settingsStore.localProxyEnabled) return
    if (localProxyStore.running) return
    if (nodeStore.nodes.length <= 0) return

    void localProxyStore.startLocalProxy('settings').catch((e) => {
      console.error('Failed to resume local proxy auto-start after pending start:', e)
    })
  }
)

app.mount('#app')
