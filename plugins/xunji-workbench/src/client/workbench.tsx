import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { CONNECTORS, connectorPhases, type InventoryEntry } from './workflows.js'
import { PHASE_COPY, initials } from './api.js'
import { BRAND_ICON } from './brand.js'
import { ConfigurationPanel } from './ConfigurationPanel.js'

// 工作台正文：中央面板与右侧栏标签共用同一组件，只是布局宽窄不同。

export interface WorkbenchInjected {
  readonly listPlugins: () => Promise<PluginInventorySnapshot>
}

type TabProps = PropsRuntime<'sidebar.right.pane.tab'> & InjectFace<WorkbenchInjected>
type PanelProps = PropsRuntime<'main'> & InjectFace<WorkbenchInjected>
type PanelIconProps = PropsRuntime<'sidebar.panellist'>

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

/** 工作台正文：wide 时配置表单与连接状态并排，否则二选一切换。 */
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
export function XunjiTab({ listPlugins }: TabProps): ReactNode {
  return <section className="xunji-tab" aria-label="寻迹助手" data-xunji-workbench-tab>
    <WorkbenchBody listPlugins={listPlugins} wide={false}/>
  </section>
}

/** 中央全局面板：由左侧栏“新会话”下方的入口打开，不依赖会话。 */
export function XunjiPanel({ listPlugins }: PanelProps): ReactNode {
  return <section className="xunji-panel" aria-label="寻迹助手" data-xunji-workbench-panel>
    <div className="xunji-panel__surface"><WorkbenchBody listPlugins={listPlugins} wide/></div>
  </section>
}

/** 左侧栏入口的图标；按钮本身由侧栏渲染，标题取自注册时的 label。 */
export function XunjiPanelIcon({ size }: PanelIconProps): ReactNode {
  return <SidebarGlyph size={size} className="xunji-panel-glyph"/>
}
