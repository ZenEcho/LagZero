import type { LogEntry } from '@/types/electron'

export const appApi = {
  getVersion: (): Promise<string> => window.app.getVersion(),
  checkUpdate: () => window.app.checkUpdate(),
  openUrl: (url: string) => window.app.openUrl(url),
  openDir: (dir: string) => window.app.openDir(dir),
  restart: () => window.app.restart(),
  reset: () => window.app.reset(),
}

export const logsApi = {
  getAll: () => window.logs.getAll(),
  clear: () => window.logs.clear(),
  getFilePath: () => window.logs.getFilePath(),
  getDirPath: () => window.logs.getDirPath(),
  pushFrontend: (entry: Partial<LogEntry>) => window.logs.pushFrontend(entry),
  pushFrontendBatch: (entries: Partial<LogEntry>[]) => window.logs.pushFrontendBatch(entries),
  onNew: (callback: (entry: LogEntry) => void) => window.logs.onNew(callback),
  offNew: (callback: (entry: LogEntry) => void) => window.logs.offNew(callback),
}
