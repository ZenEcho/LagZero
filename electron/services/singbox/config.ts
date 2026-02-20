import fs from 'fs-extra'
import path from 'path'
import { app } from 'electron'
import { normalizeProcessNames, areStringArraysEqual } from '../../utils/process-helper'
import { LogFn } from './installer'
import { getSingboxEnv, stripAnsi } from './utils'
import { spawn } from 'child_process'

/**
 * Sing-box 配置管理器
 * 负责配置文件校验、规则更新等操作
 */
export class SingBoxConfigManager {
  private log: LogFn

  constructor(logFn: LogFn) {
    this.log = logFn
  }

  /**
   * 校验 sing-box 配置文件是否合法
   * @param binPath sing-box 可执行文件路径
   * @param configPath 配置文件路径
   */
  async validateConfig(binPath: string, configPath: string): Promise<void> {
    const { code, output } = await this.runCheck(binPath, configPath)
    if (code === 0) return

    const lines = output
      .split(/\r?\n/g)
      .map(l => stripAnsi(l.trim()))
      .filter(Boolean)
      .slice(-12)

    const detail = this.buildHelpfulErrorDetail(lines)
    const msg = `sing-box 配置校验失败（code=${String(code)}）${lines.length ? `：${lines.at(-1)}` : ''}${detail ? `\n\n${detail}` : ''}`
    this.log(msg, 'error')
    throw new Error(msg)
  }

  /**
   * 运行 `sing-box check` 命令
   */
  private runCheck(binPath: string, configPath: string): Promise<{ code: number, output: string }> {
    return new Promise((resolve) => {
      const p = spawn(binPath, ['check', '-c', configPath], { windowsHide: true, env: getSingboxEnv() })
      const chunks: Buffer[] = []
      const onData = (d: any) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(String(d)))
      p.stdout?.on('data', onData)
      p.stderr?.on('data', onData)
      p.on('close', (code) => {
        resolve({ code: typeof code === 'number' ? code : -1, output: Buffer.concat(chunks).toString('utf8') })
      })
      p.on('error', () => {
        resolve({ code: -1, output: '无法执行 sing-box，请检查可执行文件是否完整' })
      })
    })
  }

  /**
   * 根据错误日志构建用户友好的提示信息
   */
  buildHelpfulErrorDetail(lines: string[]): string {
    const text = lines.join('\n').toLowerCase()
    const hints: string[] = []

    if (text.includes('create tun') || text.includes('tun') || text.includes('wintun') || text.includes('tunnel')) {
      hints.push('提示：当前使用 TUN 模式，Windows 下通常需要管理员权限，并且需要可用的 TUN/Wintun 支持。请尝试“以管理员身份运行”LagZero。')
    }

    if (text.includes('access is denied') || text.includes('permission denied') || text.includes('operation not permitted')) {
      hints.push('提示：看起来是权限不足导致启动失败，请尝试“以管理员身份运行”。')
    }

    if (text.includes('invalid') || text.includes('unknown field') || text.includes('parse') || text.includes('json')) {
      hints.push('提示：节点/配置参数可能不兼容当前 sing-box 版本，请把弹窗里的最后一行报错发我。')
    }

    if (text.includes('deprecated_special_outbounds') || text.includes('deprecated special outbounds') || text.includes('enable_deprecated_special_outbounds')) {
      hints.push('提示：当前 sing-box 版本要求开启兼容开关，我已在程序内自动注入环境变量 ENABLE_DEPRECATED_SPECIAL_OUTBOUNDS=true。')
    }

    if (text.includes('deprecated_tun_address_x') || text.includes('deprecated tun address x') || text.includes('enable_deprecated_tun_address_x')) {
      hints.push('提示：当前 sing-box 版本要求开启 TUN 兼容开关，我已在程序内自动注入环境变量 ENABLE_DEPRECATED_TUN_ADDRESS_X=true。')
    }

    if (text.includes('mtu') || text.includes('fragment') || text.includes('message too long') || text.includes('packet too large')) {
      hints.push('提示：可能是 MTU/分片导致的问题。请在“会话网络优化”里尝试把 MTU 调低到 1280 或 1240。')
    }

    if (text.includes('udp') || text.includes('quic') || text.includes('xudp')) {
      hints.push('提示：检测到 UDP/QUIC 相关异常。请把 UDP 模式改为“自动”或“优先 TCP”，必要时关闭 xudp 覆盖。')
    }

    if (text.includes('address already in use') || text.includes('only one usage of each socket address') || text.includes('bind:')) {
      hints.push('提示：本地端口被占用。请修改“系统代理端口/本地代理端口”，或关闭占用该端口的软件后重试。')
    }

    if (hints.length === 0) return ''
    return Array.from(new Set(hints)).join('\n')
  }

  /**
   * 更新配置文件中的进程匹配规则
   * @param processNames 需要代理的进程名列表
   * @returns 是否有更新
   */
  async updateProcessNames(processNames: string[]): Promise<boolean> {
    const configPath = path.join(app.getPath('userData'), 'config.json')
    if (!await fs.pathExists(configPath)) return false

    const normalized = normalizeProcessNames(processNames)
    if (normalized.length === 0) return false

    let configRaw = ''
    try {
      configRaw = await fs.readFile(configPath, 'utf8')
    } catch {
      return false
    }

    let config: any
    try {
      config = JSON.parse(configRaw)
    } catch {
      return false
    }

    let changed = false
    const routeRules = Array.isArray(config?.route?.rules) ? config.route.rules : []
    const routeRule = routeRules.find((r: any) => Array.isArray(r?.process_name) && r?.outbound === 'proxy')
    if (routeRule) {
      if (!areStringArraysEqual(routeRule.process_name, normalized)) {
        routeRule.process_name = normalized
        changed = true
      }
    } else {
      routeRules.push({ process_name: normalized, outbound: 'proxy' })
      if (config?.route) config.route.rules = routeRules
      changed = true
    }

    const dnsRules = Array.isArray(config?.dns?.rules) ? config.dns.rules : []
    const hasRemotePrimaryServer = Array.isArray(config?.dns?.servers)
      && config.dns.servers.some((s: any) => s?.tag === 'remote-primary')
    if (hasRemotePrimaryServer) {
      const dnsRule = dnsRules.find((r: any) => Array.isArray(r?.process_name) && r?.server === 'remote-primary')
      if (dnsRule) {
        if (!areStringArraysEqual(dnsRule.process_name, normalized)) {
          dnsRule.process_name = normalized
          changed = true
        }
      } else {
        dnsRules.unshift({ process_name: normalized, server: 'remote-primary' })
        if (config?.dns) config.dns.rules = dnsRules
        changed = true
      }
    }

    if (changed) {
      await fs.writeFile(configPath, JSON.stringify(config, null, 2))
    }
    return changed
  }
}
