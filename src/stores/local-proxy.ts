import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import type { Game } from '@/types'
import type { NodeConfig } from '@/types'
import { generateSingboxConfig } from '@/utils/singbox-config'
import { useNodeStore } from './nodes'
import { useSettingsStore } from './settings'
import { systemApi, singboxApi, proxyMonitorApi } from '@/api'
import i18n from '@/i18n'
import { nodeKeyOf, sleep } from '@shared/utils'
import {
  DEFAULT_DNS_PRIMARY,
  DEFAULT_DNS_SECONDARY,
  LOCAL_PROXY_HOSTS,
  LOCAL_PROXY_NODE_CHECK_RETRIES,
  LOCAL_PROXY_NODE_CHECK_RETRY_DELAY_MS,
  LOCAL_PROXY_NODE_APPLY_WARMUP_MS,
  LOCAL_PROXY_NODE_CHECK_TIMEOUT_MS,
  LOCAL_PROXY_RECHECK_INTERVAL_MS
} from '@/constants'

const NODE_CHECK_CACHE_TTL_SUCCESS_MS = 24 * 60 * 60 * 1000
const NODE_CHECK_CACHE_TTL_FAIL_MS = 2 * 60 * 1000
const NON_CACHEABLE_FAILURE_KEYWORDS = [
  'ENABLE_DEPRECATED_LEGACY_DNS_SERVERS',
  'sing-box 配置校验失败'
]


function nodeLabelOf(node: NodeConfig, index?: number): string {
  const order = typeof index === 'number' ? `#${index + 1}` : ''
  const tag = String(node.tag || '').trim()
  const server = String(node.server || '').trim()
  return [order, tag, server].filter(Boolean).join(' ')
}

