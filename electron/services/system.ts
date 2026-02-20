import { ipcMain } from 'electron'
import { runCommand } from '../utils/command'
import { findAvailablePort } from '../utils/port'
import { ping, tcpPing } from '../utils/ping'
import nodeNet from 'node:net'
import nodeTls from 'node:tls'

/**
 * 系统命令执行结果
 */
type SystemCommandResult = {
  /** 命令是否执行成功 */
  ok: boolean
  /** 退出代码 */
  code: number
  /** 标准输出内容 */
  output: string
  /** 结果消息或错误提示 */
  message: string
}

/**
 * Windows 系统代理配置快照
 * 用于备份和恢复代理设置
 */
type SystemProxySnapshot = {
  ProxyEnable?: number
  ProxyServer?: string
  ProxyOverride?: string
  AutoConfigURL?: string
  AutoDetect?: number
}

/**
 * 系统代理操作结果
 */
type SystemProxyResult = {
  ok: boolean
  message: string
  snapshot?: SystemProxySnapshot
}

/**
 * 系统服务
 * 
 * 提供底层系统操作能力，包括：
 * - 网络工具 (Ping, TCP Ping, DNS 刷新)
 * - 虚拟网卡管理
 * - 系统代理设置与清除
 * - HTTP 代理连通性测试
 */
export class SystemService {
  constructor() {
    this.registerIPC()
  }

  /**
   * 刷新系统 DNS 缓存
   * 目前仅支持 Windows
   */
  async flushDnsCache(): Promise<SystemCommandResult> {
    if (process.platform === 'win32') {
      const { code, output } = await runCommand('ipconfig', ['/flushdns'])
      return {
        ok: code === 0,
        code,
        output,
        message: code === 0 ? 'DNS cache flushed.' : 'Failed to flush DNS cache. Try running LagZero as administrator.'
      }
    }

    return {
      ok: false,
      code: -1,
      output: '',
      message: `Unsupported platform: ${process.platform}`
    }
  }

