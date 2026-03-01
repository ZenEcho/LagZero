import type { NodeConfig } from './node'
import type { AccelNetworkMode, SessionNetworkTuningOptions } from './settings'

/**
 * Sing-box DNS 配置选项
 */
export interface DnsConfigOptions {
    mode?: 'secure' | 'system'
    /** 主 DNS 服务器地址 */
    primary?: string
    /** 备用 DNS 服务器地址 */
    secondary?: string
    /** Bootstrap DNS（用于解析 DNS 服务器域名） */
    bootstrap?: string
    /** TUN 接口名称 */
    tunInterfaceName?: string
    /** 代理绕过列表 */
    proxyBypassList?: string
    /** 加速网络模式 */
    accelNetworkMode?: AccelNetworkMode
    /** 是否禁用 TUN */
    disableTun?: boolean
    /** 本地代理节点配置 */
    localProxyNode?: NodeConfig
    /** 是否严格使用指定本地代理节点 */
    localProxyStrictNode?: boolean
    /** 本地代理入站配置 */
    localProxy?: {
        enabled: boolean
        port: number
    }
    /** 系统代理入站配置 */
    systemProxy?: {
        enabled: boolean
        port: number
    }
    /** 会话级网络调优参数 */
    sessionTuning?: SessionNetworkTuningOptions
}

/**
 * Sing-box 配置结构
 */
export interface SingboxConfig {
    log: {
        level: string
        timestamp: boolean
    }
    dns: {
        servers: any[]
        rules: any[]
        final?: string
    }
    inbounds: any[]
    outbounds: any[]
    route: {
        rules: any[]
        rule_set?: any[]
        auto_detect_interface: boolean
        final?: string
    }
    experimental?: {
        cache_file?: {
            enabled: boolean
        }
    }
}
