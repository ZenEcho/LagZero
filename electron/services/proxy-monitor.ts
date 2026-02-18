import { BrowserWindow, ipcMain } from 'electron';
import { ProcessService, ProcessNode } from './process';
import { SingBoxService } from './singbox';
import { normalizeProcessNames, normalizeProcessName } from '../utils/process-helper';

/**
 * 代理监控服务
 * 
 * 负责监控指定游戏的进程启动情况。
 * 当检测到游戏进程或其子进程启动时，自动通知 SingBoxService 更新路由规则。
 * 实现了"链式代理"检测逻辑，即自动代理游戏启动的所有子进程。
 */
export class ProxyMonitorService {
  private mainWindow: BrowserWindow;
  private processService: ProcessService;
  private singboxService: SingBoxService;
  private interval: NodeJS.Timeout | null = null;
  /** 当前正在监控的目标进程名集合 */
  private monitoredProcessNames: Set<string> = new Set();
  private activeGameId: string | null = null;
  /** 已检测到的并加入监控的子进程集合 */
  private detectedChildProcesses: Set<string> = new Set();

  constructor(window: BrowserWindow, processService: ProcessService, singboxService: SingBoxService) {
    this.mainWindow = window;
    this.processService = processService;
    this.singboxService = singboxService;
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

  /**
   * 开始监控指定游戏
   * 
   * @param gameId - 游戏 ID
   * @param processNames - 游戏的初始进程名列表
   */
  startMonitoring(gameId: string, processNames: string[]) {
    this.stopMonitoring();
    this.activeGameId = gameId;
    this.monitoredProcessNames = new Set(normalizeProcessNames(processNames));
    this.detectedChildProcesses.clear();

    console.log(`[ProxyMonitor] Started monitoring for game ${gameId} with processes:`, [...this.monitoredProcessNames]);

    // Start polling
    this.interval = setInterval(() => this.checkChainProxy(), 3000);
    this.mainWindow.webContents.send('proxy-monitor:status', { status: 'active', gameId });

    void this.singboxService.updateProcessNames([...this.monitoredProcessNames]);
  }

  /**
   * 停止监控
   */
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

  /**
   * 周期性检查进程树，发现新启动的子进程
   */
  private async checkChainProxy() {
    if (!this.activeGameId) return;

    try {
      const tree = await this.processService.getProcessTree();
      const newChildren = normalizeProcessNames(this.findNewChildren(tree))
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

        await this.singboxService.updateProcessNames([...this.monitoredProcessNames]);
      }
    } catch (error) {
      console.error('Proxy monitor error:', error);
    }
  }

  private findNewChildren(nodes: ProcessNode[]): string[] {
    const found: string[] = [];
    
    // Recursive traversal to find children of monitored processes
    const traverse = (node: ProcessNode, isProxiedParent: boolean) => {
      const normalizedName = normalizeProcessName(node.name);
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
}
