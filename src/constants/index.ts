export const SYSTEM_PROXY_PORT = 10808
export const LOCAL_PROXY_PORT = 10860
export const LOCAL_PROXY_HOSTS = ['www.google.com', 'www.apple.com']
export const LOCAL_PROXY_NODE_CHECK_RETRIES = 3
export const LOCAL_PROXY_NODE_CHECK_RETRY_DELAY_MS = 1200
export const LOCAL_PROXY_NODE_APPLY_WARMUP_MS = 800
export const LOCAL_PROXY_NODE_CHECK_TIMEOUT_MS = 5000
export const LOCAL_PROXY_RECHECK_INTERVAL_MS = 60000

export const DEFAULT_DNS_PRIMARY = 'https://cloudflare-dns.com/dns-query'
export const DEFAULT_DNS_SECONDARY = 'https://dns.alidns.com/resolve'
export const BOOTSTRAP_DNS = '223.5.5.5'

export const GEOIP_CN_RULE_SET_TAG = 'geoip-cn'
export const LOYALSOLDIER_GEOIP_CN_SRS_URL = 'https://cdn.jsdelivr.net/gh/Loyalsoldier/geoip@release/srs/cn.srs'
export const GEOSITE_CN_RULE_SET_TAG = 'geosite-cn'
export const SAGERNET_GEOSITE_CN_SRS_URL = 'https://cdn.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/geosite-cn.srs'
export const DNS_ADDRESS_STRATEGY = 'prefer_ipv4'


/** 游戏平台 */
export const PLATFORMS = ['Steam', 'Microsoft', 'Epic', 'EA', 'BattleNet', 'WeGame', 'Local', 'GOG'] as const
