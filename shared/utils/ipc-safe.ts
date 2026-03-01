/**
 * 安全地将对象转换为可序列化的纯对象
 *
 * 用于确保通过 IPC 传输的数据不含不可序列化的内容（如 Proxy、函数等）。
 */
export function toIpcSafeSnapshot(snapshot: unknown): any {
    if (snapshot == null) return undefined
    try {
        return JSON.parse(JSON.stringify(snapshot))
    } catch {
        return undefined
    }
}
