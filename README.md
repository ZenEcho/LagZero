# <img src="public/logo.svg" width="32" height="32" /> LagZero

[![Vue](https://img.shields.io/badge/Vue-3.x-42b883.svg)](https://vuejs.org/)
[![Electron](https://img.shields.io/badge/Electron-40.x-47848F.svg)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)
[![UnoCSS](https://img.shields.io/badge/UnoCSS-Atomic-333333.svg)](https://unocss.dev/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**LagZero** 是一款专为极致游戏体验打造的跨平台、高性能游戏加速器桌面客户端。基于 **Vue 3**、**TypeScript** 和 **Electron** 构建，底层集成强大的 **sing-box** 核心，旨在提供最低延迟、最稳定的网络加速方案。

---

## ✨ 核心特性

- 🚀 **极速性能**: 底层采用高性能网络核心，支持多线程加速，确保毫秒级响应。
- 🎨 **现代美学**: 深度定制的 **Glassmorphism**（磨砂玻璃）设计风格，极致的暗色模式体验。
- 🛠️ **智能监控**: 独创的 **Chain Proxy** 进程链追踪技术，自动识别并加速游戏子进程。
- 🔧 **高度可定制**: 可视化路由规则编辑器，支持 VLESS, VMess, Trojan, Shadowsocks 等主流协议。
- 📦 **开箱即用**: 内置 sing-box 核心自动管理，支持一键更新与版本校验。
- 🌍 **跨平台支撑**: 完美适配 Windows, macOS 和 Linux 操作系统。

---

## 📸 界面预览

_(截图正在准备中...)_

---

## 🛠️ 技术栈

- **前端**: Vue 3 (Composition API), Pinia, Vue Router, Naive UI
- **样式**: UnoCSS (Atomic CSS), Sass
- **桌面**: Electron
- **网络核心**: sing-box
- **数据库**: SQLite (Better-SQLite3 + Kysely)
- **构建工具**: Vite, Electron Builder

---

## 🚀 快速开始

### 环境要求

- **Node.js**: 18.x 或更高版本
- **包管理器**: [pnpm](https://pnpm.io/) 9.x 或更高版本

### 安装依赖

```bash
pnpm install
```

### 启动开发环境

```bash
pnpm dev
```

### 构建打包

| 平台        | 命令                | 说明                                   |
| :---------- | :------------------ | :------------------------------------- |
| **通用**    | `pnpm dist`         | 打包当前平台的安装包（Installer）      |
| **通用**    | `pnpm pack`         | 打包为免安装目录（Unpacked）           |
| **Windows** | `pnpm dist:win:all` | 同时生成 x64 和 arm64 的安装包与便携版 |

---

## 📂 项目结构

```text
├── .github/          # GitHub Actions 自动化配置
├── docs/             # 项目文档 (API, 用户手册)
├── electron/         # Electron 主进程源码
│   ├── main.ts       # 进程入口
│   └── singbox/      # sing-box 核心集成逻辑
├── src/              # 渲染进程 (Vue 源码)
│   ├── components/   # 组件
│   ├── views/        # 页面
│   ├── stores/       # 状态管理
│   └── assets/       # 静态资源
└── tests/            # 单元测试与集成测试
```

---

## ❓ 常见问题

### 原生模块 ABI 报错

由于使用了 `better-sqlite3` 等原生模块，如果遇到 `NODE_MODULE_VERSION` 冲突，请尝试：

**Windows (PowerShell):**

```powershell
$env:npm_config_runtime='electron'; $env:npm_config_target='40.2.1'; $env:npm_config_disturl='https://electronjs.org/headers'; pnpm rebuild better-sqlite3
```

---

## 📜 许可协议

本项目采用 [MIT License](LICENSE) 开源。

---

## 🤝 贡献与反馈

欢迎提交 Issue 或 Pull Request 来完善 LagZero！

- **仓库**: [GitHub/ZenEcho/LagZero](https://github.com/ZenEcho/LagZero)
- **文档**: 详见 [docs](./docs) 目录
