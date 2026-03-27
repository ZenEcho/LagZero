# LagZero 目录结构

## 1. 说明

下面的目录树是面向开发和发布维护的精简版，刻意省略了以下内容：

- 构建产物：`dist/`、`dist-electron/`、`release/`
- 依赖目录：`node_modules/`
- 本地工具目录：`.agent/`、`.agents/`、`.codex/`、`.qoder/`、`.trae/`

## 2. 当前目录树

```text
LagZero
├─ docs/
│  ├─ README.md
│  ├─ development-guide.md
│  ├─ module-usage.md
│  ├─ project-structure.md
│  ├─ release-checklist.md
│  └─ subscription-deep-link.md
├─ docImages/
├─ electron/
│  ├─ common/
│  │  ├─ runtime-paths.ts
│  │  └─ store.ts
│  ├─ db/
│  │  └─ schema.ts
│  ├─ main/
│  │  ├─ bootstrap.ts
│  │  ├─ deep-link.ts
│  │  ├─ index.ts
│  │  ├─ logger.ts
│  │  ├─ protocol-client.ts
│  │  ├─ tray.ts
│  │  └─ window.ts
│  ├─ preload/
│  │  └─ index.ts
│  ├─ services/
│  │  ├─ scanners/
│  │  │  ├─ battlenet.ts
│  │  │  ├─ ea.ts
│  │  │  ├─ epic.ts
│  │  │  ├─ flat.ts
│  │  │  ├─ local.ts
│  │  │  ├─ microsoft.ts
│  │  │  ├─ steam.ts
│  │  │  ├─ types.ts
│  │  │  ├─ utils.ts
│  │  │  └─ wegame.ts
│  │  ├─ singbox/
│  │  │  ├─ config.ts
│  │  │  ├─ constants.ts
│  │  │  ├─ index.ts
│  │  │  ├─ installer.ts
│  │  │  └─ utils.ts
│  │  ├─ category.ts
│  │  ├─ database.ts
│  │  ├─ game-scanner.ts
│  │  ├─ game.ts
│  │  ├─ node.ts
│  │  ├─ process.ts
│  │  ├─ proxy-monitor.ts
│  │  ├─ system.ts
│  │  └─ updater.ts
│  └─ utils/
│     ├─ command.ts
│     ├─ id.ts
│     ├─ ping.ts
│     └─ port.ts
├─ public/
├─ shared/
│  ├─ types/
│  └─ utils/
├─ src/
│  ├─ api/
│  │  ├─ app.ts
│  │  ├─ categories.ts
│  │  ├─ electron.ts
│  │  ├─ games.ts
│  │  ├─ index.ts
│  │  ├─ nodes.ts
│  │  ├─ proxy-monitor.ts
│  │  ├─ singbox.ts
│  │  └─ system.ts
│  ├─ assets/
│  ├─ autoImport/
│  ├─ components/
│  ├─ composables/
│  ├─ constants/
│  ├─ layouts/
│  ├─ locales/
│  ├─ router/
│  ├─ stores/
│  │  ├─ categories.ts
│  │  ├─ games.ts
│  │  ├─ local-proxy.ts
│  │  ├─ nodes.ts
│  │  ├─ settings.ts
│  │  └─ singbox-installer.ts
│  ├─ types/
│  ├─ utils/
│  ├─ views/
│  │  ├─ dashboard/
│  │  ├─ library/
│  │  ├─ nodes/
│  │  ├─ settings/
│  │  └─ tray/
│  ├─ App.vue
│  ├─ i18n.ts
│  └─ main.ts
├─ tests/
│  └─ unit/
│     ├─ bootstrap.spec.ts
│     ├─ CategoryManager.spec.ts
│     ├─ deep-link.spec.ts
│     ├─ JsonStore.spec.ts
│     ├─ process-tree.spec.ts
│     ├─ protocol-client.spec.ts
│     ├─ protocol.spec.ts
│     ├─ proxy-monitor.spec.ts
│     ├─ scanner-utils.spec.ts
│     ├─ singbox-config-session.spec.ts
│     ├─ singbox-config.spec.ts
│     ├─ steam-scanner.spec.ts
│     └─ useTheme.spec.ts
├─ package.json
├─ README.md
├─ uno.config.ts
├─ vite.config.ts
└─ vitest.config.ts
```

