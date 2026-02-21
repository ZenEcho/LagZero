
import net from 'net'

/**
 * 查找可用端口
 * 
 * 从指定的起始端口开始，寻找连续 count 个可用端口。
 * 
 * @param startPort - 起始端口号
 * @param count - 需要的连续可用端口数量，默认 1
 * @returns Promise<number> - 找到的第一个可用端口号
 * @throws Error - 如果遍历到 65535 仍未找到可用端口
 */
export async function findAvailablePort(startPort: number, count: number = 1): Promise<number> {
    let port = startPort
    while (true) {
        let allAvailable = true
        for (let i = 0; i < count; i++) {
            const isAvailable = await isPortAvailable(port + i)
            if (!isAvailable) {
                allAvailable = false
                break
            }
        }

        if (allAvailable) {
            return port
        }

        port++
        if (port > 65535) {
            throw new Error('未找到可用端口')
        }
    }
}

/**
 * 检查指定端口是否可用
 * 
 * 尝试在本地监听该端口，如果成功则认为可用。
 * 
 * @param port - 要检查的端口号
 * @returns Promise<boolean> - true 表示可用，false 表示已被占用
 */
function isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer()
        server.once('error', () => resolve(false))
        server.once('listening', () => {
            server.close(() => resolve(true))
        })
        server.listen(port, '127.0.0.1')
    })
}
