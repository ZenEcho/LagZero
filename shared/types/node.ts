/**
 * TLS 配置接口
 */
export interface NodeTlsConfig {
    enabled: boolean
    server_name?: string
    insecure?: boolean
    utls?: {
        enabled: boolean
        fingerprint: string
    }
    reality?: {
        enabled: boolean
        public_key?: string
        short_id?: string
    }
}

/**
 * 代理节点配置接口
 *
 * 前后端共享的统一定义，支持 Shadowsocks, VMess, VLESS, Trojan, Socks, HTTP 等协议。
 */
export interface NodeConfig {
    /** 节点唯一 ID */
    id?: string
    /** 节点协议类型 (shadowsocks, vmess, vless, trojan, socks, http) */
    type: string
    /** 节点标签/名称 */
    tag: string
    /** 服务器地址 */
    server: string
    /** 服务器端口 */
    server_port: number
    /** UUID (vmess/vless 使用) */
    uuid?: string
    /** 密码 (shadowsocks/trojan 使用) */
    password?: string
    /** 加密方式 (shadowsocks 使用) */
    method?: string
    /** 插件名称 (如 obfs-local) */
    plugin?: string
    /** 插件参数 */
    plugin_opts?: string
    /** 传输协议 (tcp, ws, grpc 等) */
    network?: string
    /** 安全类型 (tls, reality, none) */
    security?: string
    /** 路径 (ws/grpc 使用) */
    path?: string
    /** 主机名 (ws/grpc 使用) */
    host?: string
    /** 服务名称 (grpc 使用) */
    service_name?: string
    /** ALPN 协商协议列表 (逗号分隔) */
    alpn?: string
    /** uTLS 指纹 */
    fingerprint?: string
    /** TLS 配置 */
    tls?: NodeTlsConfig
    /** 流控 (vless/xtls 使用) */
    flow?: string
    /** 数据包编码 (如 xudp) */
    packet_encoding?: string
    /** 用户名 (socks/http 使用) */
    username?: string
}
