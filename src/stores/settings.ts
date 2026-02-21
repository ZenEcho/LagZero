
import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { SYSTEM_PROXY_PORT, LOCAL_PROXY_PORT, DEFAULT_DNS_PRIMARY, DEFAULT_DNS_SECONDARY, BOOTSTRAP_DNS } from '@/constants'
import type { CheckMethod, DnsMode, Theme, ThemeColor, SessionNetworkTuningOptions, NetworkProfile } from '@/types'

function createDefaultSessionNetworkTuning(): SessionNetworkTuningOptions {
    return {
        enabled: true,
        profile: 'stable',
        udpMode: 'auto',
        tunMtu: 1280,
        tunStack: 'system',
        strictRoute: false,
        vlessPacketEncodingOverride: 'off',
        highLossHintOnly: true
    }
}

function createSessionNetworkTuningPreset(
    profile: NetworkProfile,
    isCurrentNodeVless: boolean
): Partial<SessionNetworkTuningOptions> {
    if (profile === 'aggressive') {
        return {
            profile: 'aggressive',
            udpMode: 'prefer_udp',
            tunMtu: 1360,
            tunStack: 'mixed',
            strictRoute: true,
            vlessPacketEncodingOverride: isCurrentNodeVless ? 'xudp' : 'off'
        }
    }
    return {
        profile: 'stable',
        udpMode: 'auto',
        tunMtu: 1280,
        tunStack: 'system',
        strictRoute: false,
        vlessPacketEncodingOverride: 'off'
    }
}

export const useSettingsStore = defineStore('settings', () => {
    // Appearance
    const language = useLocalStorage('settings-language', 'zh-CN') // 语言 默认zh-CN
    const theme = useLocalStorage<Theme>('settings-theme', 'auto') // 主题 默认auto
    const themeColor = useLocalStorage<ThemeColor>('settings-theme-color', 'green') // 主题色 默认green

    // Network & Proxy
    const checkInterval = useLocalStorage('settings-check-interval', 3000) // 检测间隔 默认5000ms
    const checkMethod = useLocalStorage<CheckMethod>('settings-check-method', 'ping') // 检测模式 默认ping
    // 检测URL
    const checkUrl = useLocalStorage('settings-check-url', 'http://www.gstatic.com/generate_204')
    const dnsMode = useLocalStorage<DnsMode>('settings-dns-mode', 'secure') // DNS模式 默认secure
    const dnsPrimary = useLocalStorage('settings-dns-primary', DEFAULT_DNS_PRIMARY) // DNS主服务器 默认
    const dnsSecondary = useLocalStorage('settings-dns-secondary', DEFAULT_DNS_SECONDARY) // DNS次服务器 默认
    const dnsBootstrap = useLocalStorage('settings-dns-bootstrap', BOOTSTRAP_DNS) // Bootstrap DNS 默认223.5.5.5
    const localProxyEnabled = useLocalStorage('settings-local-proxy-enabled', true) // 本地代理是否启用 默认true
    const localProxyPort = useLocalStorage('settings-local-proxy-port', LOCAL_PROXY_PORT) // 本地代理端口 默认10860
    const localProxyNodeRecursiveTest = useLocalStorage('settings-local-proxy-node-recursive-test', true) // 本地代理节点递归测试 默认true
    const localProxyFixedNodeIndex = useLocalStorage('settings-local-proxy-fixed-node-index', 1) // 本地代理固定节点索引 默认1
    const accelNetworkMode = useLocalStorage<'tun' | 'system_proxy'>('settings-accel-network-mode', 'tun') // 加速网络模式 默认tun
    const systemProxyPort = useLocalStorage('settings-system-proxy-port', SYSTEM_PROXY_PORT) // 系统代理端口 默认10808
    const systemProxyBypass = useLocalStorage(
        'settings-system-proxy-bypass',
        '<local>\nlocalhost\n127.0.0.1\n::1\n192.168.*\n10.*\n*.local'
    ) // 系统代理绕过列表
    const tunInterfaceName = useLocalStorage('settings-tun-interface-name', 'LagZero') // TUN接口名称 默认LagZero
    if (tunInterfaceName.value === 'singbox-tun') {
        tunInterfaceName.value = 'LagZero'
    }
    // 会话级网络调优（仅内存生效，不持久化）
    const sessionNetworkTuning = reactive<SessionNetworkTuningOptions>(createDefaultSessionNetworkTuning())

    function resetSessionNetworkTuning() {
        Object.assign(sessionNetworkTuning, createDefaultSessionNetworkTuning())
    }

    function applySessionNetworkProfilePreset(
        profile: NetworkProfile,
        options?: { isCurrentNodeVless?: boolean }
    ) {
        const isCurrentNodeVless = !!options?.isCurrentNodeVless
        Object.assign(sessionNetworkTuning, createSessionNetworkTuningPreset(profile, isCurrentNodeVless), { enabled: true })
    }

    return {
        language,
        theme,
        themeColor,
        checkInterval,
        checkMethod,
        checkUrl,
        dnsMode,
        dnsPrimary,
        dnsSecondary,
        dnsBootstrap,
        localProxyEnabled,
        localProxyPort,
        localProxyNodeRecursiveTest,
        localProxyFixedNodeIndex,
        accelNetworkMode,
        systemProxyPort,
        systemProxyBypass,
        tunInterfaceName,
        sessionNetworkTuning,
        resetSessionNetworkTuning,
        applySessionNetworkProfilePreset
    }
})
