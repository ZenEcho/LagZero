import fs from 'fs-extra'
import path from 'path'
import AdmZip from 'adm-zip'
import * as tar from 'tar'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import { Readable } from 'stream'
import https from 'node:https'
import { app } from 'electron'
import pkg from '../../../package.json'
import { JsonStore } from '../../common/store'
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

export interface SingBoxCoreRelease {
  version: string
  tagName: string
  publishedAt?: string
  channel: 'stable' | 'beta' | 'alpha'
}

export interface SingBoxInstallInfo {
  exists: boolean
  installDir: string
  binaryPath: string
  installedVersion?: string
  preferredVersion: string
}

interface ReleaseAssetResolution {
  version: string
  tagName: string
  downloadUrl: string
  archiveExt: string
}

interface InstallMeta {
  version: string
  tagName?: string
  downloadUrl?: string
  installedAt: number
}

type StatusFn = (status: InstallerStatus) => void

const GITHUB_RELEASES_BASE = 'https://api.github.com/repos/SagerNet/sing-box/releases'
const RELEASE_CACHE_TTL_MS = 5 * 60 * 1000
const TESTED_SINGBOX_VERSION = normalizePackageVersion(pkg.lagZeroTestSingboxVersion)

function normalizePackageVersion(version: unknown) {
  const raw = String(version || '').trim()
  if (!raw || raw.toLowerCase() === 'latest') return ''
  return raw.replace(/^v/i, '')
}

/**
 * Sing-box 安装器
 * 负责检查、下载和安装 sing-box 内核
 */
export class SingBoxInstaller {
  private log: LogFn
  private onStatus?: StatusFn
  private installingPromise: Promise<string> | null = null
  private settingsStore: JsonStore<{ preferredVersion: string }>
  private releaseCache: { fetchedAt: number, versions: SingBoxCoreRelease[] } | null = null

  constructor(logFn: LogFn, statusFn?: StatusFn) {
    this.log = logFn
    this.onStatus = statusFn
    this.settingsStore = new JsonStore({
      name: 'singbox-core-settings',
      cwd: app.getPath('userData'),
      defaults: {
        preferredVersion: 'latest'
      }
    })
  }

  getInstallDir() {
    return BIN_DIR
  }

  getBinaryPath() {
    const ext = process.platform === 'win32' ? '.exe' : ''
    return path.join(BIN_DIR, `sing-box${ext}`)
  }

  getPreferredVersion() {
    return this.normalizeRequestedVersion(this.settingsStore.get().preferredVersion)
  }

  setPreferredVersion(version?: string) {
    const normalized = this.normalizeRequestedVersion(version)
    const current = this.settingsStore.get()
    if (current.preferredVersion !== normalized) {
      this.settingsStore.set({
        ...current,
        preferredVersion: normalized
      })
    }
    return normalized
  }

  async listAvailableVersions(forceRefresh = false): Promise<SingBoxCoreRelease[]> {
    const now = Date.now()
    if (!forceRefresh && this.releaseCache && now - this.releaseCache.fetchedAt < RELEASE_CACHE_TTL_MS) {
      return this.releaseCache.versions
    }

    let versions: SingBoxCoreRelease[]
    try {
      const releases = await this.fetchJson<any[]>(`${GITHUB_RELEASES_BASE}?per_page=50`)
      versions = releases
        .filter((release) => !release?.draft)
        .reduce<SingBoxCoreRelease[]>((acc, release) => {
          const tagName = String(release?.tag_name || '').trim()
          const version = this.normalizeVersionFromTag(tagName)
          if (!version) return acc
          acc.push({
            version,
            tagName,
            publishedAt: typeof release?.published_at === 'string' ? release.published_at : undefined,
            channel: this.inferReleaseChannel(release)
          })
          return acc
        }, [])
    } catch (error) {
      if (!TESTED_SINGBOX_VERSION) throw error
      this.log(`获取 sing-box 版本列表失败，已回退到保底版本 v${TESTED_SINGBOX_VERSION}：${String((error as any)?.message || error)}`, 'error')
      versions = []
    }

    versions = this.ensureTestedVersionPresent(versions)

    this.releaseCache = {
      fetchedAt: now,
      versions
    }
    return versions
  }

  async getInstallInfo(): Promise<SingBoxInstallInfo> {
    const exists = await this.checkBinaryExists()
    const meta = exists ? await this.readInstallMeta() : null

    return {
      exists,
      installDir: this.getInstallDir(),
      binaryPath: this.getBinaryPath(),
      installedVersion: meta?.version,
      preferredVersion: this.getPreferredVersion()
    }
  }

  async checkBinaryExists() {
    const binPath = this.getBinaryPath()
    if (await fs.pathExists(binPath)) return true
    return this.tryAdoptManualBinary(binPath)
  }

