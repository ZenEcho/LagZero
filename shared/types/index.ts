/**
 * 共享类型定义 - 统一导出
 *
 * Electron 主进程和渲染进程共用的类型。
 * 请勿在此引入任何平台特定 API（electron, vue 等）。
 */
export type { Game, LocalScanGame } from './game'
export type { NodeConfig, NodeTlsConfig } from './node'
export type { Category } from './category'
export type {
    CheckMethod,
    DnsMode,
    AccelNetworkMode,
    NetworkProfile,
    UdpMode,
    TunStackMode,
    VlessPacketEncodingOverride,
    SessionNetworkTuningOptions,
    Theme,
    ThemeColor,
    LatencyRecord,
    CheckRecordContext,
    FrontendLogLevel,
    FrontendLogPayload,
} from './settings'
export type { DnsConfigOptions, SingboxConfig } from './singbox'
