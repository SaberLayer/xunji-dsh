import type { ReactNode } from 'react'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

// 回合尾的“实际检索 / 依据”：按会话事件流累积每回合调用过的资料工具，发布为回合数据。

export const SOURCES_KEY = 'xunji-sources'

export type Evidence = { readonly label: string; readonly detail: string; readonly href?: string }

/** 每个回合内实际调用过的资料工具与提取到的依据。 */
export interface XunjiSourcesTurnData {
  readonly sources: readonly string[]
  readonly evidence: readonly Evidence[]
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap {
    [SOURCES_KEY]: XunjiSourcesTurnData
  }
}

type TurnSourcesProps = PropsRuntime<'conversation.chat.turnTail'> & { readonly matched: XunjiSourcesTurnData }

/** 工具名到来源中文名的映射；返回 null 表示不是资料工具。 */
export function sourceForTool(name: string): string | null {
  const normalized = name.toLocaleLowerCase()
  if (normalized.includes('confluence') || normalized.includes('atlassian')) return 'Confluence'
  if (normalized.includes('mastergo') || normalized.includes('magic')) return 'MasterGo'
  if (normalized.includes('codebase')) return '代码库'
  if (normalized.includes('conversation_archive') || normalized.includes('conversation-archive')) return '历史归档'
  if (normalized.includes('chat_import') || normalized.includes('chat-import')) return '飞书对话'
  if (normalized.includes('knowledge')) return '本地知识'
  if (normalized.includes('lark') || normalized.includes('feishu') || normalized.includes('wiki')) return '飞书'
  return null
}

function textFromContent(block: unknown): string | null {
  const value = block as { readonly type?: unknown; readonly text?: unknown }
  return value.type === 'text' && typeof value.text === 'string' ? value.text : null
}

function asRecords(text: string): readonly Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(text) as unknown
    if (Array.isArray(parsed)) return parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    return parsed && typeof parsed === 'object' ? [parsed as Record<string, unknown>] : []
  } catch { return [] }
}

/** 从工具返回的 JSON 里按来源类型提取可展示的依据。 */
export function evidenceFromResult(source: string, text: string): readonly Evidence[] {
  const records = asRecords(text)
  const own: Evidence[] = []
  if (source === '代码库') {
    for (const record of records) {
      if (typeof record.path !== 'string') continue
      own.push({ label: source, detail: `${typeof record.codebase === 'string' ? record.codebase : '代码库'} · ${record.path}` })
    }
  } else if (source === '飞书对话') {
    for (const record of records) {
      if (typeof record.conversation !== 'string') continue
      const messages = Array.isArray(record.messages) ? record.messages as Record<string, unknown>[] : [record]
      for (const message of messages) {
        if (Array.isArray(record.messages) && message.current !== true) continue
        const parts = [record.conversation, message.sender, message.timestamp].filter((item): item is string => typeof item === 'string')
        if (typeof message.sender === 'string') own.push({ label: source, detail: parts.join(' · ') })
      }
    }
  } else if (source === '历史归档') {
    for (const record of records) {
      const parts = [record.source, record.kind, record.project, record.timestamp].filter((item): item is string => typeof item === 'string' && item.length > 0)
      if (parts.length) own.push({ label: source, detail: parts.join(' · ') })
    }
  }
  // 本机来源的 list 类工具没有可展示的条目，跳过而不是显示笼统的兜底文案
  if (!own.length && !['代码库', '历史归档', '飞书对话'].includes(source) && text.trim() && text.trim() !== '[]') {
    const href = text.match(/https?:\/\/[^\s)\]"']+/)?.[0]
    own.push(href ? { label: source, detail: '打开原始资料', href } : { label: source, detail: '已使用检索结果' })
  }
  return own
}

interface SourcesState {
  readonly turn: number
  readonly calls: ReadonlyMap<string, string>
  readonly sources: readonly string[]
  readonly evidence: readonly Evidence[]
}

/** 向 uiConversation.events 注册的节点定义：按 turn/start、tool/call、tool/result 累积。 */
export const sourcesDefinition: ConversationNodeDefinition<SourcesState> = {
  kind: SOURCES_KEY,
  match: (event) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event.type === 'tool/call' || event.type === 'tool/result') return { id: String(event.data.turn), role: 'update' }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'turn/start') throw new Error('xunji-sources 只能由 turn/start 事件开始')
    return { turn: match.event.data.turn, calls: new Map(), sources: [], evidence: [] }
  },
  update: (context, match) => {
    const { state } = context
    if (match.event.type === 'tool/call') {
      const calls = new Map(state.calls).set(String(match.event.data.callId), match.event.data.name)
      return { ...state, calls }
    }
    if (match.event.type !== 'tool/result') return state
    const block = match.event.data.message.content[0]
    const name = state.calls.get(String(match.event.data.message.source.callId))
    const source = name ? sourceForTool(name) : null
    if (!source || block.isError === true) return state
    const text = block.content.map(textFromContent).filter((item): item is string => item !== null).join('\n')
    // 调用成功即算“实际检索”，零命中也要让用户知道查过；只有报错的调用不计入
    const sources = state.sources.includes(source) ? state.sources : [...state.sources, source]
    const evidence = evidenceFromResult(source, text)
    if (!evidence.length) return { ...state, sources }
    const seen = new Set(state.evidence.map((item) => `${item.label}\n${item.detail}\n${item.href ?? ''}`))
    const fresh = evidence.filter((item) => !seen.has(`${item.label}\n${item.detail}\n${item.href ?? ''}`))
    return { ...state, sources, evidence: fresh.length ? [...state.evidence, ...fresh].slice(0, 3) : state.evidence }
  },
  buildLocationData: (context, scope, previous) => {
    const state = context.state
    if (scope !== 'turn' || !state) return null
    if (previous?.kind === 'turn' && previous.key === SOURCES_KEY && previous.turn === state.turn
      && previous.value.sources === state.sources && previous.value.evidence === state.evidence) return previous
    return { kind: 'turn', turn: state.turn, key: SOURCES_KEY, value: { sources: state.sources, evidence: state.evidence } }
  },
}

/** 回合尾插槽的选择器：只有本回合有来源时才渲染。 */
export function selectTurnSources(owner: { readonly turn: { readonly data: { get(key: typeof SOURCES_KEY): Readonly<XunjiSourcesTurnData> | undefined } } }): XunjiSourcesTurnData | null {
  const data = owner.turn.data.get(SOURCES_KEY)
  return data && data.sources.length ? data : null
}

export function TurnSources({ matched }: TurnSourcesProps): ReactNode {
  return <div className="xunji-turn-sources" aria-label={`本次实际检索来源：${matched.sources.join('、')}`}>
    <span>实际检索</span>
    {matched.sources.map((source) => <i key={source}>{source}</i>)}
    {matched.evidence.length > 0 && <div className="xunji-turn-evidence" aria-label="本次回答依据">
      <span>依据</span>
      {matched.evidence.map((item) => item.href
        ? <a key={`${item.label}-${item.detail}`} href={item.href} target="_blank" rel="noreferrer">{item.detail}</a>
        : <em key={`${item.label}-${item.detail}`}>{item.detail}</em>)}
    </div>}
  </div>
}
