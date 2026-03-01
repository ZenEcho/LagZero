export const electronApi = {
  getWindowCloseAction: () => window.electron.getWindowCloseAction(),
  setWindowCloseAction: (action: 'ask' | 'minimize' | 'quit') => window.electron.setWindowCloseAction(action),
  submitWindowCloseDecision: (payload: { action: 'minimize' | 'quit' | 'cancel', remember?: boolean }) =>
    window.electron.submitWindowCloseDecision(payload),
  minimize: () => window.electron.minimize(),
  maximize: () => window.electron.maximize(),
  close: () => window.electron.close(),
  pickImage: () => window.electron.pickImage(),
  pickProcess: () => window.electron.pickProcess(),
  pickProcessFolder: (maxDepth?: number) => window.electron.pickProcessFolder(maxDepth),
  on: (channel: string, callback: (...args: any[]) => void) => window.electron.on(channel, callback),
  off: (channel: string, callback: (...args: any[]) => void) => window.electron.off(channel, callback),
  traySyncState: (state: any) => window.electron.traySyncState(state),
  trayGetState: () => window.electron.trayGetState(),
  trayActionToggle: () => window.electron.trayActionToggle(),
  trayShowMain: () => window.electron.trayShowMain(),
  trayQuit: () => window.electron.trayQuit(),
}
