import type { NodeConfig } from '../types'

/**
 * 获取节点的唯一标识 key
 *
 * 优先使用 id，回退到 tag。
 */
export function nodeKeyOf(node: NodeConfig): string {
    return String(node.id || node.tag || '').trim()
}
