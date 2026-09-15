import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import {
  CONFIGURATION_GUIDES,
  CONNECTORS,
  connectorPhases,
  type ConnectorPhase,
  type InventoryEntry,
} from './workflows.js'
import { CSS, STYLE_ID } from './style.js'
import { BRAND_ICON } from './brand.js'

/** 右侧栏标签类型：id 是实现标识（用于 keyed 插槽），kind 是打开时使用的名称。 */
const TAB_ID = 'xunji-workbench'
const TAB_KIND = 'xunji'
/** 左侧栏全局面板：sidebar.panellist 的 id 与 main 插槽的 key 必须一致。 */
const PANEL_ID = 'xunji'
const SOURCES_KEY = 'xunji-sources'

interface WorkbenchInjected {
  readonly listPlugins: () => Promise<PluginInventorySnapshot>
}

type Evidence = { readonly label: string; readonly detail: string; readonly href?: string }

/** 每个回合内实际调用过的资料工具，按事件流累积后发布到回合数据。 */
interface XunjiSourcesTurnData {
  readonly sources: readonly string[]
  readonly evidence: readonly Evidence[]
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap {
    [SOURCES_KEY]: XunjiSourcesTurnData
  }
}

type TabProps = PropsRuntime<'sidebar.right.pane.tab'> & InjectFace<WorkbenchInjected>
type PanelProps = PropsRuntime<'main'> & InjectFace<WorkbenchInjected>
type PanelIconProps = PropsRuntime<'sidebar.panellist'>
type TurnSourcesProps = PropsRuntime<'conversation.chat.turnTail'> & { readonly matched: XunjiSourcesTurnData }

const configPort = Number(window.location.port || (window.location.protocol === 'https:' ? '443' : '80')) + 1
const CONFIG_API_URL = `${window.location.protocol}//${window.location.hostname}:${configPort}/v1/config`

const PHASE_COPY: Record<ConnectorPhase, string> = {
  active: '已启用',
  loading: '读取中',
  failed: '异常',
  off: '按需',
}

function initials(label: string): string {
  if (label === '本地知识') return 'DB'
  if (label === '代码库') return 'CB'
  if (label === '历史归档') return 'AR'
  if (label === '飞书对话') return 'IM'
  if (label === '飞书') return 'FS'
  if (label === 'MasterGo') return 'MG'
  return 'CF'
}

