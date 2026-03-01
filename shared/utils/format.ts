/**
 * 标准化节点类型字符串
 *
 * 统一前后端对节点类型的标识，合并了两端原有的逻辑。
 *
 * @param type - 原始节点类型
 * @returns 标准化后的节点类型
 *
 * @example
 * normalizeNodeType('ss')      // 'shadowsocks'
 * normalizeNodeType('socks5')  // 'socks'
 * normalizeNodeType('https')   // 'http'
 */
export function normalizeNodeType(type: unknown): string {
    const t = String(type ?? '').trim().toLowerCase()
    if (t === 'ss' || t === 'shadowsocks') return 'shadowsocks'
    if (t === 'socks5' || t === 'socks') return 'socks'
    if (t === 'https' || t === 'http') return 'http'
    return t
}

/**
 * 检查字符串是否为有效的图标 URL
 *
 * 支持 http/https/file 协议及 data URI scheme。
 */
export function isIconUrl(value: string): boolean {
    const v = value.trim()
    return (
        v.startsWith('http://') ||
        v.startsWith('https://') ||
        v.startsWith('file://') ||
        v.startsWith('data:')
    )
}

/**
 * 安全解析 JSON 字符串
 *
 * 尝试解析 JSON，如果失败则返回默认值，避免抛出异常。
 */
export function safeJsonParse<T>(value: string, fallback: T): T {
    try {
        return JSON.parse(value) as T
    } catch {
        return fallback
    }
}

/**
 * 解析字符串数组
 *
 * 支持解析 JSON 数组字符串或逗号分隔的字符串。
 */
export function parseStringArray(value: string): string[] {
    try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) {
            return parsed.map(v => String(v).trim()).filter(Boolean)
        }
    } catch {
        // ignore
    }
    return value.split(/[,，]/).map(v => v.trim()).filter(Boolean)
}