  /**
   * 重置 TUN 虚拟网卡
   * 尝试卸载指定的网络适配器，以便 sing-box 重新创建
   * @param interfaceName 网卡名称，默认为 'LagZero'
   */
  async reinstallTunAdapter(interfaceName: string = 'LagZero'): Promise<SystemCommandResult> {
    if (process.platform !== 'win32') {
      return {
        ok: false,
        code: -1,
        output: '',
        message: `Unsupported platform: ${process.platform}`
      }
    }

    // Try to remove old adapter instance, then sing-box will recreate it on next start.
    const psScript = [
      `$name = '${interfaceName.replace(/'/g, "''")}'`,
      "$adapter = Get-NetAdapter -Name $name -ErrorAction SilentlyContinue",
      "if ($null -eq $adapter) { Write-Output \"TUN adapter not found: $name\"; exit 2 }",
      "Disable-NetAdapter -Name $name -Confirm:$false -ErrorAction SilentlyContinue | Out-Null",
      "Start-Sleep -Milliseconds 400",
      "if (Get-Command Remove-NetAdapter -ErrorAction SilentlyContinue) {",
      "  Remove-NetAdapter -Name $name -Confirm:$false -ErrorAction Stop",
      "  Write-Output \"TUN adapter removed: $name\"",
      "  exit 0",
      "}",
      "Write-Output \"Remove-NetAdapter not available\"",
      "exit 3"
    ].join('; ')

    const { code, output } = await runCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], 25000)
    const ok = code === 0 || code === 2
    return {
      ok,
      code,
      output,
      message: ok
        ? 'TUN adapter reset finished. Restart acceleration to recreate adapter.'
        : 'Failed to reset TUN adapter. Try running LagZero as administrator.'
    }
  }

  /**
   * 测试 HTTP 代理连通性
   * 
   * 尝试通过指定的本地代理连接到目标服务器，支持 HTTPS 握手验证
   * 
   * @param proxyPort 代理端口
   * @param targetHost 目标主机
   * @param targetPort 目标端口 (默认 443)
   * @param timeoutMs 超时时间 (默认 5000ms)
   */
  async testHttpProxyConnect(proxyPort: number, targetHost: string, targetPort: number = 443, timeoutMs: number = 5000) {
    return new Promise<{ ok: boolean, statusLine: string, error?: string }>((resolve) => {
      const socket = nodeNet.createConnection({ host: '127.0.0.1', port: proxyPort })
      let tlsSocket: nodeTls.TLSSocket | null = null
      let settled = false
      let connectBuf = ''
      let responseBuf = ''
      const requestPath = targetHost.includes('google') ? '/generate_204' : '/'

      const done = (payload: { ok: boolean, statusLine: string, error?: string }) => {
        if (settled) return
        settled = true
        try { tlsSocket?.destroy() } catch { }
        socket.destroy()
        resolve(payload)
      }

      socket.setTimeout(Math.max(1000, timeoutMs))
      socket.on('timeout', () => done({ ok: false, statusLine: '', error: 'timeout' }))
      socket.on('error', (err: any) => done({ ok: false, statusLine: '', error: String(err?.message || err) }))
      socket.on('connect', () => {
        const req = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\nProxy-Connection: Keep-Alive\r\n\r\n`
        socket.write(req)
      })
      socket.on('data', (chunk: Buffer) => {
        connectBuf += chunk.toString('utf8')
        const headerEnd = connectBuf.indexOf('\r\n\r\n')
        if (headerEnd < 0) return

        const lineEnd = connectBuf.indexOf('\r\n')
        const connectStatusLine = (lineEnd >= 0 ? connectBuf.slice(0, lineEnd) : '').trim()
        if (!/^HTTP\/1\.[01]\s+200\b/i.test(connectStatusLine)) {
          done({ ok: false, statusLine: connectStatusLine, error: 'connect-not-200' })
          return
        }

        socket.removeAllListeners('data')
        socket.setTimeout(0)

        tlsSocket = nodeTls.connect({
          socket,
          servername: targetHost,
          rejectUnauthorized: false
        }, () => {
          const getReq = [
            `GET ${requestPath} HTTP/1.1`,
            `Host: ${targetHost}`,
            'User-Agent: LagZero/1.0',
            'Accept: */*',
            'Connection: close',
            '',
            ''
          ].join('\r\n')
          tlsSocket?.write(getReq)
        })

        tlsSocket.setTimeout(Math.max(1000, timeoutMs))
        tlsSocket.on('timeout', () => done({ ok: false, statusLine: '', error: 'https-timeout' }))
        tlsSocket.on('error', (err: any) => done({ ok: false, statusLine: '', error: `https:${String(err?.message || err)}` }))
        tlsSocket.on('data', (data: Buffer) => {
          responseBuf += data.toString('utf8')
          const responseHeaderEnd = responseBuf.indexOf('\r\n\r\n')
          if (responseHeaderEnd < 0) return

          const responseLineEnd = responseBuf.indexOf('\r\n')
          const responseStatusLine = (responseLineEnd >= 0 ? responseBuf.slice(0, responseLineEnd) : '').trim()
          const ok = /^HTTP\/1\.[01]\s+(2\d\d|3\d\d)\b/i.test(responseStatusLine)
          done({
            ok,
            statusLine: responseStatusLine,
            ...(ok ? {} : { error: 'http-not-2xx-3xx' })
          })
        })
      })
    })
  }

  /**
   * 获取当前系统代理状态 (仅 Windows)
   */
  async getSystemProxyState(): Promise<{ ok: boolean, message: string, state?: SystemProxySnapshot }> {
    if (process.platform !== 'win32') {
      return {
        ok: false,
        message: `Unsupported platform: ${process.platform}`
      }
    }

    try {
      const state = await this.readWindowsSystemProxyState()
      return { ok: true, message: 'OK', state }
    } catch (e: any) {
      return { ok: false, message: String(e?.message || e) }
    }
  }

  /**
   * 设置系统代理 (仅 Windows)
   * 会自动备份当前代理设置
   * 
   * @param port 代理端口
   * @param bypass 不走代理的地址列表
   */
  async setSystemProxy(port: number, bypass: string = '<local>'): Promise<SystemProxyResult> {
    if (process.platform !== 'win32') {
      return {
        ok: false,
        message: `Unsupported platform: ${process.platform}`
      }
    }

    const proxyPort = Math.max(1, Math.floor(Number(port || 0)))
    if (!proxyPort) {
      return {
        ok: false,
        message: 'Invalid proxy port'
      }
    }

    const snapshot = await this.readWindowsSystemProxyState()
    const safeBypass = String(bypass || '<local>').replace(/'/g, "''")
    const safeServer = `127.0.0.1:${proxyPort}`.replace(/'/g, "''")
    const psScript = [
      "$path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'",
      "$old = Get-ItemProperty -Path $path",
      "Set-ItemProperty -Path $path -Name ProxyEnable -Type DWord -Value 1",
      `Set-ItemProperty -Path $path -Name ProxyServer -Type String -Value '${safeServer}'`,
      `Set-ItemProperty -Path $path -Name ProxyOverride -Type String -Value '${safeBypass}'`,
      "Set-ItemProperty -Path $path -Name AutoDetect -Type DWord -Value 0",
      "Remove-ItemProperty -Path $path -Name AutoConfigURL -ErrorAction SilentlyContinue",
      "Write-Output 'system proxy configured'"
    ].join('; ')

    const { code, output } = await runCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], 15000)
    if (code !== 0) {
      return {
        ok: false,
        message: `Failed to set system proxy: ${output || `code=${code}`}`,
        snapshot
      }
    }

    return {
      ok: true,
      message: 'System proxy enabled',
      snapshot
    }
  }

  /**
   * 清除或恢复系统代理设置
   * @param snapshot 如果提供，则恢复到该快照状态；否则直接清除代理
   */
  async clearSystemProxy(snapshot?: SystemProxySnapshot): Promise<SystemProxyResult> {
    if (process.platform !== 'win32') {
      return {
        ok: false,
        message: `Unsupported platform: ${process.platform}`
      }
    }

    const psScript = this.buildClearSystemProxyScript(snapshot)
    const { code, output } = await runCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], 15000)
    if (code !== 0) {
      return {
        ok: false,
        message: `Failed to clear system proxy: ${output || `code=${code}`}`
      }
    }

    return {
      ok: true,
      message: 'System proxy cleared'
    }
  }

  /**
   * 构建清除或恢复系统代理的 PowerShell 脚本
   */
  private buildClearSystemProxyScript(snapshot?: SystemProxySnapshot): string {
    const hasSnapshot = !!snapshot && typeof snapshot === 'object'
    if (!hasSnapshot) {
      return [
        "$path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'",
        "Set-ItemProperty -Path $path -Name ProxyEnable -Type DWord -Value 0",
        "Set-ItemProperty -Path $path -Name AutoDetect -Type DWord -Value 0",
        "Remove-ItemProperty -Path $path -Name ProxyServer -ErrorAction SilentlyContinue",
        "Remove-ItemProperty -Path $path -Name AutoConfigURL -ErrorAction SilentlyContinue",
        "Write-Output 'system proxy cleared'"
      ].join('; ')
    }

    const proxyEnable = Number(snapshot?.ProxyEnable || 0)
    const autoDetect = Number(snapshot?.AutoDetect || 0)
    const proxyServer = String(snapshot?.ProxyServer || '').replace(/'/g, "''")
    const proxyOverride = String(snapshot?.ProxyOverride || '').replace(/'/g, "''")
    const autoConfigUrl = String(snapshot?.AutoConfigURL || '').replace(/'/g, "''")

    return [
      "$path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'",
      `Set-ItemProperty -Path $path -Name ProxyEnable -Type DWord -Value ${Number.isFinite(proxyEnable) ? proxyEnable : 0}`,
      `Set-ItemProperty -Path $path -Name AutoDetect -Type DWord -Value ${Number.isFinite(autoDetect) ? autoDetect : 0}`,
      proxyServer
        ? `Set-ItemProperty -Path $path -Name ProxyServer -Type String -Value '${proxyServer}'`
        : "Remove-ItemProperty -Path $path -Name ProxyServer -ErrorAction SilentlyContinue",
      proxyOverride
        ? `Set-ItemProperty -Path $path -Name ProxyOverride -Type String -Value '${proxyOverride}'`
        : "Remove-ItemProperty -Path $path -Name ProxyOverride -ErrorAction SilentlyContinue",
      autoConfigUrl
        ? `Set-ItemProperty -Path $path -Name AutoConfigURL -Type String -Value '${autoConfigUrl}'`
        : "Remove-ItemProperty -Path $path -Name AutoConfigURL -ErrorAction SilentlyContinue",
      "Write-Output 'system proxy restored'"
    ].join('; ')
  }

  /**
   * 读取 Windows 系统代理当前状态
   */
  private async readWindowsSystemProxyState(): Promise<SystemProxySnapshot> {
    const psScript = `
$path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
$p = Get-ItemProperty -Path $path
$result = [ordered]@{
  ProxyEnable = [int]($p.ProxyEnable)
  ProxyServer = [string]($p.ProxyServer)
  ProxyOverride = [string]($p.ProxyOverride)
  AutoConfigURL = [string]($p.AutoConfigURL)
  AutoDetect = [int]($p.AutoDetect)
}
$result | ConvertTo-Json -Compress
`.trim()

    const { code, output } = await runCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], 10000)
    if (code !== 0) {
      throw new Error(output || `read system proxy state failed: code=${code}`)
    }

    try {
      return JSON.parse(output || '{}') as SystemProxySnapshot
    } catch {
      throw new Error(`parse system proxy state failed: ${output}`)
    }
  }

  /**
   * 注册 IPC 监听器
   */
  private registerIPC() {
    ipcMain.handle('system:flush-dns-cache', () => this.flushDnsCache()) // 刷新 DNS 缓存
    ipcMain.handle('system:tun-reinstall', async (_, interfaceName?: string) => {
      return this.reinstallTunAdapter(interfaceName || 'LagZero')
    }) // 重装 TUN 适配器
    ipcMain.handle('system:find-available-port', async (_, port: number, count?: number) => {
      return findAvailablePort(port, count)
    }) // 查找可用端口
    ipcMain.handle('system:test-http-proxy-connect', async (_, proxyPort: number, targetHost: string, targetPort: number = 443, timeoutMs: number = 5000) => {
      return this.testHttpProxyConnect(proxyPort, targetHost, targetPort, timeoutMs)
    }) // 测试 HTTP 代理连接
    ipcMain.handle('system:ping', async (_, host: string) => {
      try {
        const result = await ping(host)
        return typeof result?.latency === 'number' ? result.latency : -1
      } catch (e: any) {
        console.warn('[SystemService] system:ping failed', host, e)
        return -1
      }
    }) // 测试 ICMP 代理连接
    ipcMain.handle('system:tcp-ping', async (_, host: string, port: number) => {
      try {
        const result = await tcpPing(host, port)
        return typeof result?.latency === 'number' ? result.latency : -1
      } catch (e: any) {
        console.warn('[SystemService] system:tcp-ping failed', host, port, e)
        return -1
      }
    }) // 测试 TCP 代理连接
    ipcMain.handle('system:set-system-proxy', async (_, port: number, bypass?: string) => {
      return this.setSystemProxy(port, bypass)
    }) // 设置系统代理
    ipcMain.handle('system:clear-system-proxy', async (_, snapshot?: SystemProxySnapshot) => {
      return this.clearSystemProxy(snapshot)
    }) // 清除系统代理
    ipcMain.handle('system:get-system-proxy-state', async () => {
      return this.getSystemProxyState()
    }) // 获取系统代理状态
  }
}
