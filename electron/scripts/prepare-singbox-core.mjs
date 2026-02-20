import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const DEV_BIN_DIR = path.join(ROOT, '.lagzero-dev', 'bin')
const TARGET_ROOT = path.join(ROOT, 'electron', 'resources', 'singbox')

const ARCH_ALIAS = {
  x64: 'x64',
  arm64: 'arm64',
  ia32: 'x86'
}

function log(message) {
  console.log(`[prepare-singbox-core] ${message}`)
}

async function ensureCleanDir(dir) {
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function copyDevCore() {
  const exeName = process.platform === 'win32' ? 'sing-box.exe' : 'sing-box'
  const sourceExe = path.join(DEV_BIN_DIR, exeName)
  const hasDevCore = await pathExists(sourceExe)
  const arch = ARCH_ALIAS[process.arch] || process.arch
  const targetDir = path.join(TARGET_ROOT, `windows-${arch}`)

  await fs.mkdir(TARGET_ROOT, { recursive: true })

  if (!hasDevCore) {
    log(`未找到 dev 核心: ${sourceExe}`)
    log('保留现有内置资源不变；运行时仍可回退到在线下载。')
    return
  }

  await ensureCleanDir(targetDir)

  const files = await fs.readdir(DEV_BIN_DIR, { withFileTypes: true })
  for (const entry of files) {
    if (!entry.isFile()) continue
    const lowerName = entry.name.toLowerCase()
    if (lowerName === 'sing-box.exe' || lowerName.endsWith('.dll')) {
      await fs.copyFile(path.join(DEV_BIN_DIR, entry.name), path.join(targetDir, entry.name))
    }
  }

  log(`已内置 dev 核心到 ${targetDir}`)
}

copyDevCore().catch((error) => {
  console.error('[prepare-singbox-core] 执行失败:', error)
  process.exit(1)
})
