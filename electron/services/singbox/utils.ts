/**
 * 移除字符串中的 ANSI 颜色代码
 * @param input 包含 ANSI 代码的字符串
 * @returns 纯文本字符串
 */
export function stripAnsi(input: string): string {
  return input.replace(/\x1B\[[0-9;]*m/g, '')
}

/**
 * 获取运行 sing-box 所需的环境变量
 * 注入了兼容性开关，以支持新版 sing-box 的某些过时特性
 */
export function getSingboxEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ENABLE_DEPRECATED_SPECIAL_OUTBOUNDS: 'true',
    ENABLE_DEPRECATED_LEGACY_DNS_SERVERS: 'true',
    ENABLE_DEPRECATED_MISSING_DOMAIN_RESOLVER: 'true'
  }
}
