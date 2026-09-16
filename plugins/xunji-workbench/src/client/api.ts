import type { ConnectorPhase } from './workflows.js'

/** 本机配置服务固定在 Web 端口加一的位置，由 start.mjs 与页面两侧共同约定。 */
const configPort = Number(window.location.port || (window.location.protocol === 'https:' ? '443' : '80')) + 1
export const CONFIG_API_URL = `${window.location.protocol}//${window.location.hostname}:${configPort}/v1/config`

export const PHASE_COPY: Record<ConnectorPhase, string> = {
  active: '已启用',
  loading: '读取中',
  failed: '异常',
  off: '按需',
}

/** 连接状态卡片的两字母缩写。 */
export function initials(label: string): string {
  if (label === '本地知识') return 'DB'
  if (label === '代码库') return 'CB'
  if (label === '历史归档') return 'AR'
  if (label === '飞书对话') return 'IM'
  if (label === '飞书') return 'FS'
  if (label === 'MasterGo') return 'MG'
  return 'CF'
}
