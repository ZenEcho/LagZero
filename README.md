# LagZero

一款基于 Vue3 + TypeScript + UnoCSS + Electron 的跨平台游戏加速器桌面客户端。

## 功能特性

- **现代化 UI**: 采用 UnoCSS 构建的原子化暗色主题界面。
- **核心集成**: 内置 sing-box 核心管理，支持自动下载与版本校验。
- **多协议支持**: 支持 VLESS, VMess, Trojan, Shadowsocks 等多种协议导入。
- **规则管理**: 提供可视化的路由规则编辑器与 IP 规则管理。
- **跨平台**: 支持 Windows, macOS, Linux。

## 开发指南

### 环境要求
- Node.js 18+
- pnpm 9+

### 安装依赖
```bash
pnpm install
```

### 启动开发环境
```bash
pnpm dev
```
此命令会同时启动 Vite 开发服务器（渲染进程）和 Electron（主进程）。

### 构建打包

#### 1. 打包为安装文件 (Production Installer)
构建适用于当前操作系统的安装包（如 Windows 的 `.exe`、macOS 的 `.dmg`、Linux 的 `.AppImage`）。
```bash
pnpm dist
```
构建产物位于 `release/` 目录下。

#### 2. 打包为免安装目录 (Unpacked Directory)
仅进行打包但不生成安装程序，输出为可执行文件夹。适合快速测试生产环境构建结果。
```bash
pnpm pack
```

### 常见问题 (Troubleshooting)

#### 原生模块 ABI 不匹配 (Native Module Mismatch)
本项目使用了 `better-sqlite3` 等原生模块。如果启动时报错 `NODE_MODULE_VERSION` 不匹配（例如 `127` vs `143`），说明原生模块是针对本地 Node.js 编译的，而不是 Electron。

请执行以下命令针对 Electron 重新编译依赖：

**Windows (PowerShell):**
```powershell
$env:npm_config_runtime='electron'; $env:npm_config_target='40.2.1'; $env:npm_config_disturl='https://electronjs.org/headers'; pnpm rebuild better-sqlite3
```
*(注：`40.2.1` 应替换为你当前安装的 Electron 版本)*

**macOS / Linux:**
```bash
npm_config_runtime=electron npm_config_target=40.2.1 npm_config_disturl=https://electronjs.org/headers pnpm rebuild better-sqlite3
```

### 测试
```bash
pnpm test
```

##### 项目结构
- `src/`: Vue 前端源码
- `electron/`: Electron 主进程与预加载脚本
- `electron/singbox/`: sing-box 核心管理逻辑
- `.github/workflows/`: CI/CD 配置

## 数据库说明 (Database)

本项目使用 **SQLite** 存储本地数据。

### 数据文件路径
- **开发环境 (Dev):** 项目根目录下的 `.lagzero-dev/lagzero.db`
- **生产环境 (Prod):** 用户数据目录下的 `lagzero.db`
  - Windows: `%APPDATA%\LagZero\lagzero.db`
  - macOS: `~/Library/Application Support/LagZero/lagzero.db`
  - Linux: `~/.config/lagzero/lagzero.db`

### 管理工具
推荐使用 [SQLiteStudio](https://sqlitestudio.pl/) 或其他 SQLite GUI 工具查看和管理数据库文件。

### 数据初始化
应用首次启动时，会自动检查并创建所需的表结构（Games, Nodes, Categories, Profiles），并写入默认的游戏分类数据（如 FPS, MOBA, RPG 等）。
