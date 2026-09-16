import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { AUTO_ROUTING_PROMPT } from '../plugins/xunji-workbench/lib/workflows.js'
import { apply as applyHost } from '../plugins/xunji-workbench/lib/index.js'

// 用构建产物真实执行插件的 apply，记录它向 DSH 注册了什么，而不是对源码文本做正则。

function loadClientPlugin() {
  let plugin
  const sandbox = {
    window: { location: { port: '3000', protocol: 'http:', hostname: '127.0.0.1' }, __ModuleLoader__: { load: ({ factory }) => { plugin = factory(() => ({})) } } },
    document: { getElementById: () => null, createElement: () => ({ dataset: {}, remove() {} }), head: { append() {} } },
  }
  runInNewContext(readFileSync('plugins/xunji-workbench/lib/client.js', 'utf8'), sandbox)
  return plugin
}

function applyClient() {
  const registered = { slots: [], tabs: [], events: [], effects: [] }
  const ctx = {
    effect: (run, label) => { registered.effects.push(label); registered.dispose = run() },
    remote: { pluginInventory: { list: async () => ({ ok: true, value: { entries: [] } }) } },
    uiConversation: { events: { register: (definition) => { registered.events.push(definition); return () => {} } } },
    sidebarRightTabs: { register: (tab) => { registered.tabs.push(tab); return () => {} } },
    slots: {
      inject: (_name, register) => register(),
      register: (options, component) => { registered.slots.push({ ...options, component }); return () => {} },
    },
  }
  loadClientPlugin().apply(ctx)
  return registered
}

test('客户端插件只通过 DSH 的插槽、右侧栏标签和会话事件接入，且 id 与 key 对应', () => {
  const registered = applyClient()
  const byName = Object.fromEntries(registered.slots.map((slot) => [slot.name, slot]))
  assert.deepEqual(Object.keys(byName).sort(), ['conversation.chat.turnTail', 'main', 'sidebar.panellist', 'sidebar.right.pane.tab'])
  // 左侧栏入口的 id 与中央面板的 key 必须一致，侧栏点击时才能选中面板
  assert.equal(byName['sidebar.panellist'].id, 'xunji')
  assert.equal(byName['sidebar.panellist'].label, '溯源配置')
  assert.equal(byName.main.key, 'xunji')
  // 会话态走原生右侧栏标签，标题对外只出现产品名
  assert.equal(registered.tabs.length, 1)
  assert.equal(registered.tabs[0].id, byName['sidebar.right.pane.tab'].key)
  assert.equal(registered.tabs[0].title(), '寻迹助手')
  // 回合尾只在本回合有来源时渲染
  assert.equal(typeof byName['conversation.chat.turnTail'].select, 'function')
  assert.equal(byName['conversation.chat.turnTail'].select({ turn: { data: { get: () => ({ sources: [], evidence: [] }) } } }), null)
  assert.equal(registered.events[0].kind, 'xunji-sources')
  // 注销时逐一释放，不留残余
  assert.equal(typeof registered.dispose, 'function')
  registered.dispose()
})

test('Host 插件把资料路由规则注入为系统提示词分节', () => {
  const sections = []
  applyHost({ systemPrompt: { section: (section) => sections.push(section) } })
  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, 'xunji:auto-routing')
  assert.equal(typeof sections[0].text, 'function')
  assert.ok(sections[0].text({}).startsWith(AUTO_ROUTING_PROMPT))
})

test('客户端构建通过 DSH ModuleLoader 获取 React，不自带副本', () => {
  const bundle = readFileSync('plugins/xunji-workbench/lib/client.js', 'utf8')
  assert.match(bundle, /factory: \(require\) =>/)
  assert.match(bundle, /require\(['"]react['"]\)/)
  assert.doesNotMatch(bundle, /react-dom\/client/)
})
