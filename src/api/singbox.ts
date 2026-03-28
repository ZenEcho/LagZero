export const singboxApi = {
  start: (config: string) => window.singbox.start(config),
  stop: () => window.singbox.stop(),
  restart: (config: string) => window.singbox.restart(config),
  ensureCoreInstalled: (preferredVersion?: string) => window.singbox.ensureCoreInstalled(preferredVersion),
  installCore: (preferredVersion?: string) => window.singbox.installCore(preferredVersion),
  listCoreVersions: (forceRefresh?: boolean) => window.singbox.listCoreVersions(forceRefresh),
  getPreferredVersion: () => window.singbox.getPreferredVersion(),
  setPreferredVersion: (preferredVersion?: string) => window.singbox.setPreferredVersion(preferredVersion),
  getInstallInfo: () => window.singbox.getInstallInfo(),
  getTrafficStats: () => window.singbox.getTrafficStats(),
}
