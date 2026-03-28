/**
 * Session Network Tuning 工具函数
 *
 * 统一管理 SessionNetworkTuningOptions 的默认值和预设生成逻辑，
 * 避免 settings / games / singbox-config 各自硬编码相同的默认值。
 */

import type { SessionNetworkTuningOptions, NetworkProfile } from '@/types'

// ── 默认值常量 ──────────────────────────────────────────────

export const MTU_MIN = 1200
export const MTU_MAX = 1500
export const MTU_DEFAULT_STABLE = 1280
export const MTU_DEFAULT_AGGRESSIVE = 1360

// ── 工厂函数 ────────────────────────────────────────────────

/** 创建一份全新的"稳定"模式默认 SessionNetworkTuningOptions。 */
export function createDefaultSessionNetworkTuning(): SessionNetworkTuningOptions {
  return {
    enabled: true,
    profile: 'stable',
    udpMode: 'auto',
    tunMtu: MTU_DEFAULT_STABLE,
    tunStack: 'system',
    strictRoute: false,
    vlessPacketEncodingOverride: 'off',
    highLossHintOnly: true,
  }
}

/**
 * 根据 profile 创建预设覆盖值。
 *
 * @param profile  - 'aggressive' | 'stable'
 * @param isCurrentNodeVless - 当前节点是否 VLESS（决定 packetEncoding）
 */
export function createSessionNetworkTuningPreset(
  profile: NetworkProfile,
  isCurrentNodeVless: boolean,
): Partial<SessionNetworkTuningOptions> {
  if (profile === 'aggressive') {
    return {
      profile: 'aggressive',
      udpMode: 'prefer_udp',
      tunMtu: MTU_DEFAULT_AGGRESSIVE,
      tunStack: 'mixed',
      strictRoute: true,
      vlessPacketEncodingOverride: isCurrentNodeVless ? 'xudp' : 'off',
    }
  }
  return {
    profile: 'stable',
    udpMode: 'auto',
    tunMtu: MTU_DEFAULT_STABLE,
    tunStack: 'system',
    strictRoute: false,
    vlessPacketEncodingOverride: 'off',
  }
}

/**
 * 规范化外部传入的 tuning，确保每个字段都在合法范围内。
 * 当 `enabled` 为 false 时返回禁用态默认值。
 */
export function resolveSessionTuning(tuning?: SessionNetworkTuningOptions): SessionNetworkTuningOptions {
  if (!tuning?.enabled) {
    return {
      ...createDefaultSessionNetworkTuning(),
      enabled: false,
    }
  }

  return {
    enabled: true,
    profile: tuning.profile === 'aggressive' ? 'aggressive' : 'stable',
    udpMode: tuning.udpMode === 'prefer_udp' || tuning.udpMode === 'prefer_tcp' ? tuning.udpMode : 'auto',
    tunMtu: normalizeMtu(tuning.tunMtu),
    tunStack: tuning.tunStack === 'mixed' ? 'mixed' : 'system',
    strictRoute: !!tuning.strictRoute,
    vlessPacketEncodingOverride: tuning.vlessPacketEncodingOverride === 'xudp' ? 'xudp' : 'off',
    highLossHintOnly: tuning.highLossHintOnly !== false,
  }
}

/** 规范化 MTU 值到合理范围 [MTU_MIN, MTU_MAX]。 */
export function normalizeMtu(value: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return MTU_DEFAULT_STABLE
  return Math.min(MTU_MAX, Math.max(MTU_MIN, Math.floor(n)))
}
