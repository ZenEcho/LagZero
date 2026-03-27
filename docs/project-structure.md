# LagZero 目录结构

## 1. 说明

下面的目录树是面向开发的精简版，省略了以下内容：

- 构建产物：`dist/`、`dist-electron/`、`release/`
- 依赖目录：`node_modules/`
- 本地 AI/IDE 辅助目录：`.agent/`、`.agents/`、`.codex/`、`.qoder/`、`.trae/`

## 2. 目录树

```text
LagZero
├─ docs/
├─ docImages/
├─ electron/
│  ├─ common/
│  │  └─ store.ts
│  ├─ db/
│  │  └─ schema.ts
│  ├─ main/
│  │  ├─ bootstrap.ts
│  │  ├─ index.ts
│  │  ├─ logger.ts
│  │  ├─ tray.ts
│  │  └─ window.ts
│  ├─ preload/
│  │  └─ index.ts
│  ├─ services/
│  │  ├─ scanners/
│  │  │  ├─ battlenet.ts
│  │  │  ├─ ea.ts
│  │  │  ├─ epic.ts
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
│  ├─ logo.ico
│  ├─ logo.png
│  └─ logo.svg
├─ shared/
│  ├─ types/
│  │  ├─ category.ts
│  │  ├─ game.ts
│  │  ├─ index.ts
│  │  ├─ node.ts
│  │  ├─ settings.ts
│  │  └─ singbox.ts
│  └─ utils/
│     ├─ format.ts
│     ├─ index.ts
│     ├─ ipc-safe.ts
│     ├─ node-key.ts
│     ├─ process-name.ts
│     └─ sleep.ts
├─ src/
│  ├─ api/
│  ├─ assets/
│  ├─ autoImport/
│  ├─ components/
│  │  ├─ common/
│  │  ├─ dashboard/
│  │  ├─ library/
│  │  ├─ node/
│  │  ├─ settings/
│  │  └─ singbox/
│  ├─ composables/
│  ├─ constants/
│  ├─ layouts/
│  ├─ locales/
│  ├─ router/
│  ├─ stores/
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
├─ package.json
├─ README.md
├─ uno.config.ts
├─ vite.config.ts
└─ vitest.config.ts
```

## 3. 关键目录职责

### `electron/`

Electron 主进程代码。这里负责：

- 应用启动与窗口生命周期
- 托盘窗口与主窗口通信
- IPC 注册
- 数据库存取
- 游戏扫描
- 系统命令、系统代理、TUN 与 DNS 控制
- sing-box 的安装、启动、停止、重启与日志转发

### `shared/`

跨进程共享层。这里应该只放“纯 TypeScript”代码：

- 公共类型
- 字符串/对象/数组等纯工具函数
- 进程名规范化、节点 key 计算、IPC 安全快照转换

如果一个文件需要同时在 `src/` 和 `electron/` 使用，优先考虑放到这里。

### `src/`

Vue 渲染进程代码。这里负责：

- 页面和组件
- Pinia 状态管理
- 路由组织
- i18n、多主题、样式
- sing-box 配置生成
- 通过 `src/api/` 调用 preload 暴露的主进程能力

### `tests/unit/`

Vitest 单元测试目录，当前重点覆盖：

- 配置生成
- 扫描工具
- 协议解析
- 代理监控
- UI 主题和局部业务逻辑

## 4. 重点文件速查

| 文件 | 作用 |
| --- | --- |
| `electron/main/index.ts` | 主进程总入口，服务实例化和 IPC 汇总注册 |
| `electron/preload/index.ts` | ContextBridge 暴露层，定义 `window.*` API |
| `src/main.ts` | 渲染进程入口，挂载 router/pinia/i18n，并处理主窗口初始化逻辑 |
| `src/router/index.ts` | 主窗口与托盘窗口路由定义 |
| `src/stores/games.ts` | 游戏加速主流程入口 |
| `src/stores/nodes.ts` | 节点管理、测速、订阅刷新与导入导出 |
| `src/stores/local-proxy.ts` | 本地代理自动选点、健康检查与自动恢复 |
| `src/stores/settings.ts` | 绝大多数设置项的持久化来源 |
| `src/utils/singbox-config.ts` | sing-box 配置生成核心 |
| `electron/services/database.ts` | SQLite 与业务数据落库核心 |

## 5. 推荐阅读顺序

### 想看应用怎么启动

1. `electron/main/index.ts`
2. `electron/main/window.ts`
3. `electron/preload/index.ts`
4. `src/main.ts`

### 想看加速链路怎么跑通

1. `src/views/dashboard/index.vue`
2. `src/stores/games.ts`
3. `src/utils/singbox-config.ts`
4. `electron/services/singbox/index.ts`
5. `electron/services/proxy-monitor.ts`

### 想看节点与订阅

1. `src/views/nodes/index.vue`
2. `src/stores/nodes.ts`
3. `electron/services/node.ts`
4. `electron/services/database.ts`

### 想看游戏扫描

1. `src/composables/useGameScanner.ts`
2. `electron/services/game-scanner.ts`
3. `electron/services/scanners/*.ts`
