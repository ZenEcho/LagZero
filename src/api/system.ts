import { toIpcSafeSnapshot } from '@shared/utils'

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
  setSystemProxy: (port: number, bypass?: string) => window.system.setSystemProxy(port, bypass),
  clearSystemProxy: (snapshot?: any) => window.system.clearSystemProxy(toIpcSafeSnapshot(snapshot)),
  getSystemProxyState: () => window.system.getSystemProxyState(),
  fetchUrl: (url: string, timeoutMs?: number) => window.system.fetchUrl(url, timeoutMs),
  onScanProgress: (callback: (data: { status: string, details?: string }) => void) => {
    window.system.onScanProgress(callback)
  },
  offScanProgress: (callback: (data: { status: string, details?: string }) => void) => {
    window.system.offScanProgress(callback)
  }
}
