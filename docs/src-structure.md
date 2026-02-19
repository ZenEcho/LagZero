# Frontend (Vue) 项目结构说明

本文档详细描述了 `src/` 目录下的代码结构与模块功能。本项目采用 **Vue 3 + TypeScript + Vite** 技术栈，使用 **Composition API** 和 **Pinia** 进行状态管理。

## 目录树

```
src/
├── api/                     # [接口层] 后端通信接口 (IPC 封装)
│   ├── index.ts             # 统一导出所有 API 模块
│   └── *.ts                 # 各业务模块 API (如 games.ts, nodes.ts, singbox.ts)
│
├── assets/                  # [资源层] 静态资源文件
│   ├── main.css             # 全局样式入口
│   └── style.css            # 基础样式定义
│
├── autoImport/              # [自动导入] 自动生成的类型声明
│   ├── auto-imports.d.ts    # 自动导入函数的类型声明
│   └── components.d.ts      # 自动导入组件的类型声明
│
├── components/              # [组件层] Vue 组件
│   ├── common/              # 通用基础组件 (图标选择器、主题切换等)
│   ├── dashboard/           # 仪表盘相关组件 (图表、节点选择器)
│   ├── library/             # 游戏库相关组件 (分类管理、编辑弹窗)
│   ├── node/                # 节点管理相关组件 (节点卡片、编辑/导入弹窗)
│   └── settings/            # 设置页面相关组件 (侧边栏、各设置模块)
│
├── composables/             # [逻辑层] 组合式函数 (Hooks)
│   ├── useAppUpdater.ts     # 应用更新逻辑
│   ├── useFilePicker.ts     # 文件选择逻辑
│   ├── useGameScanner.ts    # 游戏扫描逻辑
│   └── useTheme.ts          # 主题切换逻辑
│
├── constants/               # [常量层] 全局常量定义
│   └── index.ts             # 常量统一导出
│
├── layouts/                 # [布局层] 页面布局组件
│   └── MainLayout.vue       # 主布局 (侧边栏 + 内容区)
│
├── locales/                 # [国际化] i18n 语言包
│   ├── en-US.json           # 英文翻译
│   └── zh-CN.json           # 中文翻译
│
├── router/                  # [路由层] 路由配置
│   └── index.ts             # Vue Router 配置 (定义路由表)
│
├── stores/                  # [状态层] Pinia 状态管理
│   ├── index.ts             # Pinia 实例导出
│   ├── games.ts             # 游戏数据状态
│   ├── nodes.ts             # 节点数据状态
│   ├── settings.ts          # 应用设置状态
│   └── local-proxy.ts       # 本地代理状态
│
├── types/                   # [类型层] TypeScript 类型定义
│   ├── electron.d.ts        # Electron API 类型扩展
│   └── index.ts             # 核心业务类型定义 (Game, NodeConfig 等)
│
├── utils/                   # [工具层] 通用工具函数
│   ├── latency-session.ts   # 延迟测试会话管理
│   ├── protocol.ts          # 代理协议解析工具 (VMess, SS, VLESS 等)
│   ├── runtime-logger.ts    # 运行时日志捕获工具
│   └── singbox-config.ts    # sing-box 配置文件生成器
│
├── views/                   # [视图层] 页面级组件
│   ├── dashboard/           # 仪表盘页面
│   ├── library/             # 游戏库页面
│   ├── nodes/               # 节点列表页面
│   └── settings/            # 设置中心页面
│
├── App.vue                  # 应用根组件
├── main.ts                  # 应用入口文件 (挂载 Vue, Pinia, Router)
└── vite-env.d.ts            # Vite 环境类型声明
```

## 模块详细说明

### 1. 接口层 (`api/`)
- **IPC 封装**: 所有与 Electron 主进程的通信都通过 `window.electron` 等预加载脚本暴露的对象进行。
- **模块化**: 每个文件对应后端的 Service 模块，例如 `singbox.ts` 对应后端的 `SingboxService`。

### 2. 状态层 (`stores/`)
- **`games.ts`**: 管理本地游戏列表、当前选中游戏、加速状态。
- **`nodes.ts`**: 管理节点列表、节点延迟测试结果。
- **`settings.ts`**: 持久化存储用户设置（语言、主题、DNS 模式等）。

### 3. 工具层 (`utils/`)
- **`protocol.ts`**: 核心协议解析逻辑，负责将分享链接 (vmess://, ss://) 解析为标准节点配置对象。
- **`singbox-config.ts`**: 根据当前游戏规则和选中的节点，动态生成 sing-box 的 JSON 配置文件。

### 4. 逻辑层 (`composables/`)
- **Composition API**: 封装可复用的业务逻辑，例如 `useTheme.ts` 处理深色模式切换和主题色应用。
- **`useGameScanner.ts`**: 协调前端 UI 和后端扫描接口，处理扫描进度和结果展示。
