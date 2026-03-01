import { describe, it, expect } from 'vitest'
import { parseShareLink } from '../../src/utils/protocol'
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

  it('should parse VMess insecure alias field', () => {
    const config = {
      v: '2',
      ps: 'Alias Insecure',
      add: 'example.com',
      port: '443',
      id: 'uuid',
      aid: '0',
      scy: 'auto',
      net: 'tcp',
      tls: 'tls',
      insecure: '1'
    }
    const link = 'vmess://' + Base64.encode(JSON.stringify(config))
    const result = parseShareLink(link)
    expect(result).not.toBeNull()
    expect(result?.tls?.insecure).toBe(true)
  })

  it('should parse link when trailing annotation text exists', () => {
    const config = {
      v: '2',
      ps: 'With note',
      add: 'example.com',
      port: '443',
      id: 'uuid',
      aid: '0',
      scy: 'auto',
      net: 'tcp',
      tls: ''
    }
    const link = 'vmess://' + Base64.encode(JSON.stringify(config)) + '  这个格式'
    const result = parseShareLink(link)
    expect(result).not.toBeNull()
    expect(result?.type).toBe('vmess')
    expect(result?.server).toBe('example.com')
  })

  it('should parse provided vmess sample from user', () => {
    const link = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogIuaXpeacrC3kvJjljJYiLA0KICAiYWRkIjogInBsYW5iLm1vamNuLmNvbSIsDQogICJwb3J0IjogIjE2NjE3IiwNCiAgImlkIjogIjM4ZTFjMjlhLTc3MTYtNDA5MC1iM2Q5LTBmMzhkOWYyNzEyNiIsDQogICJhaWQiOiAiMCIsDQogICJzY3kiOiAiYXV0byIsDQogICJuZXQiOiAid3MiLA0KICAidHlwZSI6ICJub25lIiwNCiAgImhvc3QiOiAiOGM5NGUwMGIwMWEwMDBkYmE2ZDNiMTc3MjYzOWJmNzUubW9iZ3NsYi50YmNhY2hlLmNvbSIsDQogICJwYXRoIjogIi8iLA0KICAidGxzIjogIiIsDQogICJzbmkiOiAiIiwNCiAgImFscG4iOiAiIiwNCiAgImZwIjogIiIsDQogICJpbnNlY3VyZSI6ICIwIg0KfQ=='
    const result = parseShareLink(link)
    expect(result).not.toBeNull()
    expect(result?.type).toBe('vmess')
    expect(result?.server).toBe('planb.mojcn.com')
    expect(result?.server_port).toBe(1617)
    expect(result?.network).toBe('ws')
    expect(result?.host).toContain('mobgslb.tbcache.com')
  })

  it('should parse VLESS reality link with pbk/sid/sni/fp', () => {
    const link = 'vless://13a3abd8-6315-4735-b3a2-39f38a2e4f3d@156.246.93.1:38073?encryption=none&security=reality&flow=xtls-rprx-vision&type=tcp&sni=www.paypal.com&pbk=DrpIgSOtaEHqJywmydYjljWB9FD_1PlFjQIAlbHiOgk&fp=chrome#233boy-reality-156.246.1.26'
    const result = parseShareLink(link)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('vless')
    expect(result?.server).toBe('156.246.93.1')
    expect(result?.server_port).toBe(38073)
    expect(result?.security).toBe('reality')
    expect(result?.flow).toBe('xtls-rprx-vision')
    expect(result?.tls?.enabled).toBe(true)
    expect(result?.tls?.server_name).toBe('www.paypal.com')
    expect(result?.tls?.reality?.enabled).toBe(true)
    expect(result?.tls?.reality?.public_key).toBe('DrpIgSOtaEHqJywmydYjljWB9FD_1PlFjQIAlbHiOgk')
    expect(result?.fingerprint).toBe('chrome')
  })

  it('should parse Trojan params aliases', () => {
    const link = 'trojan://pass@example.com:443?network=ws&service_name=svc&serverName=example.com&allowInsecure=true&fingerprint=firefox#trojan'
    const result = parseShareLink(link)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('trojan')
    expect(result?.network).toBe('ws')
    expect(result?.service_name).toBe('svc')
    expect(result?.tls?.server_name).toBe('example.com')
    expect(result?.tls?.insecure).toBe(true)
    expect(result?.fingerprint).toBe('firefox')
  })

  it('should parse socks5h as socks', () => {
    const result = parseShareLink('socks5h://user:pass@127.0.0.1:1080#socks')
    expect(result).not.toBeNull()
    expect(result?.type).toBe('socks')
    expect(result?.server_port).toBe(1080)
  })

  it('should parse Shadowsocks SIP002 with plugin', () => {
    const userInfo = Base64.encode('aes-256-gcm:pwd')
    const link = `ss://${userInfo}@1.2.3.4:443/?plugin=${encodeURIComponent('v2ray-plugin;mode=websocket;host=example.com')}#ss`
    const result = parseShareLink(link)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('shadowsocks')
    expect(result?.method).toBe('aes-256-gcm')
    expect(result?.plugin).toBe('v2ray-plugin')
    expect(result?.plugin_opts).toContain('mode=websocket')
  })

  it('should return null for invalid link', () => {
    expect(parseShareLink('invalid://link')).toBeNull()
  })
})
