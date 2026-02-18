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
│   ├── index.ts             # **应用入口**：负责 App 生命周期、窗口创建、IPC 注册、服务组装
│   └── logger.ts            # 日志系统：负责日志文件写入、轮转及向渲染进程广播日志
│
├── preload/                 # [桥接层] 预加载脚本
│   └── index.ts             # 暴露给渲染进程的 API 定义 (ContextBridge)
│
├── services/                # [业务层] 核心业务逻辑服务 (Service)
│   ├── category.ts          # 游戏分类服务：管理侧边栏分类数据
│   ├── database.ts          # 数据库服务：封装 SQLite 连接与基础 CRUD 操作
│   ├── game-scanner.ts      # 游戏扫描服务：自动识别 Steam/Epic/Xbox/EA 本地已安装游戏
│   ├── game.ts              # 游戏管理服务：管理“我的游戏”列表、配置与状态
│   ├── node.ts              # 节点管理服务：管理代理节点/订阅信息
│   ├── process.ts           # 进程管理服务：提供进程树查找、父子进程分析能力
│   ├── proxy-monitor.ts     # 监控服务：实时监控游戏进程启动，自动触发加速路由
│   ├── singbox.ts           # **核心加速服务**：管理 sing-box 内核进程、生成配置、处理路由规则
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
- **`index.ts`**:
    - 是整个 Electron 应用的起点。
    - 负责初始化所有 Service 实例（依赖注入）。
    - 处理窗口管理（最小化、最大化、关闭）。
    - 处理系统托盘 (Tray) 逻辑。
- **`logger.ts`**:
    - 实现了双向日志系统：既记录后端日志，也接收前端日志。
    - 包含日志文件自动清理策略（限制文件大小和总占用空间）。

### 2. 业务层 (`services/`)
这是代码最集中的地方，每个文件对应一个具体的业务领域：
- **`singbox.ts`**: 最核心的文件。负责下载 sing-box 内核、生成 `config.json`、启动/停止内核、动态更新路由规则。
- **`proxy-monitor.ts`**: 实现了智能进程捕获。它会轮询系统进程树，当发现已配置的游戏进程及其子进程启动时，自动通知 `singbox.ts` 添加分流规则。
- **`game-scanner.ts`**: 包含复杂的跨平台（目前主要是 Windows）扫描逻辑，读取注册表、Steam 库文件 (`libraryfolders.vdf`) 等信息来定位游戏。

### 3. 工具层 (`utils/`)
提炼了纯函数工具，不依赖具体业务逻辑，易于测试和复用。
- **`command.ts`**: 解决了 Node.js 原生 `exec` 在 Windows 下的一些编码和窗口隐藏问题。
- **`process-helper.ts`**: 统一了全项目的进程名处理逻辑（如忽略大小写、去除 `.exe` 后缀），确保规则匹配的准确性。