  /**
   * 检查 sing-box 是否存在，不存在则根据首选版本自动下载
   * @returns 可执行文件的绝对路径
   */
  async checkAndDownloadBinary(): Promise<string> {
    if (this.installingPromise) {
      this.log('检测到已有 sing-box 安装任务，等待完成...')
      return this.installingPromise
    }

    const requestedVersion = this.getPreferredVersion()
    this.installingPromise = this.checkAndDownloadBinaryInternal(requestedVersion)
    try {
      return await this.installingPromise
    } finally {
      this.installingPromise = null
    }
  }

  /**
   * 安装指定版本的 sing-box（会覆盖现有核心）
   */
  async installCore(version?: string): Promise<string> {
    if (this.installingPromise) {
      this.log('检测到已有 sing-box 安装任务，等待完成...')
      return this.installingPromise
    }

    const requestedVersion = this.setPreferredVersion(version)
    this.installingPromise = this.installCoreInternal(requestedVersion)
    try {
      return await this.installingPromise
    } finally {
      this.installingPromise = null
    }
  }

  private async checkAndDownloadBinaryInternal(requestedVersion: string): Promise<string> {
    await fs.ensureDir(BIN_DIR)
    const platform = process.platform
    const arch = process.arch
    const binPath = this.getBinaryPath()
    this.emitStatus({ phase: 'checking' })

    if (await this.checkBinaryExists()) {
      const meta = await this.readInstallMeta()
      this.emitStatus({ phase: 'ready', version: meta?.version })
      return binPath
    }

    this.emitStatus({ phase: 'missing' })
    return this.downloadAndInstallBinary(platform, arch, binPath, requestedVersion)
  }

  private async installCoreInternal(requestedVersion: string): Promise<string> {
    await fs.ensureDir(BIN_DIR)
    const platform = process.platform
    const arch = process.arch
    const binPath = this.getBinaryPath()
    this.emitStatus({ phase: 'checking' })
    return this.downloadAndInstallBinary(platform, arch, binPath, requestedVersion)
  }

