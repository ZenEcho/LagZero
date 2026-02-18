import { Generated } from 'kysely'

/**
 * 节点表结构
 * 存储代理服务器配置信息
 */
export interface NodesTable {
  /** 唯一 ID (UUID) */
  id: string
  /** 节点类型 (如 shadowsocks, vmess, trojan) */
  type: string
  /** 节点标签/名称 */
  tag: string
  /** 服务器地址 */
  server: string
  /** 服务器端口 */
  server_port: number
  /** UUID (vmess/vless 等使用) */
  uuid: string | null
  /** 密码 (shadowsocks/trojan 等使用) */
  password: string | null
  /** 加密方式 */
  method: string | null
  /** 插件名称 */
  plugin: string | null
  /** 插件参数 */
  plugin_opts: string | null
  /** 传输协议网络类型 (tcp/ws/grpc 等) */
  network: string | null
  /** 安全类型 (tls/xtls 等) */
  security: string | null
  /** 路径 (ws/grpc 等使用) */
  path: string | null
  /** 主机名 (ws/grpc 等使用) */
  host: string | null
  /** 服务名称 (grpc 使用) */
  service_name: string | null
  /** ALPN */
  alpn: string | null
  /** 指纹 */
  fingerprint: string | null
  /** TLS 配置 (JSON 字符串) */
  tls: string | null // JSON
  /** 流控 (xtls 等使用) */
  flow: string | null
  /** 数据包编码 */
  packet_encoding: string | null
  /** 用户名 */
  username: string | null
  /** 创建时间 */
  created_at: Generated<string>
  /** 更新时间 */
  updated_at: Generated<string>
}

/**
 * 配置文件表结构
 * 存储分流规则集合
 */
export interface ProfilesTable {
  /** 唯一 ID */
  id: string
  /** 配置文件名称 */
  name: string
  /** 描述信息 */
  description: string | null
  /** 规则列表 (JSON 字符串) */
  rules: string // JSON: { type, value, outbound }[]
  /** 是否启用链式代理 (0/1) */
  chain_proxy: number // boolean 0/1
  /** 创建时间 */
  created_at: Generated<string>
  /** 更新时间 */
  updated_at: Generated<string>
}

/**
 * 游戏分类表结构
 */
export interface CategoriesTable {
  /** 唯一 ID */
  id: string
  /** 分类名称 */
  name: string
  /** 父分类 ID */
  parent_id: string | null
  /** 匹配规则 (JSON 字符串数组) */
  rules: string | null // JSON string[]
  /** 图标 URL 或 Base64 */
  icon: string | null
  /** 排序索引 */
  order_index: number
  /** 创建时间 */
  created_at: Generated<string>
  /** 更新时间 */
  updated_at: Generated<string>
}

/**
 * 游戏表结构
 */
export interface GamesTable {
  /** 唯一 ID */
  id: string
  /** 游戏名称 */
  name: string
  /** 游戏图标 */
  icon: string | null
  /** 进程名称列表 (JSON 字符串数组) */
  process_name: string // JSON string[] or comma separated? Let's use JSON for string[]
  /** 所属分类 ID */
  category_id: string
  /** 标签列表 (JSON 字符串数组) */
  tags: string | null // JSON string[]
  /** 关联的配置文件 ID */
  profile_id: string | null
  /** 最后运行时间戳 */
  last_played: number | null
  /** 状态 (idle/running 等) */
  status: string | null
  /** 延迟数据 */
  latency: number | null
  /** 指定的出口节点 ID */
  node_id: string | null
  /** 代理模式 ('process' | 'routing') */
  proxy_mode: string | null // 'process' | 'routing'
  /** 路由规则 (JSON 字符串数组) */
  routing_rules: string | null // JSON string[]
  /** 是否启用链式代理 (0/1) */
  chain_proxy: number // boolean 0/1
  /** 创建时间 */
  created_at: Generated<string>
  /** 更新时间 */
  updated_at: Generated<string>
}

/**
 * 数据库全表接口定义
 */
export interface Database {
  nodes: NodesTable
  profiles: ProfilesTable
  categories: CategoriesTable
  games: GamesTable
}
