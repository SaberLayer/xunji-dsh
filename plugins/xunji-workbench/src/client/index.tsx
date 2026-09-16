import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { CSS, STYLE_ID } from './style.js'
import { selectTurnSources, sourcesDefinition, TurnSources } from './sources.js'
import { XunjiPanel, XunjiPanelIcon, XunjiTab } from './workbench.js'

// 客户端入口只负责向 DSH 注册：样式、回合来源事件、右侧栏标签、左侧栏入口与中央面板、回合尾。
// 界面在 workbench.tsx / ConfigurationPanel.tsx / ImportPanel.tsx，来源标注在 sources.tsx。

/** 右侧栏标签类型：id 是实现标识（用于 keyed 插槽），kind 是打开时使用的名称。 */
const TAB_ID = 'xunji-workbench'
const TAB_KIND = 'xunji'
/** 左侧栏全局面板：sidebar.panellist 的 id 与 main 插槽的 key 必须一致。 */
const PANEL_ID = 'xunji'

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
