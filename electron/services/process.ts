import { exec, execFile } from 'child_process'
import { ipcMain } from 'electron'
import { promisify } from 'util'

const execAsync = promisify(exec)
const PROCESS_EXEC_MAX_BUFFER = 20 * 1024 * 1024

/**
 * 进程节点结构
 */
export interface ProcessNode {
  path: string
  name: string
  ppid: number
  pid: number
  children: ProcessNode[]
}

type FlatProcessNode = {
  path: string
  name: string
  ppid: number
  pid: number
}

function toInt(value: unknown): number {
  const n = Number.parseInt(String(value ?? '').trim(), 10)
  return Number.isFinite(n) ? n : 0
}

function unquoteCsvCell(value: string): string {
  const raw = String(value || '').trim()
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/""/g, '"')
  }
  return raw
}

/**
 * 将扁平进程列表构建为树结构
 */
export function buildProcessTree(flatNodes: FlatProcessNode[]): ProcessNode[] {
  const normalized: ProcessNode[] = flatNodes
    .map((row) => ({
      path: String(row.path || ''),
      name: String(row.name || '').trim(),
      ppid: toInt(row.ppid),
      pid: toInt(row.pid),
      children: []
    }))
    .filter((row) => row.pid > 0 && !!row.name)

  const processMap = new Map<number, ProcessNode>()
  for (const row of normalized) {
    if (!processMap.has(row.pid)) {
      processMap.set(row.pid, row)
    }
  }

  const roots: ProcessNode[] = []
  for (const row of processMap.values()) {
    if (row.ppid > 0 && row.ppid !== row.pid && processMap.has(row.ppid)) {
      processMap.get(row.ppid)!.children.push(row)
    } else {
      roots.push(row)
    }
  }
  return roots
}

/**
 * 解析 PowerShell/CIM 的 JSON 输出
 */
export function parsePowerShellProcessJson(stdout: string): ProcessNode[] {
  const raw = String(stdout || '').trim()
  if (!raw) return []

  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }

  const rows = Array.isArray(parsed) ? parsed : [parsed]
  const flat: FlatProcessNode[] = rows.map((row: any) => ({
    path: String(row?.ExecutablePath || ''),
    name: String(row?.Name || ''),
    ppid: toInt(row?.ParentProcessId),
    pid: toInt(row?.ProcessId)
  }))

  return buildProcessTree(flat)
}

/**
 * 解析 WMIC CSV 输出
 * 支持 ExecutablePath 中包含逗号的情况。
 */
export function parseWmicProcessCsv(stdout: string): ProcessNode[] {
  const lines = String(stdout || '')
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length <= 1) return []

  const rows = lines.slice(1)
  const flat: FlatProcessNode[] = []

  for (const line of rows) {
    const rawParts = line.split(',')
    if (rawParts.length < 5) continue

    const parts = rawParts.map(unquoteCsvCell)
    const pid = toInt(parts[parts.length - 1])
    const ppid = toInt(parts[parts.length - 2])
    const name = String(parts[parts.length - 3] || '').trim()
    const exePath = parts.slice(1, parts.length - 3).join(',').trim()

    if (!pid || !name) continue
    flat.push({
      path: exePath,
      name,
      ppid,
      pid
    })
  }

  return buildProcessTree(flat)
}

function execFileText(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { windowsHide: true, maxBuffer: PROCESS_EXEC_MAX_BUFFER },
      (error, stdout) => {
        if (error) {
          reject(error)
          return
        }
        resolve(String(stdout || ''))
      }
    )
  })
}

/**
 * 进程管理服务
 * 
 * 提供跨平台的进程扫描和进程树获取功能。
 * 主要用于识别游戏进程及其父子关系。
 */
export class ProcessService {
  constructor() {
    this.setupIPC()
  }

  /**
   * 注册 IPC 监听器
   */
  private setupIPC() {
    ipcMain.handle('process-scan', async () => {
      return await this.scanProcesses()
    })
    ipcMain.handle('process-tree', async () => {
      return await this.getProcessTree()
    })
  }

  /**
   * 扫描当前运行的所有进程
   * 
   * @returns Promise<string[]> - 返回进程名列表 (如 ['chrome.exe', 'svchost.exe'])
   */
  async scanProcesses(): Promise<string[]> {
    try {
      let command = ''
      if (process.platform === 'win32') {
        command = 'tasklist /FO CSV /NH'
      } else if (process.platform === 'darwin' || process.platform === 'linux') {
        command = 'ps -e -o comm='
      }

      if (!command) return []

      const { stdout } = await execAsync(command)
      
      if (process.platform === 'win32') {
        // Parse CSV format from tasklist
        // "Image Name","PID","Session Name","Session#","Mem Usage"
        return stdout
          .split('\r\n')
          .map(line => {
            const match = line.match(/^"([^"]+)"/)
            return match ? match[1] : ''
          })
          .filter(name => name)
      } else {
        // Parse simple list for unix
        return stdout
          .split('\n')
          .map(line => line.trim())
          .filter(name => name)
          .map(path => {
              // Extract filename from path
              const parts = path.split('/')
              return parts[parts.length - 1]
          })
      }
    } catch (error) {
      console.error('扫描进程失败:', error)
      return []
    }
  }

  /**
   * 获取系统进程树
   * 
   * 仅支持 Windows 平台。
   * 优先使用 PowerShell/CIM，在老系统或受限环境下回退到 WMIC。
   * 返回包含 PID, PPID, Name, ExecutablePath 的树状结构或扁平列表。
   * 
   * @returns Promise<any[]> - 进程树根节点列表
   */
  async getProcessTree(): Promise<ProcessNode[]> {
    if (process.platform !== 'win32') return []

    try {
      const psScript = "$ErrorActionPreference='Stop'; Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath | ConvertTo-Json -Compress"

      const psOutput = await execFileText('powershell', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        psScript
      ])
      const parsed = parsePowerShellProcessJson(psOutput)
      if (parsed.length > 0) {
        return parsed
      }
      console.warn('[进程服务] PowerShell/CIM 进程树为空，尝试 WMIC 回退')
    } catch (error) {
      console.warn('[进程服务] PowerShell/CIM 获取进程树失败，尝试 WMIC 回退:', error)
    }

    try {
      const { stdout } = await execAsync(
        'wmic process get ProcessId,ParentProcessId,Name,ExecutablePath /FORMAT:CSV',
        { maxBuffer: PROCESS_EXEC_MAX_BUFFER }
      )
      return parseWmicProcessCsv(String(stdout || ''))
    } catch (error) {
      console.error('获取进程树失败:', error)
      return []
    }
  }
}
