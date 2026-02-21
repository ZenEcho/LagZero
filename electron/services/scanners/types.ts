export type Platform = 'Steam' | 'Microsoft' | 'Epic' | 'EA' | 'BattleNet' | 'WeGame' | 'Local' | 'GOG'

/**
 * 扫描进度回调函数
 */
export type ScanProgressCallback = (status: string, details?: string) => void

/**
 * 本地游戏扫描结果接口
 */
export type LocalGameScanResult = {
  /** 游戏显示名称 */
  name: string
  /** 游戏主进程名 (如 dota2.exe, 支持多个) */
  processName: string[]
  /** 来源平台 */
  source: Platform
  /** 安装目录绝对路径 */
  installDir: string
}

/**
 * 扫描时需要忽略的常见非游戏目录名
 */
export const GAME_SCAN_IGNORE_DIR_NAMES = new Set([
  // --- 原有基础过滤 ---
  '_commonredist', 'redist', 'redistributable', 'installer', 'installers',
  'directx', 'vcredist', 'prereq', 'prerequisites', 'support', 'tools', 'launcher',
  'windows', 'appdata', 'node_modules', 'programdata', '$recycle.bin', 'system volume information',

  // --- 操作系统与开发环境残留 ---
  'temp', 'tmp', 'perflogs', 'recovery', 'boot', 'efi', '.git', '.svn', '.vscode',
  '__pycache__', '.cache', 'caches', 'github', 'windows nt', 'msbuild',

  // --- 游戏引擎纯资源目录 (极其庞大，绝对不能进) ---
  'content', 'assets', 'paks', 'pak', 'bundles', 'sound', 'sounds', 'audio', 'bgm',
  'video', 'videos', 'movies', 'cinematics', 'art', 'textures', 'models', 'materials',
  'shaders', 'fx', 'particles', 'animations', 'levels', 'maps', 'scenes',
  // --- 日志、崩溃转储与调试 ---
  'logs', 'log', 'crashlogs', 'crashreport', 'dump', 'dumps', 'profiling', 'debug',

  // --- 常见扩展包与第三方库 ---
  'plugins', 'modules', 'vendor', 'thirdparty', '3rdparty', 'extensions', 'addons',

  // --- 其他无关内容 ---
  'docs', 'documents', 'manual', 'manuals', 'extras', 'bonus', 'soundtrack', 'ost', 'wallpapers'
])

/**
 * 扫描时需要忽略的常见非游戏主进程的可执行文件关键词
 * 这里是“硬过滤”关键词：命中后会直接跳过。
 */
export const GAME_SCAN_IGNORE_EXE_KEYWORDS = [
  // 原有关键词
  'setup', 'unins', 'uninstall', 'installer', 'crashreport',
  'updater', 'bootstrap',

  // 安装/更新/下载相关
  'update', 'patcher', 'downloader', 'install', 'repair', 'extract',

  // 崩溃收集与反馈
  'sendreport', 'crash', 'dump', 'errorreporter',

  // 配置工具 (通常不是我们需要加速的主进程)
  'configurator', 'config', 'settings', 'options', 'autorun', 'autorunner',

  // 服务端程序 (一般加速器只加速客户端进程)
  'server', 'dedicated', 'headless',

  // 第三方组件进程/内嵌浏览器
  'cefprocess', 'cefsubsystem', 'webhelper', 'browser', 'overlay'
]

/**
 * 软过滤关键词：
 * - 不会直接排除文件
 * - 只在评分阶段降权，避免误伤真实游戏相关进程
 */
export const GAME_SCAN_SOFT_IGNORE_EXE_KEYWORDS = [
  'helper', 'subagent', 'reporter', 'bugreport', 'feedback', 'diagnostics', 'sysinfo'
]

/**
 * 必须排除的特定可执行文件名
 */
export const GAME_SCAN_EXE_HARD_EXCLUDE = new Set([
  // Unity 崩溃处理
  'unitycrashhandler64.exe',
  'unitycrashhandler32.exe',

  // 虚幻引擎默认组件
  'unrealcefsubsystem.exe',
  'minidump.exe',
  'senddmp.exe',
  'prerequisites.exe',

  // 常见运行库安装包
  'vcredist_x86.exe',
  'vcredist_x64.exe',
  'dxsetup.exe',
  'vc_redist.x64.exe',
  'vc_redist.x86.exe',
  'dotnetfx.exe',
])
