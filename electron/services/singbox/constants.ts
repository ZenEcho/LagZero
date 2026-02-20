import path from 'path'
import { app } from 'electron'

/**
 * 二进制文件存储目录
 * 位于用户数据目录下的 bin 文件夹中
 */
export const BIN_DIR = path.join(app.getPath('userData'), 'bin')
