export const singboxApi = {
  start: (config: string) => window.singbox.start(config),
  stop: () => window.singbox.stop(),
  restart: (config: string) => window.singbox.restart(config),
}