  /**
   * 执行下载和安装流程
   */
  private async downloadAndInstallBinary(
    platform: NodeJS.Platform,
    arch: string,
    binPath: string,
    requestedVersion: string
  ): Promise<string> {
    const displayVersion = requestedVersion === 'latest' ? 'latest' : requestedVersion
    this.log(`开始准备 sing-box ${displayVersion} 安装包...`)
    this.emitStatus({
      phase: 'resolving',
      version: requestedVersion === 'latest' ? undefined : requestedVersion
    })
    let version: string | undefined
    let tagName: string | undefined
    let downloadUrl: string | undefined
    let archivePath = ''
    let extractDir = ''

    try {
      const resolved = await this.resolveReleaseDownload(platform, arch, requestedVersion)
      version = resolved.version
      tagName = resolved.tagName
      downloadUrl = resolved.downloadUrl
      const archiveExt = resolved.archiveExt
      this.emitStatus({
        phase: 'downloading',
        version,
        downloadUrl,
        progress: 0,
        downloadedBytes: 0
      })

      archivePath = path.join(BIN_DIR, `sing-box-${version}-${generateId()}${archiveExt}`)
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

      await this.writeInstallMeta({
        version,
        tagName,
        downloadUrl,
        installedAt: Date.now()
      })
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
        await fs.remove(extractDir).catch(() => { })
      }
      if (archivePath) {
        await fs.remove(archivePath).catch(() => { })
      }
    }
  }

  /**
   * 解析 GitHub Release 版本信息
   */
  private async resolveReleaseDownload(
    platform: NodeJS.Platform,
    arch: string,
    requestedVersion: string
  ): Promise<ReleaseAssetResolution> {
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
    const requestedCandidates = this.buildReleaseRequestCandidates(requestedVersion)
    let lastError: unknown = null

    for (const candidate of requestedCandidates) {
      try {
        const release = candidate === 'latest'
          ? await this.fetchJson<any>(`${GITHUB_RELEASES_BASE}/latest`)
          : await this.fetchReleaseByVersion(candidate)

        const tagName = String(release?.tag_name || '').trim()
        const version = this.normalizeVersionFromTag(tagName)
        if (!version) throw new Error('无法解析 sing-box 版本号')

        const assetName = `sing-box-${version}-${platformName}-${archName}${archiveExt}`
        const assets: any[] = Array.isArray(release?.assets) ? release.assets : []
        const asset = assets.find((a) => String(a?.name || '') === assetName)
        const downloadUrl = String(asset?.browser_download_url || '')

        if (!downloadUrl) {
          throw new Error(`未找到对应的发布包：${assetName}`)
        }

        if (candidate !== requestedCandidates[0]) {
          this.log(`sing-box latest 不可用，已回退到保底版本 v${version}`)
        }

        return { version, tagName, downloadUrl, archiveExt }
      } catch (error) {
        lastError = error
        if (candidate !== requestedCandidates.at(-1)) {
          this.log(`解析 sing-box ${candidate} 失败，尝试保底版本：${String((error as any)?.message || error)}`, 'error')
          continue
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`未找到可用的 sing-box 发布包：${requestedVersion}`)
  }

  private async fetchReleaseByVersion(requestedVersion: string): Promise<any> {
    const candidates = this.buildTagCandidates(requestedVersion)
    let lastError: unknown = null

    for (const tag of candidates) {
      try {
        return await this.fetchJson<any>(`${GITHUB_RELEASES_BASE}/tags/${encodeURIComponent(tag)}`)
      } catch (error) {
        lastError = error
        const message = String((error as any)?.message || error || '')
        if (!message.includes('404')) {
          throw error
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`未找到 sing-box 版本：${requestedVersion}`)
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
          await fs.remove(destPath).catch(() => { })
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
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.dll'))
        .map((e) => path.join(exeDir, e.name))

      for (const dll of dlls) {
        const target = path.join(BIN_DIR, path.basename(dll))
        await fs.copyFile(dll, target)
      }
    }

    await fs.chmod(binPath, 0o755).catch(() => { })
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
    await fs.chmod(binPath, 0o755).catch(() => { })
    await this.clearInstallMeta()

    if (process.platform === 'win32') {
      const manualDir = path.dirname(manualPath)
      const entries = await fs.readdir(manualDir, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (!entry.isFile()) continue
        if (!entry.name.toLowerCase().endsWith('.dll')) continue
        await fs.copyFile(path.join(manualDir, entry.name), path.join(BIN_DIR, entry.name)).catch(() => { })
      }
    }

    this.log(`检测到手动放置的 sing-box，已采用：${manualPath}`)
    return true
  }

  private getInstallMetaPath() {
    return path.join(BIN_DIR, 'sing-box-install-meta.json')
  }

  private async readInstallMeta(): Promise<InstallMeta | null> {
    try {
      const meta = await fs.readJson(this.getInstallMetaPath()) as Partial<InstallMeta>
      if (!meta || typeof meta !== 'object' || typeof meta.version !== 'string' || !meta.version.trim()) {
        return null
      }
      return {
        version: meta.version.trim(),
        tagName: typeof meta.tagName === 'string' ? meta.tagName : undefined,
        downloadUrl: typeof meta.downloadUrl === 'string' ? meta.downloadUrl : undefined,
        installedAt: typeof meta.installedAt === 'number' ? meta.installedAt : 0
      }
    } catch {
      return null
    }
  }

  private async writeInstallMeta(meta: InstallMeta) {
    await fs.ensureDir(path.dirname(this.getInstallMetaPath()))
    await fs.writeJson(this.getInstallMetaPath(), meta, { spaces: 2 })
  }

  private async clearInstallMeta() {
    await fs.remove(this.getInstallMetaPath()).catch(() => { })
  }

  private normalizeRequestedVersion(version?: string) {
    const raw = String(version || '').trim()
    if (!raw || raw.toLowerCase() === 'latest') return 'latest'
    return raw.replace(/^v/i, '')
  }

  private normalizeVersionFromTag(tagName: string) {
    return String(tagName || '').trim().replace(/^v/i, '')
  }

  private inferReleaseChannel(release: any): 'stable' | 'beta' | 'alpha' {
    const text = `${String(release?.tag_name || '')} ${String(release?.name || '')}`.toLowerCase()
    if (text.includes('alpha')) return 'alpha'
    if (
      text.includes('beta')
      || /\brc\b/.test(text)
      || text.includes('preview')
      || text.includes('pre-release')
      || release?.prerelease
    ) {
      return 'beta'
    }
    return 'stable'
  }

  private buildTagCandidates(version: string) {
    const normalized = this.normalizeRequestedVersion(version)
    if (normalized === 'latest') return ['latest']
    const original = String(version || '').trim()
    return [...new Set([
      original,
      normalized,
      `v${normalized}`
    ].filter(Boolean))]
  }

  private buildReleaseRequestCandidates(version: string) {
    const normalized = this.normalizeRequestedVersion(version)
    if (normalized !== 'latest' || !TESTED_SINGBOX_VERSION || TESTED_SINGBOX_VERSION === normalized) {
      return [normalized]
    }
    return ['latest', TESTED_SINGBOX_VERSION]
  }

  private ensureTestedVersionPresent(versions: SingBoxCoreRelease[]) {
    if (!TESTED_SINGBOX_VERSION) return versions
    if (versions.some((release) => release.version === TESTED_SINGBOX_VERSION)) {
      return versions
    }

    return [
      {
        version: TESTED_SINGBOX_VERSION,
        tagName: `v${TESTED_SINGBOX_VERSION}`,
        channel: this.inferReleaseChannelFromVersion(TESTED_SINGBOX_VERSION)
      },
      ...versions
    ]
  }

  private inferReleaseChannelFromVersion(version: string): 'stable' | 'beta' | 'alpha' {
    const text = String(version || '').toLowerCase()
    if (text.includes('alpha')) return 'alpha'
    if (text.includes('beta') || /\brc\b/.test(text) || text.includes('preview')) return 'beta'
    return 'stable'
  }

  private emitStatus(payload: Omit<InstallerStatus, 'installDir' | 'binaryPath'>) {
    this.onStatus?.({
      ...payload,
      installDir: this.getInstallDir(),
      binaryPath: this.getBinaryPath()
    })
  }
}
