export const electronApi = {
  minimize: () => window.electron.minimize(),
  maximize: () => window.electron.maximize(),
  close: () => window.electron.close(),
  pickImage: () => window.electron.pickImage(),
  pickProcess: () => window.electron.pickProcess(),
  pickProcessFolder: (maxDepth?: number) => window.electron.pickProcessFolder(maxDepth),
  on: (channel: string, callback: (...args: any[]) => void) => window.electron.on(channel, callback),
  off: (channel: string, callback: (...args: any[]) => void) => window.electron.off(channel, callback),
}
