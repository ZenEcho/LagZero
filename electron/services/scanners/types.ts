/**
 * 本地游戏扫描结果接口
 */
export type LocalGameScanResult = {
  /** 游戏显示名称 */
  name: string
  /** 游戏主进程名 (如 dota2.exe) */
  processName: string
  /** 来源平台 */
  source: 'steam' | 'microsoft' | 'epic' | 'ea'
  /** 安装目录绝对路径 */
  installDir: string
}

/**
 * 扫描时需要忽略的常见非游戏目录名
 */
export const GAME_SCAN_IGNORE_DIR_NAMES = new Set([
  '_commonredist',
  'redist',
  'redistributable',
  'installer',
  'installers',
  'directx',
  'vcredist',
  'prereq',
  'prerequisites',
  'support',
  'tools',
  'launcher'
])

/**
 * 扫描时需要忽略的常见非游戏主进程的可执行文件关键词
 */
export const GAME_SCAN_IGNORE_EXE_KEYWORDS = [
  'setup',
  'unins',
  'uninstall',
  'installer',
  'crashreport',
  'updater',
  'helper',
  'bootstrap'
]

/**
 * 必须排除的特定可执行文件名
 */
export const GAME_SCAN_EXE_HARD_EXCLUDE = new Set([
  'unitycrashhandler64.exe',
  'unitycrashhandler32.exe'
])
