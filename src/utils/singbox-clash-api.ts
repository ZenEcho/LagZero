import { systemApi } from '@/api'
import type { SingboxClashApiOptions } from '@/types'

const DEFAULT_SINGBOX_CLASH_API_PORT = 19090
const SINGBOX_CLASH_API_HOST = '127.0.0.1'

let cachedSecret = ''

function ensureSecret(): string {
  if (cachedSecret) return cachedSecret
  cachedSecret = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return cachedSecret
}

function normalizeReservedPorts(reservedPorts?: number[]): number[] {
  return Array.from(new Set(
    (Array.isArray(reservedPorts) ? reservedPorts : [])
      .map(port => Math.floor(Number(port || 0)))
      .filter(port => Number.isFinite(port) && port > 0)
  ))
}

export async function resolveSingboxClashApiConfig(options?: {
  reservedPorts?: number[]
}): Promise<SingboxClashApiOptions> {
  const reservedPorts = new Set(normalizeReservedPorts(options?.reservedPorts))
  let candidate = DEFAULT_SINGBOX_CLASH_API_PORT
  if (reservedPorts.has(candidate)) {
    candidate += 1
  }

  let port = await systemApi.findAvailablePort(candidate, 1)
  while (reservedPorts.has(port)) {
    port = await systemApi.findAvailablePort(port + 1, 1)
  }

  return {
    externalController: `${SINGBOX_CLASH_API_HOST}:${port}`,
    secret: ensureSecret()
  }
}
