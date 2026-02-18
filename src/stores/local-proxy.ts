import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Game } from '@/types'
import type { NodeConfig } from '@/utils/protocol'
import { generateSingboxConfig } from '@/utils/singbox-config'
import { useNodeStore } from './nodes'
import { useSettingsStore } from './settings'

const LOCAL_PROXY_HOSTS = ['www.google.com', 'www.apple.com']

function nodeKeyOf(node: NodeConfig): string {
  return String(node.id || node.tag || '')
}

function buildLocalProxyGame(): Game {
  return {
    id: '__local_proxy__',
    name: 'Local Proxy',
    processName: [],
    category: 'system',
    proxyMode: 'routing',
    routingRules: [],
    chainProxy: false
  }
}

export const useLocalProxyStore = defineStore('local-proxy', () => {
  const running = ref(false)
  const starting = ref(false)
  const activeNodeKey = ref('')

  async function verifyHostsViaLocalHttpProxy(httpPort: number): Promise<boolean> {
    for (const host of LOCAL_PROXY_HOSTS) {
      const res = await window.system.testHttpProxyConnect(httpPort, host, 443, 5000)
      if (!res?.ok) return false
    }
    return true
  }

  async function ensurePortAvailable(preferredPort: number): Promise<number> {
    const port = await window.system.findAvailablePort(preferredPort, 2)
    return port
  }

  async function applyNodeConfig(node: NodeConfig): Promise<void> {
    const settings = useSettingsStore()
    const localGame = buildLocalProxyGame()
    const config = generateSingboxConfig(localGame, node, {
      mode: settings.dnsMode,
      primary: settings.dnsPrimary,
      secondary: settings.dnsSecondary,
      tunInterfaceName: settings.tunInterfaceName,
      disableTun: true,
      localProxy: {
        enabled: true,
        port: settings.localProxyPort
      }
    })
    await window.proxyMonitor.stop()
    await window.singbox.restart(config)
  }

  function resolveFixedNode(nodes: NodeConfig[], fixedIndex: number): NodeConfig | null {
    if (nodes.length === 0) return null
    const idx = Math.max(1, Math.floor(fixedIndex || 1)) - 1
    return nodes[idx] || nodes[0] || null
  }

  async function startLocalProxy(reason: 'startup' | 'settings' = 'startup'): Promise<boolean> {
    if (starting.value) return false

    const settings = useSettingsStore()
    const nodeStore = useNodeStore()

    if (!settings.localProxyEnabled) {
      running.value = false
      activeNodeKey.value = ''
      return false
    }

    starting.value = true
    try {
      if (nodeStore.nodes.length === 0) {
        await nodeStore.loadNodes()
      }
      const nodes = nodeStore.nodes.slice()
      if (nodes.length === 0) {
        running.value = false
        activeNodeKey.value = ''
        return false
      }

      const availablePort = await ensurePortAvailable(settings.localProxyPort)
      settings.localProxyPort = availablePort

      if (!settings.localProxyNodeRecursiveTest) {
        const fixed = resolveFixedNode(nodes, settings.localProxyFixedNodeIndex)
        if (!fixed) return false
        await applyNodeConfig(fixed)
        running.value = true
        activeNodeKey.value = nodeKeyOf(fixed)
        return true
      }

      for (const node of nodes) {
        try {
          await applyNodeConfig(node)
          const ok = await verifyHostsViaLocalHttpProxy(settings.localProxyPort)
          if (!ok) continue
          running.value = true
          activeNodeKey.value = nodeKeyOf(node)
          return true
        } catch {
          // Try next node.
        }
      }

      await window.proxyMonitor.stop()
      await window.singbox.stop()
      running.value = false
      activeNodeKey.value = ''
      return false
    } finally {
      starting.value = false
    }
  }

  async function stopLocalProxy(): Promise<void> {
    await window.proxyMonitor.stop()
    await window.singbox.stop()
    running.value = false
    activeNodeKey.value = ''
  }

  async function applySettingsChange(): Promise<void> {
    const settings = useSettingsStore()
    if (!settings.localProxyEnabled) {
      await stopLocalProxy()
      return
    }
    await startLocalProxy('settings')
  }

  function setActiveNode(nodeKey: string) {
    activeNodeKey.value = nodeKey
    running.value = true
  }

  return {
    running,
    starting,
    activeNodeKey,
    startLocalProxy,
    stopLocalProxy,
    applySettingsChange,
    setActiveNode
  }
})
