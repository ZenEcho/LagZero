function toIpcSafeSnapshot(snapshot?: any) {
  if (snapshot == null) return undefined
  try {
    return JSON.parse(JSON.stringify(snapshot))
  } catch {
    return undefined
  }
}

export const systemApi = {
  scanProcesses: () => window.system.scanProcesses(),
  scanLocalGames: () => window.system.scanLocalGames(),
  getProcessTree: () => window.system.getProcessTree(),
  ping: (host: string) => window.system.ping(host),
  tcpPing: (host: string, port: number) => window.system.tcpPing(host, port),
  flushDnsCache: () => window.system.flushDnsCache(),
  reinstallTunAdapter: (interfaceName?: string) => window.system.reinstallTunAdapter(interfaceName),
  findAvailablePort: (port: number, count?: number) => window.system.findAvailablePort(port, count),
  testHttpProxyConnect: (
    proxyPort: number,
    targetHost: string,
    targetPort?: number,
    timeoutMs?: number
  ) => window.system.testHttpProxyConnect(proxyPort, targetHost, targetPort, timeoutMs),
  setSystemProxy: (port: number, bypass?: string) => {
    const fn = (window.system as any)?.setSystemProxy
    if (typeof fn !== 'function') {
      return Promise.resolve({
        ok: false,
        message: 'system.setSystemProxy is unavailable in current preload. Please restart app or update electron main/preload build.'
      })
    }
    return fn(port, bypass)
  },
  clearSystemProxy: (snapshot?: any) => {
    const fn = (window.system as any)?.clearSystemProxy
    if (typeof fn !== 'function') {
      return Promise.resolve({
        ok: false,
        message: 'system.clearSystemProxy is unavailable in current preload. Please restart app or update electron main/preload build.'
      })
    }
    return fn(toIpcSafeSnapshot(snapshot))
  },
  getSystemProxyState: () => {
    const fn = (window.system as any)?.getSystemProxyState
    if (typeof fn !== 'function') {
      return Promise.resolve({
        ok: false,
        message: 'system.getSystemProxyState is unavailable in current preload. Please restart app or update electron main/preload build.'
      })
    }
    return fn()
  },
  onScanProgress: (callback: (data: { status: string, details?: string }) => void) => {
    const fn = (window.system as any)?.onScanProgress
    if (typeof fn === 'function') {
      fn(callback)
    }
  },
  offScanProgress: (callback: (data: { status: string, details?: string }) => void) => {
    const fn = (window.system as any)?.offScanProgress
    if (typeof fn === 'function') {
      fn(callback)
    }
  }
}
