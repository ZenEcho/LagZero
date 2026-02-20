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

/**
 * Sing-box 安装器
 * 负责检查、下载和安装 sing-box 内核
 */
export class SingBoxInstaller {
  private log: LogFn

  constructor(logFn: LogFn) {
    this.log = logFn
  }

  /**
   * 检查 sing-box 是否存在，不存在则自动下载
   * @returns 可执行文件的绝对路径
   */
  async checkAndDownloadBinary(): Promise<string> {
    await fs.ensureDir(BIN_DIR)
    const platform = process.platform
    const arch = process.arch
    const ext = platform === 'win32' ? '.exe' : ''
    const binPath = path.join(BIN_DIR, `sing-box${ext}`)

    if (await fs.pathExists(binPath)) {
      return binPath
    }

    return this.downloadAndInstallBinary(platform, arch, binPath)
  }

  /**
   * 执行下载和安装流程
   */
  private async downloadAndInstallBinary(platform: NodeJS.Platform, arch: string, binPath: string): Promise<string> {
    this.log('未检测到 sing-box，开始自动下载...')

    const { version, downloadUrl, archiveExt } = await this.resolveLatestReleaseDownload(platform, arch)

    const archivePath = path.join(BIN_DIR, `sing-box-${version}${archiveExt}`)
    const extractDir = path.join(BIN_DIR, `tmp-${generateId()}`)

    try {
      await fs.ensureDir(extractDir)
      await this.downloadToFile(downloadUrl, archivePath)
      await this.extractAndInstall(archivePath, archiveExt, extractDir, binPath, platform === 'win32')

      if (!await fs.pathExists(binPath)) {
        throw new Error('安装完成后仍未找到 sing-box 可执行文件')
      }

      this.log(`sing-box 已安装：${binPath}`)
      return binPath
    } catch (e: any) {
      const msg = `sing-box 自动下载/安装失败：${String(e?.message || e)}`
      this.log(msg, 'error')
      throw new Error(msg)
    } finally {
      await fs.remove(extractDir).catch(() => {})
      await fs.remove(archivePath).catch(() => {})
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
    return new Promise((resolve, reject) => {
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
          } catch (e) {
            reject(new Error('解析 JSON 失败'))
          }
        })
      })

      req.on('error', reject)
      req.end()
    })
  }

  /**
   * 下载文件到本地
   */
  private async downloadToFile(url: string, destPath: string): Promise<void> {
    await fs.ensureDir(path.dirname(destPath))

    const doRequest = (u: string, redirectLeft: number): Promise<void> => new Promise((resolve, reject) => {
      const req = https.request(u, {
        method: 'GET',
        headers: { 'User-Agent': 'LagZero' }
      }, (res) => {
        const status = res.statusCode || 0
        const location = res.headers.location
        if ([301, 302, 303, 307, 308].includes(status) && location && redirectLeft > 0) {
          res.resume()
          resolve(doRequest(location, redirectLeft - 1))
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
        const fileStream = createWriteStream(destPath)

        res.on('data', (chunk) => {
          received += Buffer.byteLength(chunk)
          if (total > 0) {
            const pct = Math.floor((received / total) * 100)
            const bucket = Math.floor(pct / 20) * 20
            if (bucket !== lastLoggedBucket && bucket <= 100) {
              lastLoggedBucket = bucket
              this.log(`正在下载 sing-box：${bucket}%`)
            }
          }
        })

        pipeline(res as unknown as Readable, fileStream)
          .then(() => resolve())
          .catch(reject)
      })

      req.on('error', reject)
      req.end()
    })

    await doRequest(url, 5)
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
    const entries = await fs.readdir(rootDir, { withFileTypes: true })
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
}
