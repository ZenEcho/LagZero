import path from 'node:path'
import { app } from 'electron'
import pkg from '../../package.json'

export interface RuntimePathConfig {
  usesExecutableDataDir: boolean
  userDataPath: string
  sessionDataPath: string
  crashDumpsPath: string
  logsPath: string
}

/**
 * 获取当前启动所对应的可执行文件路径。
 * Portable 版本优先使用包装器注入的真实路径，避免落到临时解包目录。
 */
export function getLaunchExecutablePath(): string {
  if (process.platform === 'win32') {
    return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
  }
  return process.execPath
}

export function getLaunchExecutableDir(): string {
  return path.dirname(getLaunchExecutablePath())
}

export function usesExecutableDataDir(): boolean {
  return process.platform === 'win32' && app.isPackaged
}

/**
 * 在 Windows 打包版本中，将 userData 固定到 exe 同目录下的 data。
 * 其他环境保持既有行为：开发模式使用项目内 .lagzero-dev，非 Windows 打包版走 Electron 默认路径。
 */
export function configureRuntimePaths(appRoot: string): RuntimePathConfig {
  if (usesExecutableDataDir()) {
    const userDataPath = path.join(getLaunchExecutableDir(), 'data')
    const sessionDataPath = path.join(userDataPath, 'session')
    const crashDumpsPath = path.join(userDataPath, 'crashDumps')
    const logsPath = path.join(userDataPath, 'logs')

    app.setPath('userData', userDataPath)
    app.setPath('sessionData', sessionDataPath)
    try {
      app.setPath('crashDumps', crashDumpsPath)
    } catch {
      // 某些运行环境可能不支持重定向 crashDumps，忽略即可。
    }
    try {
      app.setAppLogsPath(logsPath)
    } catch {
      // 仅影响 Electron 自身日志路径，不阻断启动。
    }

    return {
      usesExecutableDataDir: true,
      userDataPath,
      sessionDataPath,
      crashDumpsPath,
      logsPath
    }
  }

  if (!app.isPackaged) {
    const userDataPath = path.join(appRoot, `.${pkg.name}-dev`)
    app.setPath('userData', userDataPath)
    return {
      usesExecutableDataDir: false,
      userDataPath,
      sessionDataPath: app.getPath('sessionData'),
      crashDumpsPath: app.getPath('crashDumps'),
      logsPath: path.join(userDataPath, 'logs')
    }
  }

  const userDataPath = app.getPath('userData')
  return {
    usesExecutableDataDir: false,
    userDataPath,
    sessionDataPath: app.getPath('sessionData'),
    crashDumpsPath: app.getPath('crashDumps'),
    logsPath: path.join(userDataPath, 'logs')
  }
}

export function getLegacyWindowsUserDataPaths(): string[] {
  if (process.platform !== 'win32') return []

  const appData = app.getPath('appData')
  const candidates = [
    path.join(appData, app.getName()),
    path.join(appData, pkg.productName || ''),
    path.join(appData, pkg.name || '')
  ].filter(Boolean)

  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const normalized = path.resolve(candidate)
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}
