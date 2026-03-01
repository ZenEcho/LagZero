// ============================
// 设置相关类型
// ============================

/** 节点检测方式 */
export type CheckMethod = 'ping' | 'tcp' | 'http'

/** DNS 模式 */
export type DnsMode = 'secure' | 'system'

/** 加速网络模式 */
export type AccelNetworkMode = 'tun' | 'system_proxy'

/** 网络调优预设 */
export type NetworkProfile = 'stable' | 'aggressive'

/** UDP 偏好模式 */
export type UdpMode = 'auto' | 'prefer_udp' | 'prefer_tcp'

/** TUN 栈模式 */
export type TunStackMode = 'system' | 'mixed'

/** VLESS 包编码覆盖 */
export type VlessPacketEncodingOverride = 'off' | 'xudp'

/** 会话级网络调优选项 */
export interface SessionNetworkTuningOptions {
    enabled: boolean
    profile: NetworkProfile
    udpMode: UdpMode
    tunMtu: number
    tunStack: TunStackMode
    strictRoute: boolean
    vlessPacketEncodingOverride: VlessPacketEncodingOverride
    highLossHintOnly: boolean
}

// ============================
// 外观相关类型
// ============================

/** 主题模式 */
export type Theme = 'light' | 'dark' | 'auto'

/** 主题色 */
export type ThemeColor = 'green' | 'blue' | 'purple' | 'orange' | 'red'

// ============================
// 延迟记录类型
// ============================

/** 节点延迟测试记录 */
export interface LatencyRecord {
    id?: number
    nodeKey: string
    server: string
    port: number
    method: 'ping' | 'tcp' | 'http'
    latency: number
    loss: number
    timestamp: number
    gameId?: string
    accelerationSeconds?: number
    sessionLossRate?: number
}

/** 延迟测试上下文 */
export interface CheckRecordContext {
    recordLatency?: boolean
    gameId?: string
    accelerationSeconds?: number
    sessionLossRate?: number
}

// ============================
// 日志类型
// ============================

/** 前端日志级别 */
export type FrontendLogLevel = 'debug' | 'info' | 'warn' | 'error'

/** 前端日志载荷 */
export type FrontendLogPayload = {
    level: FrontendLogLevel
    source: string
    message: string
    detail?: string
}
