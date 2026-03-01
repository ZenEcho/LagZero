/**
 * 标准化进程名称
 *
 * 去除路径前缀，只保留文件名，并去除首尾空格。
 *
 * @param processName - 原始进程名或路径
 * @returns 标准化后的进程文件名 (如 'game.exe')
 */
export function normalizeProcessName(processName: string): string {
    const raw = String(processName || '').trim()
    if (!raw) return ''
    const normalized = raw.replace(/\\/g, '/')
    return (normalized.split('/').pop() || normalized).trim()
}

/**
 * 标准化进程名列表
 *
 * 对列表中的每个进程名进行标准化，去重，
 * 并同时保留小写版本以支持忽略大小写的匹配。
 *
 * @param processNames - 原始进程名列表
 * @returns 处理后的去重进程名列表
 */
export function normalizeProcessNames(processNames: string[]): string[] {
    const set = new Set<string>()
    for (const item of processNames) {
        const normalized = normalizeProcessName(item)
        if (!normalized) continue
        for (const alias of expandProcessAliases(normalized)) {
            set.add(alias)
            const lower = alias.toLowerCase()
            if (lower !== alias) set.add(lower)
        }
    }
    return Array.from(set)
}

/**
 * 扩展进程名别名
 *
 * 例如输入 "chrome"，自动扩展为 ["chrome", "chrome.exe"]
 * 以容错用户输入时省略 .exe 后缀的情况。
 */
export function expandProcessAliases(processName: string): string[] {
    const value = String(processName || '').trim()
    if (!value) return []
    const aliases = new Set<string>([value])

    // Tolerate users entering "chrome" instead of "chrome.exe" on Windows.
    if (!value.includes('.') && !value.includes('/') && !value.includes('\\')) {
        aliases.add(`${value}.exe`)
    }

    return Array.from(aliases)
}

/**
 * 比较两个字符串数组是否相等 (忽略顺序)
 */
export function areStringArraysEqual(a: unknown, b: unknown): boolean {
    if (!Array.isArray(a) || !Array.isArray(b)) return false
    if (a.length !== b.length) return false
    const left = [...a].map(v => String(v)).sort()
    const right = [...b].map(v => String(v)).sort()
    return left.every((v, i) => v === right[i])
}
