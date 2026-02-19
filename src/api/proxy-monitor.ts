export const proxyMonitorApi = {
  start: (gameId: string, processNames: string[]) => window.proxyMonitor.start(gameId, processNames),
  stop: () => window.proxyMonitor.stop(),
}
