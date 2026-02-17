
import { defineStore } from 'pinia'

import { useLocalStorage } from '@vueuse/core'

export type CheckMethod = 'ping' | 'tcp' | 'http'
export type DnsMode = 'secure' | 'system'

export const useSettingsStore = defineStore('settings', () => {
    const checkInterval = useLocalStorage('settings-check-interval', 5000)
    const checkMethod = useLocalStorage<CheckMethod>('settings-check-method', 'ping')
    const checkUrl = useLocalStorage('settings-check-url', 'http://www.gstatic.com/generate_204')
    const dnsMode = useLocalStorage<DnsMode>('settings-dns-mode', 'secure')
    const dnsPrimary = useLocalStorage('settings-dns-primary', 'https://dns.google/dns-query')
    const dnsSecondary = useLocalStorage('settings-dns-secondary', 'https://1.1.1.1/dns-query')
    const tunInterfaceName = useLocalStorage('settings-tun-interface-name', 'singbox-tun')

    return {
        checkInterval,
        checkMethod,
        checkUrl,
        dnsMode,
        dnsPrimary,
        dnsSecondary,
        tunInterfaceName
    }
})
