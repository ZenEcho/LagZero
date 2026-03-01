/**
 * 游戏对象接口
 *
 * 前后端共享的统一定义，所有游戏相关的 CRUD 操作均基于此接口。
 */
export interface Game {
    /** 游戏唯一 ID */
    id?: string
    /** 游戏名称 */
    name: string
    /** 图标 URL (支持 http/https/data URI) */
    iconUrl?: string
    /** 游戏进程名 (支持单个字符串或数组) */
    processName: string | string[]
    /** 主分类 ID */
    category: string
    /** 分类 ID 列表（支持多标签分类） */
    categories?: string[]
    /** 标签列表 */
    tags?: string[]
    /** 关联的配置文件 ID */
    profileId?: string
    /** 最后运行时间戳 (毫秒) */
    lastPlayed?: number
    /** 当前状态 */
    status?: 'idle' | 'accelerating'
    /** 延迟 (ms) */
    latency?: number
    /** 指定的节点 ID */
    nodeId?: string
    /** 代理模式：process (按进程) | routing (按路由规则) */
    proxyMode?: 'process' | 'routing'
    /** 路由规则列表 (bypass_cn, global, 或 IP CIDR) */
    routingRules?: string[]
    /** 是否启用链式代理（自动代理子进程） */
    chainProxy?: boolean
}

/**
 * 本地扫描到的游戏信息
 */
export type LocalScanGame = {
    name: string
    processName: string[]
    source: string
    installDir: string
}
