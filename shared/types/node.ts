/**
 * TLS 配置接口
 */
export interface NodeTlsConfig {
    enabled: boolean
    disable_sni?: boolean
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
 * 前后端共享的统一定义，支持 Shadowsocks, VMess, VLESS, Trojan, Socks, HTTP,
 * Hysteria, Hysteria2, TUIC, AnyTLS, ShadowTLS 等协议。
 */
export interface NodeConfig {
    /** 节点唯一 ID */
    id?: string
    /** 节点协议类型 */
    type: string
    /** 节点标签/名称 */
    tag: string
    /** 服务器地址 */
    server: string
    /** 服务器端口 */
    server_port: number
    /** 服务器端口范围列表（Hysteria/Hysteria2） */
    server_ports?: string
    /** 端口跳跃间隔（Hysteria/Hysteria2） */
    hop_interval?: string
    /** UUID (vmess/vless 使用) */
    uuid?: string
    /** 密码 (shadowsocks/trojan 使用) */
    password?: string
    /** Hysteria 认证字符串 */
    auth?: string
    /** 加密方式 (shadowsocks 使用) */
    method?: string
    /** 插件名称 (如 obfs-local) */
    plugin?: string
    /** 插件参数 */
    plugin_opts?: string
    /** Hysteria/Hysteria2 混淆类型或密码 */
    obfs?: string
    /** Hysteria2 混淆密码 */
    obfs_password?: string
    /** 上行带宽限制（Mbps） */
    up_mbps?: number
    /** 下行带宽限制（Mbps） */
    down_mbps?: number
    /** 协议版本（ShadowTLS） */
    version?: number
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
    /** TUIC 拥塞控制算法 */
    congestion_control?: string
    /** TUIC UDP 中继模式 */
    udp_relay_mode?: string
    /** TUIC UDP over stream */
    udp_over_stream?: boolean
    /** TUIC 0-RTT 握手 */
    zero_rtt_handshake?: boolean
    /** TUIC 心跳间隔 */
    heartbeat?: string
    /** AnyTLS 空闲会话检查间隔 */
    idle_session_check_interval?: string
    /** AnyTLS 空闲会话超时 */
    idle_session_timeout?: string
    /** AnyTLS 保留的最小空闲会话数 */
    min_idle_session?: number
}
