import { ipcMain } from 'electron'
import { runCommand } from '../utils/command'
import { findAvailablePort } from '../utils/port'
import { ping, tcpPing } from '../utils/ping'
import nodeNet from 'node:net'

type SystemCommandResult = {
  ok: boolean
  code: number
  output: string
  message: string
}

export class SystemService {
  constructor() {
    this.registerIPC()
  }

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

  async testHttpProxyConnect(proxyPort: number, targetHost: string, targetPort: number = 443, timeoutMs: number = 5000) {
    return new Promise<{ ok: boolean, statusLine: string, error?: string }>((resolve) => {
      const socket = nodeNet.createConnection({ host: '127.0.0.1', port: proxyPort })
      let settled = false
      let buf = ''

      const done = (payload: { ok: boolean, statusLine: string, error?: string }) => {
        if (settled) return
        settled = true
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
        buf += chunk.toString('utf8')
        const lineEnd = buf.indexOf('\r\n')
        if (lineEnd < 0) return
        const statusLine = buf.slice(0, lineEnd).trim()
        done({ ok: /^HTTP\/1\.[01]\s+200\b/i.test(statusLine), statusLine })
      })
    })
  }

  private registerIPC() {
    ipcMain.handle('system:flush-dns-cache', () => this.flushDnsCache())
    ipcMain.handle('system:tun-reinstall', async (_, interfaceName?: string) => {
      return this.reinstallTunAdapter(interfaceName || 'LagZero')
    })
    ipcMain.handle('system:find-available-port', async (_, port: number, count?: number) => {
      return findAvailablePort(port, count)
    })
    ipcMain.handle('system:test-http-proxy-connect', async (_, proxyPort: number, targetHost: string, targetPort: number = 443, timeoutMs: number = 5000) => {
      return this.testHttpProxyConnect(proxyPort, targetHost, targetPort, timeoutMs)
    })
    ipcMain.handle('system:ping', async (_, host: string) => ping(host))
    ipcMain.handle('system:tcp-ping', async (_, host: string, port: number) => {
      try {
        return await tcpPing(host, port)
      } catch (e: any) {
        return { latency: -1, loss: 100 }
      }
    })
  }
}