function sourceForTool(name: string): string | null {
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

function evidenceFromResult(source: string, text: string): readonly Evidence[] {
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

/** 按会话事件流累积每个回合调用过的资料工具，并把结果发布为回合数据供回合尾读取。 */
const sourcesDefinition: ConversationNodeDefinition<SourcesState> = {
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

function useInventory(listPlugins: WorkbenchInjected['listPlugins']): {
  inventory: readonly InventoryEntry[]
  state: 'loading' | 'ready' | 'error'
  refresh: () => Promise<void>
} {
  const [inventory, setInventory] = useState<readonly InventoryEntry[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const refresh = useCallback(async () => {
    setState('loading')
    try {
      const snapshot = await listPlugins()
      setInventory(snapshot.entries as readonly InventoryEntry[])
      setState('ready')
    } catch {
      setState('error')
    }
  }, [listPlugins])

  useEffect(() => { void refresh() }, [refresh])
  return { inventory, state, refresh }
}

function ConnectionList({ inventory, state, compact = false }: {
  inventory: readonly InventoryEntry[]
  state: 'loading' | 'ready' | 'error'
  compact?: boolean
}): ReactNode {
  const phases = useMemo(() => connectorPhases(inventory), [inventory])
  return <div className="xunji-connections" data-compact={compact || undefined}>
    {CONNECTORS.map((connector) => {
      const phase = state === 'ready' ? phases[connector.id] : state === 'error' ? 'failed' : 'loading'
      return <div className="xunji-connection" key={connector.id} data-connector={connector.id}>
        <span className="xunji-connection__icon">{initials(connector.label)}</span>
        <span className="xunji-connection__copy"><strong>{connector.label}</strong><span>{connector.description}</span></span>
        <span className="xunji-connection__phase" data-phase={phase}><i/>{PHASE_COPY[phase]}</span>
      </div>
    })}
  </div>
}

function selectTurnSources(owner: { readonly turn: { readonly data: { get(key: typeof SOURCES_KEY): Readonly<XunjiSourcesTurnData> | undefined } } }): XunjiSourcesTurnData | null {
  const data = owner.turn.data.get(SOURCES_KEY)
  return data && data.sources.length ? data : null
}

function TurnSources({ matched }: TurnSourcesProps): ReactNode {
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

interface ImportedFile {
  readonly name: string
  readonly size: number
  readonly updatedAt: string
  readonly status?: 'pending' | 'indexed' | 'failed'
  readonly error?: string
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

/** 对话导入区：把飞书导出的 zip / md 存到本机导入目录，MCP 检索时自动重建索引。 */
function ImportPanel({ onNotice }: { onNotice: (message: string) => void }): ReactNode {
  const [files, setFiles] = useState<readonly ImportedFile[]>([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${CONFIG_API_URL}/imports`, { cache: 'no-store' })
      const body = await response.json() as { ok?: boolean; files?: readonly ImportedFile[] }
      if (!response.ok || !body.ok || !body.files) throw new Error('无法读取导入目录。')
      setFiles(body.files)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法读取导入目录。')
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 3000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const upload = async (list: FileList | null): Promise<void> => {
    if (busy || !list?.length) return
    setBusy(true)
    try {
      for (const file of Array.from(list)) {
        if (file.size > 64 * 1024 * 1024) throw new Error(`${file.name} 超过 64 MB。`)
        const response = await fetch(`${CONFIG_API_URL}/imports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
          body: file,
        })
        const body = await response.json() as { ok?: boolean; files?: readonly ImportedFile[]; error?: string }
        if (!response.ok || !body.ok || !body.files) throw new Error(body.error ?? '上传失败。')
        setFiles(body.files)
      }
      const message = '已上传并通过格式校验；启用对话导入后，下次检索会建立索引。'
      setNotice(message)
      onNotice(message)
    } catch (error) {
      const message = error instanceof Error ? error.message : '上传失败。'
      setNotice(message)
      onNotice(message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (name: string): Promise<void> => {
    setBusy(true)
    try {
      const response = await fetch(`${CONFIG_API_URL}/imports`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const body = await response.json() as { ok?: boolean; files?: readonly ImportedFile[]; error?: string }
      if (!response.ok || !body.ok || !body.files) throw new Error(body.error ?? '删除失败。')
      setFiles(body.files)
      setNotice(`已移除 ${name}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除失败。')
    } finally {
      setBusy(false)
    }
  }

  return <div className="xunji-import" data-xunji-import-panel>
    <div className="xunji-config-panel__form-title"><span>导入对话文件</span><em>只保存在本机，不上传</em></div>
    <label
      className="xunji-import__drop"
      data-dragging={dragging || undefined}
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files) }}
    >
      <input type="file" accept=".zip,.md,.markdown,.txt" multiple disabled={busy} onChange={(event) => { void upload(event.target.files); event.target.value = '' }}/>
      <strong>{busy ? '正在导入…' : '点击选择，或把文件拖到这里'}</strong>
      <span>支持飞书导出的 .zip（含图片）与 .md；可一次选多个</span>
    </label>
    {files.length > 0 && <ul className="xunji-import__list">
      {files.map((file) => <li key={file.name}>
        <span className="xunji-import__name" title={file.name}>{file.name}</span>
        <span className="xunji-import__meta">{formatSize(file.size)}</span>
        <span className="xunji-import__status" data-failed={file.status === 'failed' || undefined} title={file.error}>{file.status === 'indexed' ? '已索引' : file.status === 'failed' ? `解析失败：${file.error ?? '请重新导出'}` : '待检索时索引'}</span>
        <button type="button" disabled={busy} onClick={() => void remove(file.name)} aria-label={`移除 ${file.name}`}>移除</button>
      </li>)}
    </ul>}
    {notice ? <p className="xunji-config-panel__notice" role="status">{notice}</p> : null}
  </div>
}

function ConfigurationPanel({ inventory, state, onNotice }: {
  inventory: readonly InventoryEntry[]
  state: 'loading' | 'ready' | 'error'
  onNotice: (message: string) => void
}): ReactNode {
  const defaultGuide = CONFIGURATION_GUIDES[0]!
  const [selectedId, setSelectedId] = useState(defaultGuide.id)
  const [copyNotice, setCopyNotice] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [cleared, setCleared] = useState<readonly string[]>([])
  const [configured, setConfigured] = useState<Record<string, boolean>>({})
  // 非密钥开关项由服务端回显实际值，下拉据此选中当前状态
  const [current, setCurrent] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const phases = useMemo(() => connectorPhases(inventory), [inventory])
  const guide = CONFIGURATION_GUIDES.find((item) => item.id === selectedId) ?? defaultGuide
  const phase = state === 'ready' ? phases[guide.connectorId] : state === 'error' ? 'failed' : 'loading'
  // 无密钥字段的资料源（如对话导入）不应显示凭据相关措辞
  const hasSecret = guide.fields.some((field) => field.secret)

  const refreshConfiguration = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${CONFIG_API_URL}/status`, { cache: 'no-store' })
      const body = await response.json() as { ok?: boolean; configured?: Record<string, boolean>; values?: Record<string, string> }
      if (!response.ok || !body.ok || !body.configured) throw new Error('本机配置服务不可用。请通过 npm start 启动。')
      setConfigured(body.configured)
      if (body.values) setCurrent(body.values)
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法读取本机配置状态。'
      onNotice(message)
    }
  }, [onNotice])

  useEffect(() => { void refreshConfiguration() }, [refreshConfiguration])

  const saveConfiguration = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const entries = guide.fields
      .map((field) => [field.key, cleared.includes(field.key) ? '' : (field.secret ? values[field.key] ?? '' : values[field.key]?.trim() ?? '')] as const)
      .filter(([key, value]) => value.length > 0 || cleared.includes(key))
    if (!entries.length) {
      setCopyNotice('请先填写至少一个配置项；留空的字段会保留现有值。')
      return
    }
    setSaving(true)
    try {
      const response = await fetch(CONFIG_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: Object.fromEntries(entries) }),
      })
      const body = await response.json() as { ok?: boolean; configured?: Record<string, boolean>; values?: Record<string, string>; error?: string }
      if (!response.ok || !body.ok || !body.configured) throw new Error(body.error ?? '保存失败。')
      setConfigured(body.configured)
      if (body.values) setCurrent(body.values)
      setValues({})
      setCleared([])
      const message = '配置已保存；重启后生效。'
      setCopyNotice(message)
      onNotice(message)
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败。'
      setCopyNotice(message)
      onNotice(message)
    } finally {
      setSaving(false)
    }
  }

  return <section className="xunji-config-panel" aria-label="资料源图形化配置" data-xunji-configuration-panel>
    <div className="xunji-config-panel__intro">
      <div><strong>配置资料源</strong><span>配置与导入文件只保存在本机</span></div>
      <span className="xunji-config-panel__safe">不写入浏览器</span>
    </div>
    <div className="xunji-config-panel__tabs" role="tablist" aria-label="选择资料源">
      {CONFIGURATION_GUIDES.map((item) => <button
        key={item.id}
        type="button"
        role="tab"
        aria-selected={item.id === guide.id}
        data-active={item.id === guide.id || undefined}
        onClick={() => { setSelectedId(item.id); setCopyNotice(''); setValues({}); setCleared([]) }}
      >{item.label}</button>)}
    </div>
    <div className="xunji-config-panel__card" role="tabpanel">
      <div className="xunji-config-panel__heading">
        <div><h3>{guide.label}</h3><p>{guide.description}</p></div>
        <span className="xunji-connection__phase" data-phase={phase}><i/>{PHASE_COPY[phase]}</span>
      </div>
      <div className="xunji-config-panel__permission"><span>权限范围</span><strong>只读</strong><p>{guide.readOnlyScope}</p></div>
      <div className="xunji-config-panel__field">
        <span>本机 .env 已配置的变量</span>
        <div className="xunji-config-panel__variables">{guide.variables.map((variable) => <code key={variable}>{variable}</code>)}</div>
      </div>
      <form className="xunji-config-panel__form" onSubmit={(event) => void saveConfiguration(event)}>
        <div className="xunji-config-panel__form-title"><span>直接填写并保存</span><em>{hasSecret ? '不会回显已有密钥' : '无需密钥'}</em></div>
        {guide.fields.map((field) => <label className="xunji-config-panel__input" key={field.key}>
          <span>{field.label}{field.optional ? '（可选）' : ''}<i data-configured={configured[field.key] || undefined}>{configured[field.key] ? '已保存' : '未设置'}</i></span>
          {field.choices
            ? <select
              value={values[field.key] ?? current[field.key] ?? ''}
              onChange={(event) => setValues((entries) => ({ ...entries, [field.key]: event.target.value }))}
            >
              <option value="" disabled>请选择</option>
              {field.choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
            </select>
            : <input
              type={field.secret ? 'password' : 'text'}
              autoComplete="off"
              placeholder={field.placeholder}
              value={values[field.key] ?? ''}
              onChange={(event) => { setValues((current) => ({ ...current, [field.key]: event.target.value })); setCleared((keys) => keys.filter((key) => key !== field.key)) }}
            />}
          {!field.choices && configured[field.key] && <button className="xunji-config-panel__clear" type="button" disabled={saving} onClick={() => { setValues((current) => ({ ...current, [field.key]: '' })); setCleared((keys) => [...new Set([...keys, field.key])]) }}>{cleared.includes(field.key) ? '保存后清除' : '清除此项'}</button>}
        </label>)}
        <button type="submit" disabled={saving}>{saving ? '正在保存…' : '保存到本机 .env'}</button>
      </form>
      {guide.id === 'chat-import' ? <ImportPanel onNotice={onNotice}/> : null}
      <div className="xunji-config-panel__help">
        <strong>{hasSecret ? '如何获取凭据' : '使用步骤'}</strong>
        <ol>{guide.help.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        <a href={guide.help.href} target="_blank" rel="noreferrer">{guide.help.label} ↗</a>
      </div>
      <p className="xunji-config-panel__unified">{guide.id === 'chat-import'
        ? '启用开关改动需重启生效；启用后新上传的对话文件即时可检索，无需重启。'
        : '保存并重启后，会自动启用已配置资料源并按提问内容检索。'}</p>
      {copyNotice ? <p className="xunji-config-panel__notice" role="status">{copyNotice}</p> : null}
    </div>
  </section>
}

/** 工作台正文：中央面板与右侧栏标签共用，wide 时配置表单与连接状态并排。 */
function WorkbenchBody({ listPlugins, wide }: { listPlugins: WorkbenchInjected['listPlugins']; wide: boolean }): ReactNode {
  const [showConfiguration, setShowConfiguration] = useState(wide)
  const [notice, setNotice] = useState('已按当前配置自动启用资料源；提问时会按内容选择代码库、历史归档、飞书对话、Confluence、MasterGo 或飞书文档。')
  const { inventory, state, refresh } = useInventory(listPlugins)
  const phases = useMemo(() => connectorPhases(inventory), [inventory])
  const activeCount = Object.values(phases).filter((phase) => phase === 'active').length
  const connections = <div className="xunji-tab__connections">
    <div className="xunji-section-title"><strong>当前 Host 插件状态</strong><div className="xunji-section-actions"><button type="button" onClick={() => void refresh()}>刷新</button></div></div>
    <ConnectionList inventory={inventory} state={state}/>
    <p className="xunji-dock__connection-summary">首次实际检索时验证远端连通性；资料源的启用与凭据改动需重启生效。</p>
  </div>

  return <>
    <div className="xunji-tab__top">
      <div className="xunji-dock__brand">
        <span className="xunji-mini-mark"><WorkbenchGlyph size={32}/></span>
        <span className="xunji-dock__brand-copy"><strong>寻迹助手</strong><span>跨需求、代码与对话的线索检索</span></span>
      </div>
      <div className="xunji-dock__top-actions">
        {wide ? null : <button className="xunji-dock__config-toggle" type="button" aria-pressed={showConfiguration} onClick={() => setShowConfiguration((value) => !value)}>{showConfiguration ? '返回状态' : '配置资料源'}</button>}
        <span className="xunji-dock__connections-summary">
          <span className="xunji-status-dot" data-state={state}/>
          启用 {state === 'ready' ? `${activeCount}/${CONNECTORS.length}` : '…'}
        </span>
      </div>
    </div>
    {wide
      ? <div className="xunji-panel__grid"><ConfigurationPanel inventory={inventory} state={state} onNotice={setNotice}/>{connections}</div>
      : showConfiguration ? <ConfigurationPanel inventory={inventory} state={state} onNotice={setNotice}/> : connections}
    <p className="xunji-dock__notice" role="status">{notice}</p>
  </>
}

/** 会话态的工作台：作为 DSH 原生右侧栏的一个标签页，收起、分栏、全屏都交给宿主。 */
function XunjiTab({ listPlugins }: TabProps): ReactNode {
  return <section className="xunji-tab" aria-label="寻迹助手" data-xunji-workbench-tab>
    <WorkbenchBody listPlugins={listPlugins} wide={false}/>
  </section>
}

/** 中央全局面板：由左侧栏“新会话”下方的入口打开，不依赖会话。 */
function XunjiPanel({ listPlugins }: PanelProps): ReactNode {
  return <section className="xunji-panel" aria-label="寻迹助手" data-xunji-workbench-panel>
    <div className="xunji-panel__surface"><WorkbenchBody listPlugins={listPlugins} wide/></div>
  </section>
}

/** 面板标题用的品牌图：与桌面程序同一张图。 */
function WorkbenchGlyph({ size, className }: { size: number; className?: string }): ReactNode {
  return <img className={className} src={BRAND_ICON} width={size} height={size} alt="" draggable={false} aria-hidden="true"/>
}

/** 侧栏入口图标：与宿主“新会话”同为单色线条风格，图形沿用品牌图的对话气泡加代码符号。 */
function SidebarGlyph({ size, className }: { size: number; className?: string }): ReactNode {
  return <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 4.5h8a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4h-5l-3.5 3v-3H8a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4z"/>
    <path d="M10.5 8.8 8.5 11l2 2.2M13.5 8.8l2 2.2-2 2.2"/>
  </svg>
}

/** 左侧栏入口的图标；按钮本身由侧栏渲染，标题取自注册时的 label。 */
function XunjiPanelIcon({ size }: PanelIconProps): ReactNode {
  return <SidebarGlyph size={size} className="xunji-panel-glyph"/>
}

function installStyle(): () => void {
  if (document.getElementById(STYLE_ID) !== null) return () => {}
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.dataset.plugin = 'xunji-workbench'
  style.textContent = CSS
  document.head.append(style)
  return () => style.remove()
}

export const inject = ['slots', 'remote', 'remote.pluginInventory', 'uiConversation', 'sidebarRightTabs']

export function apply(ctx: ClientContext): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const listPlugins = async (): Promise<PluginInventorySnapshot> => {
    const result = await ctx.remote.pluginInventory.list()
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }

  ctx.effect(() => {
    const removeStyle = installStyle()
    const disposers = [
      ctx.uiConversation.events.register(sourcesDefinition),
      ctx.sidebarRightTabs.register({
        id: TAB_ID,
        kind: TAB_KIND,
        priority: 'extension',
        title: () => '寻迹助手',
        guide: [{ order: 20, title: () => '寻迹助手', description: () => '资料源配置、连接状态与自动检索说明' }],
      }),
      // 左侧栏“新会话”下方的全局入口：侧栏渲染按钮并在点击时选中同 id 的 main 面板
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        inject: () => ({ listPlugins }),
      }, XunjiPanel)),
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 10,
        label: '溯源配置',
      }, XunjiPanelIcon)),
      ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: TAB_ID,
        inject: () => ({ listPlugins }),
      }, XunjiTab)),
      ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
        name: 'conversation.chat.turnTail',
        priority: -10,
        select: selectTurnSources,
      }, TurnSources)),
    ]
    return () => {
      for (const dispose of disposers.reverse()) dispose()
      removeStyle()
    }
  }, 'xunji-workbench: integrated workspace lifecycle')
}
