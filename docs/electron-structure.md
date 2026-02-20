# Electron 主进程项目结构说明

本文档详细描述了 `electron/` 目录下的代码结构与模块功能。本项目采用 **SOA (面向服务架构)** 设计，将业务逻辑拆分为独立的服务模块。

## 目录树

```
electron/
├── common/                  # [公共层] 跨模块共享的通用代码
│   └── store.ts             # 简单持久化存储封装 (基于 electron-store)
│
├── db/                      # [数据层] 数据库定义
│   └── schema.ts            # SQLite 数据库表结构定义 (Kysely Schema)
│
├── main/                    # [入口层] 主进程核心引导
│   ├── bootstrap.ts         # **启动引导**：环境检查、管理员权限校验、图标加载
│   ├── index.ts             # **应用入口**：负责 App 生命周期、服务组装
│   ├── logger.ts            # 日志系统：负责日志文件写入、轮转及向渲染进程广播日志
│   ├── tray.ts              # 托盘管理：系统托盘图标与菜单逻辑
│   └── window.ts            # 窗口管理：主窗口创建、配置与生命周期控制
│
├── preload/                 # [桥接层] 预加载脚本
│   └── index.ts             # 暴露给渲染进程的 API 定义 (ContextBridge)
│
├── services/                # [业务层] 核心业务逻辑服务 (Service)
│   ├── scanners/            # [扫描器] 游戏扫描具体实现
│   │   ├── flat.ts          # 通用目录扫描 (Epic/EA)
│   │   ├── microsoft.ts     # Xbox/Microsoft Store 游戏扫描 (Registry/Manifest)
│   │   ├── steam.ts         # Steam 库扫描 (libraryfolders.vdf)
│   │   ├── types.ts         # 扫描结果类型定义
│   │   └── utils.ts         # 扫描工具函数
│   ├── singbox/             # [核心] sing-box 内核管理
│   │   ├── config.ts        # 配置管理：校验配置、更新路由规则
│   │   ├── constants.ts     # 常量定义
│   │   ├── index.ts         # **SingBoxService**：服务入口，协调各模块
│   │   ├── installer.ts     # 安装器：负责内核下载与安装
│   │   └── utils.ts         # 工具函数
│   ├── category.ts          # 游戏分类服务：管理侧边栏分类数据
│   ├── database.ts          # 数据库服务：封装 SQLite 连接与基础 CRUD 操作
│   ├── game-scanner.ts      # 游戏扫描服务：统一入口，聚合 scanners 目录下的扫描逻辑
│   ├── game.ts              # 游戏管理服务：管理“我的游戏”列表、配置与状态
│   ├── node.ts              # 节点管理服务：管理代理节点/订阅信息
│   ├── process.ts           # 进程管理服务：提供进程树查找、父子进程分析能力
│   ├── proxy-monitor.ts     # 监控服务：实时监控游戏进程启动，自动触发加速路由
│   ├── system.ts            # 系统服务：提供 DNS 刷新、虚拟网卡重置、网络测试等底层能力
│   └── updater.ts           # 更新服务：检查 GitHub Releases 新版本
│
└── utils/                   # [工具层] 通用工具函数库
    ├── command.ts           # 命令行工具：封装 exec/spawn 为 Promise，支持超时控制
    ├── format.ts            # 格式化工具：JSON 安全解析、URL 校验、类型转换
    ├── id.ts                # ID 工具：统一的 UUID 生成器
    ├── ping.ts              # 网络工具：实现 ICMP Ping 和 TCP Ping 延迟测试
    ├── port.ts              # 端口工具：查找可用端口、检测端口占用
    └── process-helper.ts    # 进程工具：进程名称标准化、跨平台路径处理、数组比较
```

## 模块详细说明

### 1. 入口层 (`main/`)
经过重构，入口层职责更加单一：
- **`index.ts`**: 核心入口，负责组装各个模块，初始化服务。
- **`bootstrap.ts`**: 处理应用启动前的环境准备，如强制管理员权限、处理 SQLite 原生模块错误。
- **`window.ts`**: 封装了 `BrowserWindow` 的创建与配置，管理窗口 IPC 事件（最小化/关闭）。
- **`tray.ts`**: 独立管理系统托盘逻辑。

### 2. 业务层 (`services/`)
这是代码最集中的地方，每个文件对应一个具体的业务领域。

#### 核心服务：`singbox/`
将原有的 `singbox.ts` 拆分为独立模块：
- **`index.ts`**: 服务外观 (Facade)，对外提供 `start`, `stop`, `restart` 接口。
- **`installer.ts`**: 专注于二进制文件的下载、解压和安装逻辑。
- **`config.ts`**: 专注于配置文件的生成、校验和动态规则更新。

#### 扫描服务：`game-scanner.ts` & `scanners/`
- **`game-scanner.ts`**: 作为统一入口，对外暴露 `scanLocalGamesFromPlatforms`。
- **`scanners/`**: 包含各平台的具体扫描实现：
    - **`steam.ts`**: 解析 Steam 库文件。
    - **`microsoft.ts`**: 结合注册表和 AppxManifest 解析 Xbox 游戏。
    - **`flat.ts`**: 简单的目录遍历扫描 (Epic/EA)。

#### 监控服务：`proxy-monitor.ts`
- 实现了智能进程捕获。它会轮询系统进程树，当发现已配置的游戏进程及其子进程启动时，自动通知 `singbox` 服务添加分流规则。

### 3. 工具层 (`utils/`)
提炼了纯函数工具，不依赖具体业务逻辑，易于测试和复用。
- **`command.ts`**: 解决了 Node.js 原生 `exec` 在 Windows 下的一些编码和窗口隐藏问题。
- **`process-helper.ts`**: 统一了全项目的进程名处理逻辑（如忽略大小写、去除 `.exe` 后缀），确保规则匹配的准确性。
