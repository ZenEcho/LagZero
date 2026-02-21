import fs from 'fs-extra'
import path from 'path'
import AdmZip from 'adm-zip'
import * as tar from 'tar'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import { Readable } from 'stream'
import https from 'node:https'
import { generateId } from '../../utils/id'
import { BIN_DIR } from './constants'

/**
 * 日志回调函数类型
 */
export type LogFn = (message: string, type?: 'info' | 'error') => void
export type InstallerPhase =
  | 'checking'
  | 'ready'
  | 'missing'
  | 'resolving'
  | 'downloading'
  | 'extracting'
  | 'completed'
  | 'failed'

export interface InstallerStatus {
  phase: InstallerPhase
  installDir: string
  binaryPath: string
  version?: string
  downloadUrl?: string
  progress?: number
  downloadedBytes?: number
  totalBytes?: number
  error?: string
  isTimeout?: boolean
}

export type StatusFn = (status: InstallerStatus) => void

/**
 * Sing-box 安装器
 * 负责检查、下载和安装 sing-box 内核
 */
export class SingBoxInstaller {
  private log: LogFn
  private onStatus?: StatusFn
  private installingPromise: Promise<string> | null = null

  constructor(logFn: LogFn, statusFn?: StatusFn) {
    this.log = logFn
    this.onStatus = statusFn
  }

  getInstallDir() {
    return BIN_DIR
  }

  getBinaryPath() {
    const ext = process.platform === 'win32' ? '.exe' : ''
    return path.join(BIN_DIR, `sing-box${ext}`)
  }

  async checkBinaryExists() {
    const binPath = this.getBinaryPath()
    if (await fs.pathExists(binPath)) return true
    return this.tryAdoptManualBinary(binPath)
  }

  /**
   * 检查 sing-box 是否存在，不存在则自动下载
   * @returns 可执行文件的绝对路径
   */
  async checkAndDownloadBinary(): Promise<string> {
    if (this.installingPromise) {
      this.log('检测到已有 sing-box 安装任务，等待完成...')
      return this.installingPromise
    }

    this.installingPromise = this.checkAndDownloadBinaryInternal()
    try {
      return await this.installingPromise
    } finally {
      this.installingPromise = null
    }
  }

  private async checkAndDownloadBinaryInternal(): Promise<string> {
    await fs.ensureDir(BIN_DIR)
    const platform = process.platform
    const arch = process.arch
    const binPath = this.getBinaryPath()
    this.emitStatus({ phase: 'checking' })

    if (await this.checkBinaryExists()) {
      this.emitStatus({ phase: 'ready' })
      return binPath
    }

    this.emitStatus({ phase: 'missing' })
    return this.downloadAndInstallBinary(platform, arch, binPath)
  }

  /**
   * 执行下载和安装流程
   */
  private async downloadAndInstallBinary(platform: NodeJS.Platform, arch: string, binPath: string): Promise<string> {
    this.log('未检测到 sing-box，开始自动下载...')
    this.emitStatus({ phase: 'resolving' })
    let version: string | undefined
    let downloadUrl: string | undefined
    let archivePath = ''
    let extractDir = ''

    try {
      const resolved = await this.resolveLatestReleaseDownload(platform, arch)
      version = resolved.version
      downloadUrl = resolved.downloadUrl
      const archiveExt = resolved.archiveExt
      this.emitStatus({
        phase: 'downloading',
        version,
        downloadUrl,
        progress: 0,
        downloadedBytes: 0
      })

      archivePath = path.join(BIN_DIR, `sing-box-${version}${archiveExt}`)
      extractDir = path.join(BIN_DIR, `tmp-${generateId()}`)
      await fs.ensureDir(extractDir)
      await this.downloadToFile(downloadUrl, archivePath, (progress, downloadedBytes, totalBytes) => {
        this.emitStatus({
          phase: 'downloading',
          version,
          downloadUrl,
          progress,
          downloadedBytes,
          totalBytes
        })
      })
      this.emitStatus({
        phase: 'extracting',
        version,
        downloadUrl,
        progress: 100
      })
      await this.extractAndInstall(archivePath, archiveExt, extractDir, binPath, platform === 'win32')

      if (!await fs.pathExists(binPath)) {
        throw new Error('安装完成后仍未找到 sing-box 可执行文件')
      }

      this.log(`sing-box 已安装：${binPath}`)
      this.emitStatus({
        phase: 'completed',
        version,
        downloadUrl,
        progress: 100
      })
      return binPath
    } catch (e: any) {
      const msg = `sing-box 自动下载/安装失败：${String(e?.message || e)}`
      this.log(msg, 'error')
      this.emitStatus({
        phase: 'failed',
        version,
        downloadUrl,
        error: msg,
        isTimeout: /timeout|超时/i.test(msg)
      })
      throw new Error(msg)
    } finally {
      if (extractDir) {
        await fs.remove(extractDir).catch(() => {})
      }
      if (archivePath) {
        await fs.remove(archivePath).catch(() => {})
      }
    }
  }

