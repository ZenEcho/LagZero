
import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'
import { DEFAULT_DNS_PRIMARY, DEFAULT_DNS_SECONDARY } from '@/constants'
import type { CheckMethod, DnsMode } from '@/types'

export const useSettingsStore = defineStore('settings', () => {
    const checkInterval = useLocalStorage('settings-check-interval', 5000)
    const checkMethod = useLocalStorage<CheckMethod>('settings-check-method', 'ping')
    const checkUrl = useLocalStorage('settings-check-url', 'http://www.gstatic.com/generate_204')
    const dnsMode = useLocalStorage<DnsMode>('settings-dns-mode', 'secure')
    const dnsPrimary = useLocalStorage('settings-dns-primary', DEFAULT_DNS_PRIMARY)
    const dnsSecondary = useLocalStorage('settings-dns-secondary', DEFAULT_DNS_SECONDARY)
    const localProxyEnabled = useLocalStorage('settings-local-proxy-enabled', true)
    const localProxyPort = useLocalStorage('settings-local-proxy-port', 10860)
    const localProxyNodeRecursiveTest = useLocalStorage('settings-local-proxy-node-recursive-test', true)
    const localProxyFixedNodeIndex = useLocalStorage('settings-local-proxy-fixed-node-index', 1)
    const tunInterfaceName = useLocalStorage('settings-tun-interface-name', 'LagZero')
    if (tunInterfaceName.value === 'singbox-tun') {
        tunInterfaceName.value = 'LagZero'
    }

    return {
        checkInterval,
        checkMethod,
        checkUrl,
        dnsMode,
        dnsPrimary,
        dnsSecondary,
        localProxyEnabled,
        localProxyPort,
        localProxyNodeRecursiveTest,
        localProxyFixedNodeIndex,
        tunInterfaceName
    }
})
