import { app, dialog, nativeImage, NativeImage } from 'electron'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'fs-extra'
import pkg from '../../package.json'

const ELEVATION_FLAG = '--lagzero-elevated'

/**
 * electron-builder portable runtime env:
 * - PORTABLE_EXECUTABLE_DIR
 * - PORTABLE_EXECUTABLE_FILE
 */
function isPortableRuntime(): boolean {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR || process.env.PORTABLE_EXECUTABLE_FILE)
}

/**
 * 格式化 PowerShell 参数字符串
 * @param input 输入字符串
 * @returns 转义后的字符串
 */
function psQuote(input: string): string {
  return `'${String(input || '').replace(/'/g, "''")}'`
}

/**
 * 检查当前进程是否拥有 Windows 管理员权限
 * @returns 是否为管理员
 */
function isWindowsAdmin(): boolean {
  if (process.platform !== 'win32') return true
  const script = [
    '$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())',
    '$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
    'Write-Output $isAdmin'
  ].join('; ')
  const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    windowsHide: true,
    encoding: 'utf8'
  })
  if (result.status !== 0) return false
  return String(result.stdout || '').trim().toLowerCase() === 'true'
}

/**
 * 尝试以管理员权限重新启动应用
 * @returns 是否成功触发重启
 */
function relaunchAsAdmin(): boolean {
  if (process.platform !== 'win32') return false
  const args = process.argv.slice(1).filter((a) => a !== ELEVATION_FLAG)
  args.push(ELEVATION_FLAG)
  const argsLiteral = args.map(psQuote).join(', ')
  const script = [
    `$exe = ${psQuote(process.execPath)}`,
    `$args = @(${argsLiteral})`,
    'Start-Process -FilePath $exe -ArgumentList $args -Verb RunAs'
  ].join('; ')

  const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    windowsHide: true,
    encoding: 'utf8'
  })
  return result.status === 0
}

/**
 * 确保应用在启动时拥有管理员权限 (仅 Windows)
 * 如果当前没有权限，会尝试申请提权并重启
 */
export function ensureAdminAtStartup() {
  if (process.platform !== 'win32') return
  // Portable 包在自提权重启时可能导致主进程退出且子进程未成功拉起，默认不强制提权。
  if (isPortableRuntime()) return
  if (isWindowsAdmin()) return

  const relaunched = relaunchAsAdmin()
  if (relaunched) {
    app.exit(0)
    process.exit(0)
  }

  console.warn('[Main] 无法以管理员身份重启，将继续以普通权限运行。')
}

export function loadAppIcon(): NativeImage | null {
  const baseDir = process.env.VITE_PUBLIC || ''
  const candidates = [
    path.join(baseDir, 'logo.ico'),
    path.join(baseDir, 'logo.png'),
    path.join(baseDir, 'logo.svg'),
  ]

  const tryFromPath = (p: string): NativeImage | null => {
    if (!p || !fs.existsSync(p)) return null
    const img = nativeImage.createFromPath(p)
    if (!img.isEmpty()) return img
    return null
  }

  for (const p of candidates) {
    const image = tryFromPath(p)
    if (image) return image
  }

  console.warn('[Main] 未找到图标文件。')
  return null
}

/**
 * 格式化启动错误信息
 * 特别处理 better-sqlite3 常见的架构/版本不匹配错误，提供修复建议
 * @param error 错误对象
 * @returns 格式化后的错误信息
 */
export function formatStartupError(error: unknown) {
  const raw = String((error as any)?.stack || (error as any)?.message || error || 'Unknown error')
  const lower = raw.toLowerCase()

  if (lower.includes('better_sqlite3.node') && lower.includes('not a valid win32 application')) {
    return [
      'Failed to load better-sqlite3 native module due to architecture mismatch.',
      '',
      `Current runtime arch: ${process.arch}`,
      'Fix command: pnpm run rebuild:native',
      'Fallback command: pnpm run rebuild:sqlite',
      '',
      'Details:',
      raw
    ].join('\n')
  }

  if (lower.includes('better_sqlite3.node') && lower.includes('compiled against a different node.js version')) {
    return [
      'Failed to load better-sqlite3 due to native ABI mismatch.',
      '',
      `Current runtime: electron ${process.versions.electron}, modules ${process.versions.modules}, arch ${process.arch}`,
      'Fix command: pnpm run rebuild:native',
      'Fallback command: pnpm run rebuild:sqlite',
      '',
      'Details:',
      raw
    ].join('\n')
  }

  return raw
}

/**
 * 处理应用启动失败
 * 弹出错误框并退出应用
 * @param error 错误对象
 */
export function handleStartupError(error: unknown) {
  const message = formatStartupError(error)
  console.error('[Main] 应用启动失败:', message)
  dialog.showErrorBox('LagZero 启动失败', message)
  app.quit()
}
