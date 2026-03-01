import { v4 as uuidv4 } from 'uuid'

/**
 * 生成全局唯一的 UUID
 *
 * 统一封装 UUID 生成逻辑，方便后续统一替换生成算法。
 * 注意：此文件保留在 electron/utils 中，因为 uuid 包仅在主进程使用。
 * shared/ 层不应依赖 node 专有包。
 *
 * @returns string - UUID v4 字符串
 */
export function generateId(): string {
  return uuidv4()
}
