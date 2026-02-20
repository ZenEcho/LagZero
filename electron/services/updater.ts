import { app } from 'electron'

/**
 * 更新检查结果信息
 */
export type UpdateInfo = {
  /** 是否有可用更新 */
  updateAvailable?: boolean
  /** 最新版本号 */
  version?: string
  /** 发布日期 */
  releaseDate?: string
  /** 更新日志 */
  releaseNotes?: string
  /** 错误信息 */
  error?: string
}

/**
 * 自动更新服务
 * 
 * 负责检查 GitHub Release 或 Tags 获取最新版本信息。
 * 仅提供检查功能，不包含自动下载和安装逻辑（通常由用户手动下载或跳转）。
 */
export class UpdaterService {
  /**
   * 检查更新
   * 
   * 对比当前应用版本与 GitHub 最新版本。
   * @returns Promise<UpdateInfo>
   */
  async checkUpdate(): Promise<UpdateInfo> {
    try {
      const fetchGithub = async (url: string): Promise<string> => {
        const target = new URL(url)
        const response = await fetch(target, {
          headers: {
            'User-Agent': 'LagZero-Client',
            'Accept': 'application/vnd.github+json',
          },
        })
        if (!response.ok) {
          throw new Error(`GitHub API Error: ${response.status}`)
        }
        return await response.text()
      }

      let latestVersion = ''
      let releaseDate = ''
      let releaseNotes = ''
      let hasUpdate = false

      try {
        // 1. Try releases/latest first
        const rawRelease = await fetchGithub('https://api.github.com/repos/ZenEcho/LagZero/releases/latest')
        const release = JSON.parse(rawRelease)
        latestVersion = release.tag_name.replace(/^v/, '')
        releaseDate = new Date(release.published_at).toLocaleDateString()
        releaseNotes = release.body || ''
      } catch (e) {
        // 2. Fallback to tags if latest release is not available
        const rawTags = await fetchGithub('https://api.github.com/repos/ZenEcho/LagZero/tags')
        const tags = JSON.parse(rawTags)
        if (Array.isArray(tags) && tags.length > 0) {
          latestVersion = tags[0].name.replace(/^v/, '')
          releaseNotes = `Tag: ${tags[0].name}`
        } else {
          throw new Error('No version info found')
        }
      }

      const currentVersion = app.getVersion()
      const v1Parts = latestVersion.split('.').map(Number)
      const v2Parts = currentVersion.split('.').map(Number)

      for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
        const u = v1Parts[i] || 0
        const c = v2Parts[i] || 0
        if (u > c) {
          hasUpdate = true
          break
        }
        if (u < c) {
          hasUpdate = false
          break
        }
      }

      return {
        updateAvailable: hasUpdate,
        version: latestVersion,
        releaseDate,
        releaseNotes
      }
    } catch (e: any) {
      return { error: e.message || 'Update check failed' }
    }
  }
}
