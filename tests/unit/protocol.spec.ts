import { describe, it, expect } from 'vitest'
import { generateBatchLinks, parseBatchLinks, parseShareLink } from '../../src/utils/protocol'
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
    expect(result?.server_port).toBe(16617)
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

  it('should parse Hysteria v1 URI scheme', () => {
    const link = 'hysteria://example.com:443?auth=my-auth&peer=cdn.example.com&upmbps=30&downmbps=120&obfs=xplus&obfsParam=secret#hy1'
    const result = parseShareLink(link)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('hysteria')
    expect(result?.server).toBe('example.com')
    expect(result?.server_port).toBe(443)
    expect(result?.auth).toBe('my-auth')
    expect(result?.up_mbps).toBe(30)
    expect(result?.down_mbps).toBe(120)
    expect(result?.obfs).toBe('secret')
    expect(result?.tls?.server_name).toBe('cdn.example.com')
  })

  it('should parse hy alias for Hysteria links', () => {
    const link = 'hy://example.com:443?auth=my-auth&peer=cdn.example.com#hy-alias'
    const result = parseShareLink(link)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('hysteria')
    expect(result?.server).toBe('example.com')
    expect(result?.auth).toBe('my-auth')
    expect(result?.tls?.server_name).toBe('cdn.example.com')
  })

  it('should parse Hysteria2 official URI scheme', () => {
    const link = 'hysteria2://mypass@example.com:8443/?sni=bing.com&obfs=salamander&obfs-password=obfs-secret#hy2'
    const result = parseShareLink(link)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('hysteria2')
    expect(result?.server).toBe('example.com')
    expect(result?.server_port).toBe(8443)
    expect(result?.password).toBe('mypass')
    expect(result?.obfs).toBe('salamander')
    expect(result?.obfs_password).toBe('obfs-secret')
    expect(result?.tls?.server_name).toBe('bing.com')
  })

  it('should parse TUIC link', () => {
    const link = 'tuic://11111111-1111-1111-1111-111111111111:pass@example.com:443?congestion_control=bbr&udp_relay_mode=native&zero_rtt_handshake=1&heartbeat=10s&sni=cdn.example.com#tuic'
    const result = parseShareLink(link)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('tuic')
    expect(result?.uuid).toBe('11111111-1111-1111-1111-111111111111')
    expect(result?.password).toBe('pass')
    expect(result?.congestion_control).toBe('bbr')
    expect(result?.udp_relay_mode).toBe('native')
    expect(result?.zero_rtt_handshake).toBe(true)
    expect(result?.heartbeat).toBe('10s')
    expect(result?.tls?.server_name).toBe('cdn.example.com')
  })

  it('should parse TUIC link when uuid and password are encoded as a single auth segment', () => {
    const link = 'tuic://10b6bc12-fcf1-4aad-80f4-230b97419609%3A10b6bc12-fcf1-4aad-80f4-230b97419609@34id.cloudfrontcdn.com:4430?alpn=h3&insecure=1&allowInsecure=1&congestion_control=bbr#%F0%9F%87%AE%F0%9F%87%A934%E5%8D%B0%E5%B0%BC-%E7%94%B5%E4%BF%A1%E4%BC%98%E5%8C%96%28Tuic%29'
    const result = parseShareLink(link)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('tuic')
    expect(result?.server).toBe('34id.cloudfrontcdn.com')
    expect(result?.server_port).toBe(4430)
    expect(result?.uuid).toBe('10b6bc12-fcf1-4aad-80f4-230b97419609')
    expect(result?.password).toBe('10b6bc12-fcf1-4aad-80f4-230b97419609')
    expect(result?.alpn).toBe('h3')
    expect(result?.congestion_control).toBe('bbr')
    expect(result?.tls?.insecure).toBe(true)
    expect(result?.tag).toContain('Tuic')
  })

  it('should parse AnyTLS link', () => {
    const link = 'anytls://anytls-pass@example.com:443?sni=cdn.example.com&idle-session-check-interval=15s&idle-session-timeout=30s&min-idle-session=2&alpn=h2&fp=chrome#anytls'
    const result = parseShareLink(link)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('anytls')
    expect(result?.password).toBe('anytls-pass')
    expect(result?.idle_session_check_interval).toBe('15s')
    expect(result?.idle_session_timeout).toBe('30s')
    expect(result?.min_idle_session).toBe(2)
    expect(result?.alpn).toBe('h2')
    expect(result?.fingerprint).toBe('chrome')
    expect(result?.tls?.server_name).toBe('cdn.example.com')
  })

  it('should parse ShadowTLS link', () => {
    const link = 'shadowtls://shadow-pass@example.com:443?version=3&sni=cdn.example.com&fp=chrome#shadowtls'
    const result = parseShareLink(link)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('shadowtls')
    expect(result?.password).toBe('shadow-pass')
    expect(result?.version).toBe(3)
    expect(result?.fingerprint).toBe('chrome')
    expect(result?.tls?.server_name).toBe('cdn.example.com')
  })

  it('should parse pasted share-link batches for new protocols', () => {
    const content = [
      'hy://example.com:443?auth=hy-auth&peer=cdn.example.com#hy',
      'hy2://hy2-pass@example.com:8443/?sni=bing.com&obfs=salamander&obfs-password=obfs-secret#hy2',
      'tuic://11111111-1111-1111-1111-111111111111:pass@example.com:443?congestion_control=bbr&sni=cdn.example.com#tuic',
      'anytls://anytls-pass@example.com:443?sni=cdn.example.com&idle-session-check-interval=15s#anytls',
      'shadowtls://shadow-pass@example.com:443?version=3&sni=cdn.example.com#shadowtls'
    ].join('\n')
    const result = parseBatchLinks(content)

    expect(result).toHaveLength(5)
    expect(result.map(node => node.type)).toEqual([
      'hysteria',
      'hysteria2',
      'tuic',
      'anytls',
      'shadowtls'
    ])
  })

  it('should parse Clash YAML proxies and ignore unsupported entries', () => {
    const yaml = `
proxies:
  - name: Clash VMess
    type: vmess
    server: vmess.example.com
    port: 443
    uuid: vmess-uuid
    cipher: auto
    tls: true
    network: ws
    ws-opts:
      path: /ws
      headers:
        Host: cdn.example.com
  - name: Clash SS
    type: ss
    server: 1.2.3.4
    port: 8388
    cipher: aes-256-gcm
    password: secret
    plugin: v2ray-plugin
    plugin-opts:
      mode: websocket
      host: ws.example.com
  - name: Unsupported
    type: wireguard
    server: hy.example.com
    port: 443
`
    const result = parseBatchLinks(yaml)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      type: 'vmess',
      tag: 'Clash VMess',
      server: 'vmess.example.com',
      server_port: 443,
      network: 'ws',
      path: '/ws',
      host: 'cdn.example.com'
    })
    expect(result[0]?.tls?.enabled).toBe(true)

    expect(result[1]).toMatchObject({
      type: 'shadowsocks',
      tag: 'Clash SS',
      server: '1.2.3.4',
      server_port: 8388,
      method: 'aes-256-gcm',
      plugin: 'v2ray-plugin'
    })
    expect(result[1]?.plugin_opts).toContain('mode=websocket')
    expect(result[1]?.plugin_opts).toContain('host=ws.example.com')
  })

  it('should parse Base64 encoded Clash YAML subscription', () => {
    const yaml = `
proxies:
  - name: Clash Trojan
    type: trojan
    server: trojan.example.com
    port: 443
    password: trojan-pass
    sni: edge.example.com
`
    const result = parseBatchLinks(Base64.encode(yaml))

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'trojan',
      tag: 'Clash Trojan',
      server: 'trojan.example.com',
      server_port: 443,
      password: 'trojan-pass'
    })
    expect(result[0]?.tls?.enabled).toBe(true)
    expect(result[0]?.tls?.server_name).toBe('edge.example.com')
  })

  it('should parse Clash YAML for Hysteria2, TUIC, AnyTLS and ShadowTLS', () => {
    const yaml = `
proxies:
  - name: HY2
    type: hy2
    server: hy2.example.com
    port: 443
    password: hy2-pass
    obfs: salamander
    obfs-password: hy2-obfs
    sni: edge.example.com
  - name: TUIC
    type: tuic
    server: tuic.example.com
    port: 443
    uuid: 11111111-1111-1111-1111-111111111111
    password: tuic-pass
    congestion-controller: bbr
    udp-relay-mode: native
    reduce-rtt: true
    heartbeat-interval: 10000
    sni: tuic.example.com
  - name: AnyTLS
    type: anytls
    server: anytls.example.com
    port: 443
    password: anytls-pass
    idle-session-check-interval: 15s
    idle-session-timeout: 30s
    min-idle-session: 2
    sni: anytls.example.com
  - name: ShadowTLS
    type: shadowtls
    server: st.example.com
    port: 443
    version: 3
    password: st-pass
    sni: st.example.com
`
    const result = parseBatchLinks(yaml)

    expect(result).toHaveLength(4)
    expect(result[0]).toMatchObject({
      type: 'hysteria2',
      password: 'hy2-pass',
      obfs: 'salamander',
      obfs_password: 'hy2-obfs'
    })
    expect(result[1]).toMatchObject({
      type: 'tuic',
      password: 'tuic-pass',
      congestion_control: 'bbr',
      udp_relay_mode: 'native',
      zero_rtt_handshake: true,
      heartbeat: '10000ms'
    })
    expect(result[2]).toMatchObject({
      type: 'anytls',
      password: 'anytls-pass',
      idle_session_check_interval: '15s',
      idle_session_timeout: '30s',
      min_idle_session: 2
    })
    expect(result[3]).toMatchObject({
      type: 'shadowtls',
      version: 3,
      password: 'st-pass'
    })
  })

  it('should export unsupported share-link protocols as Clash YAML and parse them back', () => {
    const exported = generateBatchLinks([
      {
        type: 'anytls',
        tag: 'AnyTLS Node',
        server: 'anytls.example.com',
        server_port: 443,
        password: 'secret',
        tls: {
          enabled: true,
          server_name: 'anytls.example.com',
          insecure: false
        }
      },
      {
        type: 'shadowtls',
        tag: 'ShadowTLS Node',
        server: 'shadowtls.example.com',
        server_port: 443,
        version: 3,
        password: 'shadow-secret',
        tls: {
          enabled: true,
          server_name: 'shadowtls.example.com',
          insecure: false
        }
      }
    ] as any)

    expect(exported).toContain('proxies:')
    const reparsed = parseBatchLinks(exported)
    expect(reparsed).toHaveLength(2)
    expect(reparsed[0]).toMatchObject({
      type: 'anytls',
      password: 'secret'
    })
    expect(reparsed[1]).toMatchObject({
      type: 'shadowtls',
      version: 3,
      password: 'shadow-secret'
    })
  })

  it('should return null for invalid link', () => {
    expect(parseShareLink('invalid://link')).toBeNull()
  })
})
