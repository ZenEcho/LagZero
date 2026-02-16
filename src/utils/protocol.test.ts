import { describe, it, expect } from 'vitest'
import { parseShareLink } from './protocol'
import { Base64 } from 'js-base64'

describe('Protocol Parsing', () => {
  it('should parse VMess link', () => {
    const config = {
      v: "2",
      ps: "Test Node",
      add: "example.com",
      port: "443",
      id: "uuid",
      aid: "0",
      net: "ws",
      type: "none",
      host: "example.com",
      path: "/",
      tls: "tls"
    }
    const link = 'vmess://' + Base64.encode(JSON.stringify(config))
    const result = parseShareLink(link)
    expect(result).not.toBeNull()
    expect(result?.type).toBe('vmess')
    expect(result?.server).toBe('example.com')
    expect(result?.tls?.enabled).toBe(true)
  })

  it('should return null for invalid link', () => {
    expect(parseShareLink('invalid://link')).toBeNull()
  })
})
