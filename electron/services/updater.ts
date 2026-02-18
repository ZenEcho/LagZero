import { net, app } from 'electron'

export type UpdateInfo = {
  updateAvailable?: boolean
  version?: string
  releaseDate?: string
  releaseNotes?: string
  error?: string
}

export class UpdaterService {
  async checkUpdate(): Promise<UpdateInfo> {
    try {
      const fetchGithub = async (url: string): Promise<string> => {
        return new Promise((resolve, reject) => {
          const request = net.request(url)
          request.setHeader('User-Agent', 'LagZero-Client')
          request.on('response', (response) => {
            if (response.statusCode !== 200) {
              reject(new Error(`GitHub API Error: ${response.statusCode}`))
              return
            }
            let data = ''
            response.on('data', (chunk) => { data += chunk })
            response.on('end', () => resolve(data))
          })
          request.on('error', (err) => reject(err))
          request.end()
        })
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