  /**
   * 解析 GitHub 最新 Release 版本信息
   */
  private async resolveLatestReleaseDownload(platform: NodeJS.Platform, arch: string): Promise<{ version: string, downloadUrl: string, archiveExt: string }> {
    const platformName = platform === 'win32' ? 'windows'
      : platform === 'darwin' ? 'darwin'
      : platform === 'linux' ? 'linux'
      : null

    if (!platformName) {
      throw new Error(`不支持的平台：${platform}`)
    }

    const archName = arch === 'x64' ? 'amd64'
      : arch === 'arm64' ? 'arm64'
      : arch === 'ia32' ? '386'
      : null

    if (!archName) {
      throw new Error(`不支持的架构：${arch}`)
    }

    const archiveExt = platformName === 'windows' ? '.zip' : '.tar.gz'

    const release = await this.fetchJson<any>('https://api.github.com/repos/SagerNet/sing-box/releases/latest')
    const tagName = String(release?.tag_name || '')
    const version = tagName.startsWith('v') ? tagName.slice(1) : tagName
    if (!version) throw new Error('无法解析 sing-box 版本号')

    const assetName = `sing-box-${version}-${platformName}-${archName}${archiveExt}`
    const assets: any[] = Array.isArray(release?.assets) ? release.assets : []
    const asset = assets.find(a => String(a?.name || '') === assetName)
    const downloadUrl = String(asset?.browser_download_url || '')

    if (!downloadUrl) {
      throw new Error(`未找到对应的发布包：${assetName}`)
    }

    return { version, downloadUrl, archiveExt }
  }

  /**
   * 简单的 HTTP GET JSON 请求封装
   */
  private fetchJson<T>(url: string): Promise<T> {
    return this.withRetry(
      async () => new Promise<T>((resolve, reject) => {
        const req = https.request(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'LagZero',
            'Accept': 'application/vnd.github+json'
          }
        }, (res) => {
          const status = res.statusCode || 0
          const chunks: Buffer[] = []

          res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8')
            if (status >= 300) {
              reject(new Error(`请求失败（${status}）：${body.slice(0, 200)}`))
              return
            }
            try {
              resolve(JSON.parse(body) as T)
            } catch {
              reject(new Error('解析 JSON 失败'))
            }
          })
        })

