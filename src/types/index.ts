/**
 * 前端类型定义
 *
 * 大部分类型从 @shared/types 统一导入，
 * 此文件仅做 re-export 和少量前端特有补充。
 */

import { PLATFORMS } from '@/constants'

export type Platform = typeof PLATFORMS[number]

// ============================
// 从 shared 统一导入的类型
// ============================

export type {
  Game,
  LocalScanGame,
  NodeConfig,
  NodeTlsConfig,
  Category,
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
  DnsConfigOptions,
  SingboxConfig,
} from '@shared/types'
