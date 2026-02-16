
import { exec } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'

interface PingResult {
    latency: number
    loss: number
}

const isWindows = os.platform() === 'win32'

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

export function tcpPing(host: string, port: number, timeout = 2000): Promise<PingResult> {
    return new Promise((resolve) => {
        const start = Date.now()
        const socket = new net.Socket()

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
