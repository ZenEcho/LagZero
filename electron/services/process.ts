import { exec } from 'child_process'
import { ipcMain } from 'electron'
import { promisify } from 'util'

const execAsync = promisify(exec)

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
      console.error('Failed to scan processes:', error)
      return []
    }
  }

  /**
   * 获取系统进程树
   * 
   * 仅支持 Windows 平台 (使用 wmic)。
   * 返回包含 PID, PPID, Name, ExecutablePath 的树状结构或扁平列表。
   * 
   * @returns Promise<any[]> - 进程树根节点列表
   */
  async getProcessTree(): Promise<ProcessNode[]> {
    try {
      if (process.platform === 'win32') {
        // Use wmic to get process tree info
        const { stdout } = await execAsync('wmic process get ProcessId,ParentProcessId,Name,ExecutablePath /FORMAT:CSV')
        const lines = stdout.trim().split('\r\n').slice(1) // Skip header
        const processes = lines.map(line => {
          const parts = line.split(',')
          // Node,ExecutablePath,Name,ParentProcessId,ProcessId
          // wmic CSV output might contain empty lines or different column order depending on locale?
          // Actually wmic /FORMAT:CSV output order is fixed: Node, ...columns sorted alphabetically
          // Columns: ExecutablePath, Name, ParentProcessId, ProcessId
          if (parts.length < 5) return null
          return {
            path: parts[1],
            name: parts[2],
            ppid: parseInt(parts[3], 10),
            pid: parseInt(parts[4], 10),
            children: []
          } as ProcessNode
        }).filter((p): p is ProcessNode => !!p && !!p.pid)

        // Build tree
        const processMap = new Map<number, ProcessNode>()
        processes.forEach(p => processMap.set(p.pid, p))
        
        const rootProcesses: ProcessNode[] = []
        processes.forEach(p => {
          if (p.ppid && processMap.has(p.ppid)) {
            processMap.get(p.ppid)!.children.push(p)
          } else {
            rootProcesses.push(p)
          }
        })
        return rootProcesses
      }
      return []
    } catch (error) {
      console.error('Failed to get process tree:', error)
      return []
    }
  }
}
