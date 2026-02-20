
import { exec } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'

/**
 * Ping 测试结果接口
 */
interface PingResult {
    /** 延迟 (毫秒)，-1 表示超时或不可达 */
    latency: number
    /** 丢包率 (0-100) */
    loss: number
}

const isWindows = os.platform() === 'win32'

/**
 * 执行 ICMP Ping 测试
 * 
 * 使用系统 ping 命令测试目标主机的连通性和延迟。
 * 
 * @param host - 目标主机 (域名或 IP)
 * @param timeout - 超时时间 (毫秒)，默认 2000ms
 * @returns Promise<PingResult> - 测试结果
 */
export function ping(host: string, timeout = 2000): Promise<PingResult> {
    return new Promise((resolve) => {
        // Windows: -n 1 (count), -w timeout (ms)
        // Linux/Mac: -c 1 (count), -W timeout (s)

        // Safety check for host to prevent injection
        if (/[^a-zA-Z0-9.-]/.test(host)) {
            return resolve({ latency: -1, loss: 100 })
        }

        const cmd = isWindows
            ? `ping -n 1 -w ${timeout} ${host}`
            : `ping -c 1 -W ${Math.ceil(timeout / 1000)} ${host}`

        const start = Date.now()
        exec(cmd, (error, stdout, stderr) => {
            const duration = Date.now() - start

            if (error) {
                // Ping failed (timeout or other error)
                resolve({ latency: -1, loss: 100 })
                return
            }

            // Parse output
            let latency = -1
            if (isWindows) {
                // Windows output formats:
                // EN: Reply from 1.1.1.1: bytes=32 time=13ms TTL=56
                // CN: 来自 1.1.1.1 的回复: 字节=32 时间=13ms TTL=56
                const match = stdout.match(/[=<]([\d\.]+) ?ms/)
                if (match && match[1]) {
                    latency = Math.round(parseFloat(match[1]))
                }
            } else {
                // 64 bytes from 1.1.1.1: icmp_seq=1 ttl=56 time=14.5 ms
                const match = stdout.match(/time[=<]([\d\.]+) ?ms/)
                if (match && match[1]) {
                    latency = Math.round(parseFloat(match[1]))
                }
            }

            resolve({
                latency: latency > 0 ? latency : -1,
                loss: latency > 0 ? 0 : 100
            })
        })
    })
}

/**
 * 执行 TCP Ping 测试
 * 
 * 尝试建立 TCP 连接来测试端口连通性和延迟。
 * 比 ICMP Ping 更能反映实际服务的可用性。
 * 
 * @param host - 目标主机
 * @param port - 目标端口
 * @param timeout - 超时时间 (毫秒)，默认 2000ms
 * @returns Promise<PingResult> - 测试结果
 */
export function tcpPing(host: string, port: number, timeout = 2000): Promise<PingResult> {
    return new Promise((resolve) => {
        const start = Date.now()
        const socket = new net.Socket() 
        socket.setNoDelay(true) 

        let resolved = false

        const done = (latency: number, loss: number) => {
            if (resolved) return
            resolved = true
            socket.destroy()
            resolve({ latency, loss })
        }

        socket.setTimeout(timeout)

        socket.on('connect', () => {
            const duration = Date.now() - start
            done(duration, 0)
        })

        socket.on('timeout', () => {
            done(-1, 100)
        })

        socket.on('error', (err) => {
            done(-1, 100)
        })

        try {
            socket.connect(port, host)
        } catch (e) {
            done(-1, 100)
        }
    })
}
