import { exec } from 'child_process'
import { ipcMain } from 'electron'
import { promisify } from 'util'

const execAsync = promisify(exec)

export class ProcessManager {
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

  async getProcessTree(): Promise<any[]> {
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
          }
        }).filter(p => p && p.pid)

        // Build tree
        const processMap = new Map<number, any>()
        processes.forEach(p => processMap.set(p.pid, p))
        
        const rootProcesses: any[] = []
        processes.forEach(p => {
          if (p.ppid && processMap.has(p.ppid)) {
            processMap.get(p.ppid).children.push(p)
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
