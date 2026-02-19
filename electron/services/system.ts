import { ipcMain } from 'electron'
import { runCommand } from '../utils/command'
import { findAvailablePort } from '../utils/port'
import { ping, tcpPing } from '../utils/ping'
import nodeNet from 'node:net'
import nodeTls from 'node:tls'

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
    ipcMain.handle('system:ping', async (_, host: string) => {
      try {
        const result = await ping(host)
        return typeof result?.latency === 'number' ? result.latency : -1
      } catch (e: any) {
        console.warn('[SystemService] system:ping failed', host, e)
        return -1
      }
    })
    ipcMain.handle('system:tcp-ping', async (_, host: string, port: number) => {
      try {
        const result = await tcpPing(host, port)
        return typeof result?.latency === 'number' ? result.latency : -1
      } catch (e: any) {
        console.warn('[SystemService] system:tcp-ping failed', host, port, e)
        return -1
      }
    })
  }
}
