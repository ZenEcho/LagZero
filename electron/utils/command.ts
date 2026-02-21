import { spawn } from 'child_process'

/**
 * 执行系统命令并返回结果
 * 
 * 封装了 child_process.spawn，支持超时控制和 Windows 窗口隐藏。
 * 
 * @param command - 要执行的命令（如 'ping', 'ipconfig'）
 * @param args - 命令参数数组
 * @param timeoutMs - 超时时间（毫秒），默认 15000ms
 * @returns Promise<{ code: number, output: string }>
 *          - code: 进程退出码，超时或错误时为 -1
 *          - output: 标准输出和标准错误合并后的字符串
 */
export function runCommand(command: string, args: string[], timeoutMs: number = 15000): Promise<{ code: number, output: string }> {
  return new Promise((resolve) => {
    const p = spawn(command, args, { windowsHide: true })
    const chunks: Buffer[] = []
    const onData = (d: any) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(String(d)))

    p.stdout?.on('data', onData)
    p.stderr?.on('data', onData)

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      p.kill()
    }, timeoutMs)

    p.on('close', (code) => {
      clearTimeout(timer)
      const output = Buffer.concat(chunks).toString('utf8').trim()
      if (timedOut) {
        resolve({ code: -1, output: output || '命令执行超时' })
        return
      }
      resolve({ code: typeof code === 'number' ? code : -1, output })
    })

    p.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, output: String(err?.message || err) })
    })
  })
}
