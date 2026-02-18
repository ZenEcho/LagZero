# Singbox 配置生成工具说明文档

该模块 (`src/utils/singbox-config.ts`) 负责根据用户选择的游戏规则和节点信息生成 Sing-box 核心能够识别的 JSON 配置文件。

## 主要功能

1.  **多协议支持**：支持 Shadowsocks, VMess, VLESS, Trojan, SOCKS, HTTP 等主流代理协议。
2.  **传输层配置**：支持 WebSocket (WS) 和 gRPC 等传输方式。
3.  **TLS/REALITY**：支持标准的 TLS 配置，并集成了 REALITY 协议支持。
4.  **代理模式切换**：
    - **进程模式 (Process Mode)**：仅对指定的应用程序进程进行加速，其余流量直连。
    - **路由模式 (Routing Mode)**：支持“全局代理”或“绕过中国大陆”规则。
5.  **安全 DNS**：支持 DoH/DoT 安全 DNS 查询，防止 DNS 污染。
6.  **TUN 网卡集成**：自动配置 TUN 虚拟网卡，实现透明代理。

## 核心接口

### `generateSingboxConfig(game, node, dnsOptions?)`

这是该模块的主入口函数。

- **参数**:
  - `game`: `Game` 类型，包含代理模式、路由规则以及需要加速的进程名称列表。
  - `node`: `NodeConfig` 类型，包含服务器地址、端口、协议参数等。
  - `dnsOptions`: `DnsConfigOptions` 类型，可选配置 DNS 模式及自定义 DNS 地址。
- **返回值**: 格式化后的 Sing-box JSON 字符串。

## 路由逻辑说明

### 进程模式

在该模式下，程序会生成基于 `process_name` 的路由规则。只有匹配到游戏进程名的流量才会被导向 `proxy` 出口，默认规则为 `direct`（直连）。

### 路由模式

在该模式下，默认出口设为 `proxy`。

- 如果启用了 `bypass_cn` (绕过中国大陆)，程序会添加一系列针对私有 IP、`.cn` 后缀域名以及常见国内域名（如 qq.com, baidu.com 等）的直连规则。

## DNS 逻辑

模块默认配置了以下 DNS 策略：

- **远端 DNS (`remote-primary`)**: 默认使用 Google DNS 或 Cloudflare DNS，通过 `proxy` 链路进行加密查询。
- **本地 DNS (`local`)**: 用于解析直连域名的系统默认 DNS。
- 当开启 `secure` 模式时，指定加速的进程会强制使用远端 DNS 解析，以确保获取最准确的加速 IP。

## 进程名标准化

模块内部包含 `normalizeProcessNames` 函数，它会自动：

1.  去除进程路径，仅保留文件名（例如 `C:\Games\Game.exe` -> `Game.exe`）。
2.  处理 Windows 路径风格。
3.  自动生成小写版本的文件名，以处理部分系统的大小写敏感问题，增强兼容性。
