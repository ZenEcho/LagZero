
import net from 'net'

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
            throw new Error('No available ports found')
        }
    }
}

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
