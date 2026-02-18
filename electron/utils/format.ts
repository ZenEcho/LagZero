/**
 * 检查字符串是否为有效的图标 URL
 * 
 * 支持 http/https/file 协议及 data URI scheme。
 * 
 * @param value - 要检查的字符串
 * @returns boolean - 如果是有效图标 URL 则返回 true
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
 * 标准化节点类型字符串
 * 
 * 将输入的节点类型转换为统一的内部标识符。
 * 例如：'ss' -> 'shadowsocks'
 * 
 * @param type - 原始节点类型
 * @returns string - 标准化后的节点类型
 */
export function normalizeNodeType(type: unknown): string {
  const t = String(type ?? '').trim().toLowerCase()
  if (t === 'ss' || t === 'shadowsocks') return 'shadowsocks'
  return t
}

/**
 * 安全解析 JSON 字符串
 * 
 * 尝试解析 JSON，如果失败则返回默认值，避免抛出异常。
 * 
 * @template T - 返回值的类型
 * @param value - JSON 字符串
 * @param fallback - 解析失败时返回的默认值
 * @returns T - 解析结果或默认值
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
 * 
 * @param value - 输入字符串
 * @returns string[] - 解析后的字符串数组
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
