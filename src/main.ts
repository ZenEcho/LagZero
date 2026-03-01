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
  console.error('初始化延迟会话存储失败:', e)
})

const app = createApp(App)
app.use(router)
app.use(pinia)
app.use(i18n)

// 托盘窗口（#/tray）不需要初始化业务 store 和本地代理逻辑
// 这些只在主窗口中运行
const isTrayWindow = window.location.hash.includes('/tray')

if (!isTrayWindow) {
  const localProxyStore = useLocalProxyStore()
  const nodeStore = useNodeStore()
  const settingsStore = useSettingsStore()
  let pendingStartAfterStarting = false

  void localProxyStore.startLocalProxy('startup').catch((e) => {
    console.error('启动时启动本地代理失败:', e)
  })

  watch(
    () => nodeStore.nodes.length,
    (len) => {
      if (len <= 0) {
        pendingStartAfterStarting = false
        if (localProxyStore.running || localProxyStore.starting) {
          void localProxyStore.stopLocalProxy().catch((e) => {
            console.error('节点不可用后停止本地代理失败:', e)
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
        console.error('处理本地代理节点列表变更失败:', e)
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
        console.error('挂起启动后恢复本地代理自动启动失败:', e)
      })
    }
  )
}

app.mount('#app')