## 3. 关键目录职责

### `electron/`

Electron 主进程代码。主要负责：

- 启动、窗口生命周期与托盘
- 自定义协议注册、协议守护与单实例深链转发
- SQLite 数据落库
- 游戏扫描
- 系统命令、系统代理、TUN 与 DNS 控制
- sing-box 的安装、启动、停止、重启与日志转发

### `shared/`

跨进程共享层。这里只应该放纯 TypeScript 内容：

- 公共类型
- 纯工具函数
- 进程名、节点 key、IPC 安全快照等与运行环境无关的逻辑

如果某段代码需要同时在 `src/` 和 `electron/` 使用，优先考虑放到这里。

### `src/`

Vue 渲染进程代码。主要负责：

- 页面和组件
- Pinia 状态管理
- 路由和布局
- i18n、多主题、样式
- sing-box 配置生成
- 通过 `src/api/` 调用 preload 暴露的主进程能力

### `tests/unit/`

Vitest 单元测试目录，当前重点覆盖：

- 协议解析
- deep link 和协议注册辅助逻辑
- 扫描器与扫描工具
- sing-box 配置生成
- 代理监控、进程树和主题相关逻辑

## 4. 重点文件速查

| 文件 | 作用 |
| --- | --- |
| `electron/main/index.ts` | 主进程总入口，负责服务实例化、协议注册、窗口创建与 IPC 汇总 |
| `electron/main/bootstrap.ts` | 启动前提权、图标加载、启动错误格式化 |
| `electron/main/deep-link.ts` | deep link 解析与参数校验 |
| `electron/main/protocol-client.ts` | `clash://` / `mihomo://` 默认协议注册与守护辅助逻辑 |
| `electron/common/runtime-paths.ts` | 开发态、打包态运行时目录决策与旧数据迁移入口 |
| `electron/preload/index.ts` | ContextBridge 暴露层，定义 `window.*` API |
| `src/main.ts` | 渲染进程入口，初始化本地代理与安装器状态 |
| `src/layouts/MainLayout.vue` | 主布局、版本检查、deep link 导入消费、托盘状态同步 |
| `src/stores/games.ts` | 游戏加速主流程入口 |
| `src/stores/nodes.ts` | 节点管理、测速、订阅刷新与导入导出 |
| `src/stores/local-proxy.ts` | 本地代理自动选点、健康检查与自动恢复 |
| `src/stores/settings.ts` | 绝大多数设置项的持久化来源 |
| `src/stores/singbox-installer.ts` | sing-box 核心安装状态与版本选择 |
| `src/utils/singbox-config.ts` | sing-box 配置生成核心 |
| `src/utils/protocol.ts` | 分享链接、Clash YAML、Base64 订阅解析 |
| `electron/services/database.ts` | SQLite 与业务数据落库核心 |

## 5. 推荐阅读顺序

### 想看应用怎么启动

1. `electron/main/index.ts`
2. `electron/main/window.ts`
3. `electron/preload/index.ts`
4. `src/main.ts`
5. `src/layouts/MainLayout.vue`

### 想看加速链路怎么跑通

1. `src/views/dashboard/index.vue`
2. `src/stores/games.ts`
3. `src/stores/local-proxy.ts`
4. `src/utils/singbox-config.ts`
5. `electron/services/singbox/index.ts`
6. `electron/services/proxy-monitor.ts`

### 想看节点、订阅与深链导入

1. `src/views/nodes/index.vue`
2. `src/stores/nodes.ts`
3. `src/utils/protocol.ts`
4. `electron/main/deep-link.ts`
5. `src/layouts/MainLayout.vue`

### 想看游戏扫描

1. `src/composables/useGameScanner.ts`
2. `electron/services/game-scanner.ts`
3. `electron/services/scanners/*.ts`

### 想看发布相关行为

1. `electron/common/runtime-paths.ts`
2. `electron/main/bootstrap.ts`
3. `electron/main/protocol-client.ts`
4. [release-checklist.md](./release-checklist.md)