        req.setTimeout(20000, () => {
          req.destroy(new Error('请求超时'))
        })
        req.on('error', reject)
        req.end()
      }),
      3,
      '获取 sing-box release 信息'
    )
  }

  /**
   * 下载文件到本地
   */
  private async downloadToFile(
    url: string,
    destPath: string,
    onProgress?: (progress: number | undefined, downloadedBytes: number, totalBytes?: number) => void
  ): Promise<void> {
    await fs.ensureDir(path.dirname(destPath))
    await this.withRetry(
      async (attempt) => {
        if (attempt > 1) {
          await fs.remove(destPath).catch(() => {})
        }
        await this.doDownloadRequest(url, destPath, 5, onProgress)
      },
      3,
      '下载 sing-box'
    )
  }

  private async doDownloadRequest(
    url: string,
    destPath: string,
    redirectLeft: number,
    onProgress?: (progress: number | undefined, downloadedBytes: number, totalBytes?: number) => void
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const req = https.request(url, {
        method: 'GET',
        headers: { 'User-Agent': 'LagZero' }
      }, (res) => {
        const status = res.statusCode || 0
        const location = res.headers.location
        if ([301, 302, 303, 307, 308].includes(status) && location && redirectLeft > 0) {
          res.resume()
          const nextUrl = new URL(location, url).toString()
          resolve(this.doDownloadRequest(nextUrl, destPath, redirectLeft - 1, onProgress))
          return
        }
        if (status >= 300) {
          reject(new Error(`下载失败（${status}）`))
          res.resume()
          return
        }

        const total = Number(res.headers['content-length'] || 0)
        let received = 0
        let lastLoggedBucket = -1
        let lastProgress = -1
        const fileStream = createWriteStream(destPath)

        res.on('data', (chunk) => {
          received += Buffer.byteLength(chunk)
          if (total > 0) {
            const pct = Math.floor((received / total) * 100)
            if (pct !== lastProgress) {
              lastProgress = pct
              onProgress?.(pct, received, total)
            }
            const bucket = Math.floor(pct / 20) * 20
            if (bucket !== lastLoggedBucket && bucket <= 100) {
              lastLoggedBucket = bucket
              this.log(`正在下载 sing-box：${bucket}%`)
            }
          } else {
            onProgress?.(undefined, received)
          }
        })

        pipeline(res as unknown as Readable, fileStream)
          .then(() => {
            if (total > 0) {
              onProgress?.(100, received, total)
            }
            resolve()
          })
          .catch((err) => reject(err))
      })

      req.setTimeout(30000, () => {
        req.destroy(new Error('下载超时'))
      })
      req.on('error', reject)
      req.end()
    })
  }

  private async withRetry<T>(
    task: (attempt: number) => Promise<T>,
    maxAttempts: number,
    taskName: string
  ): Promise<T> {
    let lastError: unknown = null
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await task(attempt)
      } catch (error) {
        lastError = error
        const shouldRetry = this.isRetryableNetworkError(error) && attempt < maxAttempts
        if (!shouldRetry) {
          throw error
        }
        const delayMs = attempt * 1000
        this.log(`${taskName} 失败，${delayMs}ms 后重试（${attempt}/${maxAttempts - 1}）：${String((error as any)?.message || error)}`, 'error')
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  private isRetryableNetworkError(error: unknown): boolean {
    const err = error as NodeJS.ErrnoException | undefined
    const code = String(err?.code || '')
    if (['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE'].includes(code)) {
      return true
    }
    const message = String(err?.message || error || '').toLowerCase()
    return (
      message.includes('socket hang up') ||
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnreset')
    )
  }

  /**
   * 解压并安装二进制文件
   */
  private async extractAndInstall(
    archivePath: string,
    archiveExt: string,
    extractDir: string,
    binPath: string,
    isWindows: boolean
  ): Promise<void> {
    if (archiveExt === '.zip') {
      const zip = new AdmZip(archivePath)
      zip.extractAllTo(extractDir, true)
    } else if (archiveExt === '.tar.gz') {
      await tar.x({ file: archivePath, cwd: extractDir })
    } else {
      throw new Error(`不支持的压缩格式：${archiveExt}`)
    }

    const exeName = isWindows ? 'sing-box.exe' : 'sing-box'
    const exePath = await this.findFileRecursive(extractDir, exeName)
    if (!exePath) {
      throw new Error('解压后未找到 sing-box 可执行文件')
    }

    await fs.copyFile(exePath, binPath)

    if (isWindows) {
      // 复制可能存在的 DLL 文件
      const exeDir = path.dirname(exePath)
      const entries = await fs.readdir(exeDir, { withFileTypes: true })
      const dlls = entries
        .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.dll'))
        .map(e => path.join(exeDir, e.name))

      for (const dll of dlls) {
        const target = path.join(BIN_DIR, path.basename(dll))
        await fs.copyFile(dll, target)
      }
    }

    await fs.chmod(binPath, 0o755).catch(() => {})
  }

  /**
   * 递归查找文件
   */
  private async findFileRecursive(rootDir: string, fileName: string): Promise<string | null> {
    let entries: Array<{ name: string, isFile: () => boolean, isDirectory: () => boolean }>
    try {
      entries = await fs.readdir(rootDir, { withFileTypes: true }) as any
    } catch {
      return null
    }
    for (const entry of entries) {
      const full = path.join(rootDir, entry.name)
      if (entry.isFile() && entry.name === fileName) return full
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const found = await this.findFileRecursive(path.join(rootDir, entry.name), fileName)
      if (found) return found
    }
    return null
  }

  private async tryAdoptManualBinary(binPath: string): Promise<boolean> {
    if (!await fs.pathExists(BIN_DIR)) return false
    const exeName = process.platform === 'win32' ? 'sing-box.exe' : 'sing-box'
    const manualPath = await this.findFileRecursive(BIN_DIR, exeName)
    if (!manualPath) return false
    if (path.resolve(manualPath) === path.resolve(binPath)) return true

    await fs.copyFile(manualPath, binPath)
    await fs.chmod(binPath, 0o755).catch(() => {})

    if (process.platform === 'win32') {
      const manualDir = path.dirname(manualPath)
      const entries = await fs.readdir(manualDir, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (!entry.isFile()) continue
        if (!entry.name.toLowerCase().endsWith('.dll')) continue
        await fs.copyFile(path.join(manualDir, entry.name), path.join(BIN_DIR, entry.name)).catch(() => {})
      }
    }

    this.log(`检测到手动放置的 sing-box，已采用：${manualPath}`)
    return true
  }

  private emitStatus(payload: Omit<InstallerStatus, 'installDir' | 'binaryPath'>) {
    this.onStatus?.({
      ...payload,
      installDir: this.getInstallDir(),
      binaryPath: this.getBinaryPath()
    })
  }
}