function buildLocalProxyGame(): Game {
  const { t } = i18n.global
  return {
    id: '__local_proxy__',
    name: t('local_proxy.name'),
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
  const currentPort = ref(0)
  const statusText = ref('')
  const statusLevel = ref<'info' | 'success' | 'warning' | 'error'>('info')
  const testingNodeLabel = ref('')
  const testingCurrent = ref(0)
  const testingTotal = ref(0)
  const rememberedNodeKey = useLocalStorage('settings-local-proxy-last-node-key', '')
  const rememberedNodesFingerprint = useLocalStorage('settings-local-proxy-last-nodes-fingerprint', '')
  const nodeCheckCache = useLocalStorage<Record<string, { ok: boolean, detail: string, checkedAt: number }>>(
    'settings-local-proxy-node-check-cache',
    {}
  )
  let recheckTimer: ReturnType<typeof setInterval> | null = null

  function setStatus(
    text: string,
    level: 'info' | 'success' | 'warning' | 'error' = 'info'
  ) {
    statusText.value = text
    statusLevel.value = level
  }

  function resetTestingProgress() {
    testingNodeLabel.value = ''
    testingCurrent.value = 0
    testingTotal.value = 0
  }

  function buildNodesFingerprint(nodes: NodeConfig[]): string {
    return nodes
      .map((node) => `${nodeKeyOf(node)}|${node.server}|${node.server_port}|${node.type}`)
      .join('||')
  }

  function buildNodeFingerprint(node: NodeConfig): string {
    const tls = node.tls
    const utls = tls?.utls
    const reality = tls?.reality
    return [
      nodeKeyOf(node),
      node.type,
      node.tag,
      node.server,
      node.server_port,
      node.uuid,
      node.password,
      node.method,
      node.plugin,
      node.plugin_opts,
      node.network,
      node.security,
      node.path,
      node.host,
      node.service_name,
      node.alpn,
      node.fingerprint,
      tls?.enabled,
      tls?.server_name,
      tls?.insecure,
      utls?.enabled,
      utls?.fingerprint,
      reality?.enabled,
      reality?.public_key,
      reality?.short_id,
      node.flow,
      node.packet_encoding,
      node.username
    ].map((v) => String(v ?? '')).join('|')
  }

  function getCachedNodeCheck(node: NodeConfig): {
    fingerprint: string
    result?: { ok: boolean, detail: string, checkedAt: number }
  } {
    const fp = buildNodeFingerprint(node)
    const result = nodeCheckCache.value[fp]
    if (!result) return { fingerprint: fp, result: undefined }

    const now = Date.now()
    const ttl = result.ok ? NODE_CHECK_CACHE_TTL_SUCCESS_MS : NODE_CHECK_CACHE_TTL_FAIL_MS
    const expired = !result.checkedAt || now - result.checkedAt > ttl
    const nonCacheableFailure = !result.ok
      && NON_CACHEABLE_FAILURE_KEYWORDS.some((kw) => String(result.detail || '').includes(kw))

    if (expired || nonCacheableFailure) {
      const next = { ...nodeCheckCache.value }
      delete next[fp]
      nodeCheckCache.value = next
      return { fingerprint: fp, result: undefined }
    }

    return { fingerprint: fp, result }
  }

  function setCachedNodeCheck(node: NodeConfig, ok: boolean, detail: string) {
    const fp = buildNodeFingerprint(node)
    nodeCheckCache.value = {
      ...nodeCheckCache.value,
      [fp]: {
        ok,
        detail,
        checkedAt: Date.now()
      }
    }
  }

  function rememberSelectedNode(node: NodeConfig, nodesFingerprint: string) {
    rememberedNodeKey.value = nodeKeyOf(node)
    rememberedNodesFingerprint.value = nodesFingerprint
  }

  async function verifyHostsViaLocalHttpProxy(httpPort: number): Promise<{ ok: boolean, detail: string }> {
    const details: string[] = []
    for (const host of LOCAL_PROXY_HOSTS) {
      const res = await systemApi.testHttpProxyConnect(httpPort, host, 443, LOCAL_PROXY_NODE_CHECK_TIMEOUT_MS)
      if (!res?.ok) {
        details.push(`${host}=fail(${res?.error || res?.statusLine || 'unknown'})`)
        return { ok: false, detail: details.join('; ') }
      }
      details.push(`${host}=ok`)
    }
    return { ok: true, detail: details.join('; ') }
  }

  async function verifyHostsWithRetry(httpPort: number): Promise<{ ok: boolean, detail: string }> {
    let last = { ok: false, detail: 'not-tested' }
    for (let i = 1; i <= LOCAL_PROXY_NODE_CHECK_RETRIES; i += 1) {
      last = await verifyHostsViaLocalHttpProxy(httpPort)
      if (last.ok) return last
      if (i < LOCAL_PROXY_NODE_CHECK_RETRIES) {
        await sleep(LOCAL_PROXY_NODE_CHECK_RETRY_DELAY_MS)
      }
    }
    return last
  }

  async function ensurePortAvailable(preferredPort: number): Promise<number> {
    if (running.value && currentPort.value > 0 && preferredPort === currentPort.value) {
      return preferredPort
    }
    const port = await systemApi.findAvailablePort(preferredPort, 2)
    return port
  }

  async function applyNodeConfig(node: NodeConfig): Promise<void> {
    const settings = useSettingsStore()
    const localGame = buildLocalProxyGame()
    const primary = String(settings.dnsPrimary || '').trim()
    const secondary = String(settings.dnsSecondary || '').trim()
    const config = generateSingboxConfig(localGame, node, {
      mode: 'secure',
      primary: primary.startsWith('https://') ? primary : DEFAULT_DNS_PRIMARY,
      secondary: secondary.startsWith('https://') ? secondary : DEFAULT_DNS_SECONDARY,
      tunInterfaceName: settings.tunInterfaceName,
      disableTun: true,
      localProxyStrictNode: true,
      localProxy: {
        enabled: true,
        port: settings.localProxyPort
      }
    })
    await proxyMonitorApi.stop()
    await singboxApi.restart(config)
  }

  function resolveFixedNode(nodes: NodeConfig[], fixedIndex: number): NodeConfig | null {
    if (nodes.length === 0) return null
    const idx = Math.max(1, Math.floor(fixedIndex || 1)) - 1
    return nodes[idx] || nodes[0] || null
  }

  function stopRecheckLoop() {
    if (!recheckTimer) return
    clearInterval(recheckTimer)
    recheckTimer = null
  }

  function syncRecheckLoop() {
    const settings = useSettingsStore()
    const shouldEnable = settings.localProxyEnabled && settings.localProxyNodeRecursiveTest
    if (!shouldEnable) {
      stopRecheckLoop()
      return
    }
    if (recheckTimer) return
    recheckTimer = setInterval(() => {
      void recheckLocalProxyHealth().catch((e) => {
        console.error('[LocalProxy] 定期检查失败:', e)
      })
    }, LOCAL_PROXY_RECHECK_INTERVAL_MS)
    console.info(`[LocalProxy] 定期检查已启用 (${Math.floor(LOCAL_PROXY_RECHECK_INTERVAL_MS / 1000)}秒)`)
  }

  function findActiveNode(nodes: NodeConfig[]): NodeConfig | null {
    const active = activeNodeKey.value
    if (!active) return null
    return nodes.find((n) => nodeKeyOf(n) === active) || null
  }

  async function startLocalProxy(reason: 'startup' | 'settings' | 'recheck' = 'startup'): Promise<boolean> {
    if (starting.value) return false

    const { t } = i18n.global
    const settings = useSettingsStore()
    const nodeStore = useNodeStore()
    syncRecheckLoop()

    if (!settings.localProxyEnabled) {
      running.value = false
      activeNodeKey.value = ''
      stopRecheckLoop()
      setStatus(t('local_proxy.status_disabled'), 'info')
      resetTestingProgress()
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
        console.warn('[LocalProxy] 启动跳过: 无可用节点')
        setStatus(t('local_proxy.status_no_nodes'), 'warning')
        resetTestingProgress()
        return false
      }
      const nodesFingerprint = buildNodesFingerprint(nodes)

      const availablePort = await ensurePortAvailable(settings.localProxyPort)
      settings.localProxyPort = availablePort

      if (!settings.localProxyNodeRecursiveTest) {
        const fixed = resolveFixedNode(nodes, settings.localProxyFixedNodeIndex)
        if (!fixed) return false
        console.info(`[LocalProxy] 固定节点模式: ${nodeLabelOf(fixed)}`)
        await applyNodeConfig(fixed)
        running.value = true
        activeNodeKey.value = nodeKeyOf(fixed)
        currentPort.value = settings.localProxyPort
        setStatus(t('local_proxy.status_fixed_node', { label: nodeLabelOf(fixed) }), 'success')
        resetTestingProgress()
        return true
      }

      const reasonLabel = t(`local_proxy.reason_${reason}`)
      console.info(`[LocalProxy] ${reason}: 开始递归节点检查 (${nodes.length} 个节点)`)
      setStatus(t('local_proxy.status_checking', { reason: reasonLabel }), 'info')
      testingTotal.value = nodes.length
      const failures: string[] = []

      if (rememberedNodesFingerprint.value === nodesFingerprint && rememberedNodeKey.value) {
        const remembered = nodes.find((n) => nodeKeyOf(n) === rememberedNodeKey.value)
        if (remembered) {
          const rememberedLabel = nodeLabelOf(remembered)
          testingCurrent.value = 1
          testingNodeLabel.value = rememberedLabel
          console.info(`[LocalProxy] 尝试记忆的节点 ${rememberedLabel}`)
          setStatus(t('local_proxy.status_trying_remembered', { label: rememberedLabel }), 'info')
          try {
            const { result: rememberedCached } = getCachedNodeCheck(remembered)
            let rememberedCheck = rememberedCached || { ok: false, detail: 'not-tested', checkedAt: 0 }

            if (rememberedCached) {
              console.info(`[LocalProxy] 记忆节点缓存命中 ${rememberedLabel} -> ${rememberedCached.ok ? '成功' : '失败'}`)
              if (!rememberedCached.ok) {
                const fail = `[LocalProxy] 记忆节点因缓存跳过 ${rememberedLabel} -> ${rememberedCached.detail}`
                failures.push(fail)
                console.warn(fail)
                rememberedCheck = rememberedCached
              }
            }

            if (!rememberedCached || rememberedCached.ok) {
              await applyNodeConfig(remembered)
            }

            if (!rememberedCached && rememberedCheck.ok === false) {
              await sleep(LOCAL_PROXY_NODE_APPLY_WARMUP_MS)
              const checkResult = await verifyHostsWithRetry(settings.localProxyPort)
              rememberedCheck = { ...checkResult, checkedAt: Date.now() }
              setCachedNodeCheck(remembered, rememberedCheck.ok, rememberedCheck.detail)
            }

            if (rememberedCheck.ok) {
              running.value = true
              activeNodeKey.value = nodeKeyOf(remembered)
              currentPort.value = settings.localProxyPort
              rememberSelectedNode(remembered, nodesFingerprint)
              setStatus(t('local_proxy.status_remembered_selected', { label: rememberedLabel }), 'success')
              resetTestingProgress()
              console.info(`[LocalProxy] 已选择记忆节点 ${rememberedLabel} (${rememberedCheck.detail})`)
              return true
            }
            const fail = `[LocalProxy] 记忆节点不可用 ${rememberedLabel} -> ${rememberedCheck.detail}`
            failures.push(fail)
            console.warn(fail)
          } catch (e: any) {
            const fail = `[LocalProxy] 记忆节点错误 ${rememberedLabel} -> ${String(e?.message || e)}`
            failures.push(fail)
            console.warn(fail)
          }
        }
      }

      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i]
        if (!node) continue
        const label = nodeLabelOf(node, i)
        if (nodeKeyOf(node) === rememberedNodeKey.value && rememberedNodesFingerprint.value === nodesFingerprint) continue
        testingCurrent.value = i + 1
        testingNodeLabel.value = label
        try {
          const { result: cached } = getCachedNodeCheck(node)
          if (cached) {
            console.info(`[LocalProxy] 缓存命中 ${label} -> ${cached.ok ? '成功' : '失败'}`)
            if (!cached.ok) {
              const detail = `[LocalProxy] 节点因缓存跳过 ${label} -> ${cached.detail}`
              failures.push(detail)
              console.warn(detail)
              continue
            }
          }

          console.info(`[LocalProxy] 正在测试节点 ${label}`)
          setStatus(t('local_proxy.status_checking', { reason: `${i + 1}/${nodes.length} ${label}` }), 'info')
          await applyNodeConfig(node)

          if (cached) {
            running.value = true
            activeNodeKey.value = nodeKeyOf(node)
            currentPort.value = settings.localProxyPort
            rememberSelectedNode(node, nodesFingerprint)
            setStatus(t('local_proxy.status_cached_selected', { label }), 'success')
            resetTestingProgress()
            console.info(`[LocalProxy] 已选择缓存节点 ${label} (${cached.detail})`)
            return true
          }

          await sleep(LOCAL_PROXY_NODE_APPLY_WARMUP_MS)
          const check = await verifyHostsWithRetry(settings.localProxyPort)
          setCachedNodeCheck(node, check.ok, check.detail)
          if (!check.ok) {
            const detail = `[LocalProxy] 节点不可用 ${label} -> ${check.detail}`
            failures.push(detail)
            console.warn(detail)
            continue
          }

          running.value = true
          activeNodeKey.value = nodeKeyOf(node)
          currentPort.value = settings.localProxyPort
          rememberSelectedNode(node, nodesFingerprint)
          setStatus(t('local_proxy.status_selected', { label }), 'success')
          resetTestingProgress()
          console.info(`[LocalProxy] 已选择节点 ${label} (${check.detail})`)
          return true
        } catch (e: any) {
          const detail = `[LocalProxy] 节点测试错误 ${label} -> ${String(e?.message || e)}`
          setCachedNodeCheck(node, false, String(e?.message || e || 'node-test-error'))
          failures.push(detail)
          console.warn(detail)
        }
      }

      failures.forEach((line) => console.warn(line))
      console.error('[LocalProxy] 递归测试后无可用节点; 本地代理将停止')
      setStatus(t('local_proxy.status_no_available_recursive'), 'error')
      resetTestingProgress()
      await proxyMonitorApi.stop()
      await singboxApi.stop()
      running.value = false
      activeNodeKey.value = ''
      currentPort.value = 0
      return false
    } finally {
      starting.value = false
    }
  }

  async function stopLocalProxy(): Promise<void> {
    const { t } = i18n.global
    stopRecheckLoop()
    await proxyMonitorApi.stop()
    await singboxApi.stop()
    running.value = false
    activeNodeKey.value = ''
    currentPort.value = 0
    setStatus(t('local_proxy.status_stopped'), 'info')
    resetTestingProgress()
    console.info('[LocalProxy] 已停止')
  }

  async function recheckLocalProxyHealth(): Promise<void> {
    const { t } = i18n.global
    const settings = useSettingsStore()
    const nodeStore = useNodeStore()

    if (!settings.localProxyEnabled || !settings.localProxyNodeRecursiveTest) return
    if (starting.value) return

    if (nodeStore.nodes.length === 0) {
      await nodeStore.loadNodes()
    }
    const nodes = nodeStore.nodes.slice()
    if (nodes.length === 0) return

    if (!running.value) {
      console.info('[LocalProxy] 定期检查: 代理未运行, 正在尝试启动')
      await startLocalProxy('recheck')
      return
    }

    const active = findActiveNode(nodes)
    const activeLabel = active ? nodeLabelOf(active) : '(unknown)'
    const check = await verifyHostsViaLocalHttpProxy(settings.localProxyPort)
    if (check.ok) {
      setStatus(t('local_proxy.status_recheck_ok', { label: activeLabel }), 'success')
      console.info(`[LocalProxy] 定期检查正常: ${activeLabel}`)
      return
    }

    console.warn(`[LocalProxy] 活动节点定期检查失败 ${activeLabel}: ${check.detail}`)
    setStatus(t('local_proxy.status_recheck_failed', { label: activeLabel }), 'warning')
    await startLocalProxy('recheck')
  }

  async function handleNodeListChanged(): Promise<void> {
    const { t } = i18n.global
    const settings = useSettingsStore()
    const nodeStore = useNodeStore()

    if (!settings.localProxyEnabled) return
    if (starting.value) return

    const nodes = nodeStore.nodes.slice()
    if (nodes.length === 0) {
      console.error('[LocalProxy] 节点列表已变更: 无可用节点, 停止本地代理')
      setStatus(t('local_proxy.status_no_nodes'), 'error')
      await stopLocalProxy()
      return
    }

    if (!running.value) {
      console.info('[LocalProxy] 节点列表已变更: 代理未运行, 正在启动...')
      await startLocalProxy('settings')
      return
    }

    const active = findActiveNode(nodes)
    if (active) return

    console.warn('[LocalProxy] 活动节点已被移除/变更, 重新选择可用节点')
    setStatus(t('local_proxy.status_active_removed'), 'warning')
    await startLocalProxy('settings')
  }

  async function applySettingsChange(): Promise<void> {
    const settings = useSettingsStore()
    syncRecheckLoop()
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
    statusText,
    statusLevel,
    testingNodeLabel,
    testingCurrent,
    testingTotal,
    startLocalProxy,
    stopLocalProxy,
    recheckLocalProxyHealth,
    handleNodeListChanged,
    applySettingsChange,
    setActiveNode
  }
})
