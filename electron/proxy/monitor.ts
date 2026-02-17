import { BrowserWindow, ipcMain } from 'electron';
import { ProcessManager } from '../process/manager';
import { SingBoxManager } from '../singbox/manager';

interface ProcessInfo {
  pid: number;
  ppid: number;
  name: string;
  children?: ProcessInfo[];
}

export class ProxyMonitor {
  private mainWindow: BrowserWindow;
  private processManager: ProcessManager;
  private singboxManager: SingBoxManager;
  private interval: NodeJS.Timeout | null = null;
  private monitoredProcessNames: Set<string> = new Set();
  private activeGameId: string | null = null;
  private detectedChildProcesses: Set<string> = new Set();

  constructor(window: BrowserWindow, processManager: ProcessManager, singboxManager: SingBoxManager) {
    this.mainWindow = window;
    this.processManager = processManager;
    this.singboxManager = singboxManager;
    this.setupIPC();
  }

  private setupIPC() {
    ipcMain.handle('proxy-monitor:start', (_, gameId: string, processNames: string[]) => {
      this.startMonitoring(gameId, processNames);
    });

    ipcMain.handle('proxy-monitor:stop', () => {
      this.stopMonitoring();
    });
  }

  startMonitoring(gameId: string, processNames: string[]) {
    this.stopMonitoring();
    this.activeGameId = gameId;
    this.monitoredProcessNames = new Set(this.normalizeProcessNames(processNames));
    this.detectedChildProcesses.clear();

    console.log(`[ProxyMonitor] Started monitoring for game ${gameId} with processes:`, [...this.monitoredProcessNames]);

    // Start polling
    this.interval = setInterval(() => this.checkChainProxy(), 3000);
    this.mainWindow.webContents.send('proxy-monitor:status', { status: 'active', gameId });

    void this.singboxManager.updateProcessNames([...this.monitoredProcessNames]);
  }

  stopMonitoring() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.activeGameId = null;
    this.monitoredProcessNames.clear();
    this.detectedChildProcesses.clear();
    this.mainWindow.webContents.send('proxy-monitor:status', { status: 'idle' });
    console.log('[ProxyMonitor] Stopped monitoring');
  }

  private async checkChainProxy() {
    if (!this.activeGameId) return;

    try {
      const tree = await this.processManager.getProcessTree();
      const newChildren = this.normalizeProcessNames(this.findNewChildren(tree))
        .filter(name => !this.monitoredProcessNames.has(name));

      if (newChildren.length > 0) {
        // Add new children to monitored set
        newChildren.forEach(name => {
          this.monitoredProcessNames.add(name);
          this.detectedChildProcesses.add(name);
          console.log(`[ProxyMonitor] Detected new child process: ${name}`);
        });

        // Notify frontend
        this.mainWindow.webContents.send('proxy-monitor:detected', newChildren);

        await this.singboxManager.updateProcessNames([...this.monitoredProcessNames]);
      }
    } catch (error) {
      console.error('Proxy monitor error:', error);
    }
  }

  private findNewChildren(nodes: ProcessInfo[]): string[] {
    const found: string[] = [];
    
    // Recursive traversal to find children of monitored processes
    const traverse = (node: ProcessInfo, isProxiedParent: boolean) => {
      const normalizedName = this.normalizeProcessName(node.name);
      if (!normalizedName) return;

      const isMonitored = this.monitoredProcessNames.has(normalizedName);
      // If parent is proxied, child should be proxied (Chain Proxy)
      const shouldProxy = isProxiedParent || isMonitored;

      if (shouldProxy && !isMonitored) {
        found.push(normalizedName);
      }

      if (node.children) {
        node.children.forEach(child => traverse(child, shouldProxy));
      }
    };

    nodes.forEach(node => traverse(node, false));
    return found;
  }

  private normalizeProcessNames(processNames: string[]): string[] {
    const set = new Set<string>();
    processNames.forEach(name => {
      const normalized = this.normalizeProcessName(name);
      if (!normalized) return;
      set.add(normalized);
      const lower = normalized.toLowerCase();
      if (lower !== normalized) set.add(lower);
    });
    return Array.from(set);
  }

  private normalizeProcessName(processName: string): string {
    const raw = String(processName || '').trim();
    if (!raw) return '';
    const normalized = raw.replace(/\\/g, '/');
    return (normalized.split('/').pop() || normalized).trim();
  }
}
