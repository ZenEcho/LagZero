export const SYSTEM_PROXY_PORT = 10808 // 系统代理端口
export const LOCAL_PROXY_PORT = 10860 // 本地代理端口
export const LOCAL_PROXY_HOSTS = ['www.google.com', 'www.apple.com'] // 本地代理主机
export const LOCAL_PROXY_NODE_CHECK_RETRIES = 3 // 本地代理节点检查重试次数
export const LOCAL_PROXY_NODE_CHECK_RETRY_DELAY_MS = 1200 // 本地代理节点检查重试延迟
export const LOCAL_PROXY_NODE_APPLY_WARMUP_MS = 800 // 本地代理节点应用预热时间
export const LOCAL_PROXY_NODE_CHECK_TIMEOUT_MS = 5000 // 本地代理节点检查超时
export const LOCAL_PROXY_RECHECK_INTERVAL_MS = 60000 // 本地代理节点重检间隔

export const DEFAULT_DNS_PRIMARY = 'https://cloudflare-dns.com/dns-query' // 默认DNS主服务器
export const DEFAULT_DNS_SECONDARY = 'https://dns.alidns.com/resolve' // 默认DNS副服务器
export const BOOTSTRAP_DNS = '223.5.5.5' // 引导DNS

export const GEOIP_CN_RULE_SET_TAG = 'geoip-cn' // GeoIP CN规则集标签
export const LOYALSOLDIER_GEOIP_CN_SRS_URL = 'https://cdn.jsdelivr.net/gh/Loyalsoldier/geoip@release/srs/cn.srs' // GeoIP CN规则集URL
export const GEOSITE_CN_RULE_SET_TAG = 'geosite-cn' // GeoSite CN规则集标签
export const SAGERNET_GEOSITE_CN_SRS_URL = 'https://cdn.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/geosite-cn.srs' // GeoSite CN规则集URL
export const DNS_ADDRESS_STRATEGY = 'prefer_ipv4' // DNS地址策略


/** 游戏平台 */
export const PLATFORMS = ['Steam', 'Microsoft', 'Epic', 'EA', 'BattleNet', 'WeGame', 'Local', 'GOG'] as const
export const SCAN_SOURCES = ['Steam', 'Microsoft', 'Epic', 'EA', 'BattleNet', 'WeGame', 'Local'] as const
export type GameScanSource = typeof SCAN_SOURCES[number]
