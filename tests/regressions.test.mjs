import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { deflateRawSync } from 'node:zlib'
import { runInNewContext } from 'node:vm'
import { configuredFeatures, loadEnvFile, writeEnvValues, updateEnvText } from '../scripts/common.mjs'
import { startConfigServer, validValue, safeImportName } from '../scripts/config-server.mjs'
import { MAX_IMPORT_BYTES, readExportBuffer } from '../scripts/chat-import-files.mjs'
import { parseLarkChatMarkdown, dedupeMessages } from '../scripts/lark-chat-parser.mjs'
import { forbiddenArtifactPaths } from '../scripts/artifact-audit.mjs'

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'xunji-regression-'))
  const children = []
  t.after(async () => {
    for (const { child, exited } of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill()
      await exited
    }
    rmSync(directory, { recursive: true, force: true })
  })
  return {
    directory,
    mcp(script, env) {
      const child = spawn(process.execPath, [resolve('scripts', script)], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] })
      const exited = new Promise((resolveExit) => child.once('exit', resolveExit))
      children.push({ child, exited })
      let sequence = 0
      let errors = ''
      const pending = new Map()
      child.stderr.on('data', (chunk) => { errors += chunk })
      const lines = createInterface({ input: child.stdout })
      lines.on('line', (line) => {
        const message = JSON.parse(line)
        const task = pending.get(message.id)
        if (!task) return
        pending.delete(message.id)
        clearTimeout(task.timer)
        if (message.error) task.reject(new Error(message.error.message))
        else task.resolve(JSON.parse(message.result.content[0].text))
      })
      child.on('exit', () => {
        for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error(`MCP 意外退出：${errors}`)) }
        pending.clear()
      })
      child.on('error', (error) => {
        for (const task of pending.values()) { clearTimeout(task.timer); task.reject(error) }
        pending.clear()
      })
      return (name, args = {}) => new Promise((resolveCall, reject) => {
        const id = ++sequence
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP 调用超时：${name} ${errors}`)) }, 10000)
        pending.set(id, { resolve: resolveCall, reject, timer })
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })}\n`)
      })
    },
  }
}

const delay = (ms) => new Promise((done) => setTimeout(done, ms))
const exported = (text, minute = '10:00') => `# 示例群\n\n测试者 2026年1月1日 ${minute}\n${text}\n`

test('配置保存再加载保持路径、引号和密码原值，且不覆盖进程环境变量', (t) => {
  const { directory } = fixture(t)
  const key = 'XUNJI_REGRESSION_VALUE'
  const previous = process.env[key]
  t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous })
  const path = join(directory, '.env')
  for (const value of [String.raw`C:\workspace\demo`, String.raw`\\server\share\repo`, 'demo"quote', String.raw`demo\password`, "a'b # value", ' leading space ']) {
    delete process.env[key]
    writeEnvValues({ [key]: value }, path)
    loadEnvFile(path)
    assert.equal(process.env[key], value)
  }
  writeFileSync(path, `${key}="C:\\temp\\repo"\n`)
  delete process.env[key]
  loadEnvFile(path)
  assert.equal(process.env[key], String.raw`C:\temp\repo`)
  process.env[key] = 'external'
  loadEnvFile(path)
  assert.equal(process.env[key], 'external')
  assert.throws(() => updateEnvText('', { [key]: 'bad\0value' }), /控制字符/)
})

test('对话导入只认 on，代码库配置允许明确清空', () => {
  assert.deepEqual(configuredFeatures({ XUNJI_CHAT_IMPORT: 'off' }), [])
  assert.deepEqual(configuredFeatures({ XUNJI_CHAT_IMPORT: 'on' }), ['chat-import'])
  assert.equal(validValue('XUNJI_CODEBASE_PATHS', ''), true)
  assert.equal(validValue('XUNJI_CODEBASE_PATHS', 'relative'), false)
  for (const name of ['CON.md', 'a:b.md', '../a.md', 'a\\b.md']) assert.equal(safeImportName(name), null)
})

test('实际配置接口支持清除，错误导入不会覆盖文件，索引状态可读取', async (t) => {
  const f = fixture(t)
  const imports = join(f.directory, 'imports')
  const key = 'XUNJI_CODEBASE_PATHS'
  const previous = process.env[key]
  const origin = 'http://127.0.0.1:39000'
  const server = await startConfigServer({ port: 0, allowedOrigins: [origin], envPath: join(f.directory, '.env'), importDir: imports })
  t.after(async () => { await server.close(); if (previous === undefined) delete process.env[key]; else process.env[key] = previous })
  const api = `http://127.0.0.1:${server.port}/v1/config`
  const post = (values) => fetch(api, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ values }) })
  assert.equal((await post({ [key]: f.directory })).status, 200)
  assert.equal((await post({ [key]: '' })).status, 200)
  assert.equal(process.env[key], '')
  assert.match(readFileSync(join(f.directory, '.env'), 'utf8'), /XUNJI_CODEBASE_PATHS=\n/)
  assert.equal((await fetch(`${api}/status`)).status, 403)
  const upload = (body) => fetch(`${api}/imports`, { method: 'POST', headers: { Origin: origin, 'X-File-Name': 'chat.md' }, body })
  assert.equal((await upload('not an export')).status, 400)
  assert.equal(existsSync(join(imports, 'chat.md')), false)
  const markdown = exported('可检索的内容')
  const accepted = await (await upload(markdown)).json()
  assert.equal(accepted.files[0].status, 'pending')
  assert.equal((await upload('invalid replacement')).status, 400)
  assert.equal(readFileSync(join(imports, 'chat.md'), 'utf8'), markdown)
  const call = f.mcp('chat-import-mcp.mjs', { XUNJI_CHAT_IMPORT_DIR: imports })
  await call('chat_import_list')
  const indexed = await (await fetch(`${api}/imports`, { headers: { Origin: origin } })).json()
  assert.equal(indexed.files[0].status, 'indexed')
})

function zip(markdown, declaredSize = Buffer.byteLength(markdown)) {
  const name = Buffer.from('chat.md')
  const compressed = deflateRawSync(Buffer.from(markdown))
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50)
  local.writeUInt16LE(8, 8)
  local.writeUInt16LE(name.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50)
  central.writeUInt16LE(8, 10)
  central.writeUInt32LE(compressed.length, 20)
  central.writeUInt32LE(declaredSize, 24)
  central.writeUInt16LE(name.length, 28)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + name.length, 12)
  end.writeUInt32LE(local.length + name.length + compressed.length, 16)
  return Buffer.concat([local, name, compressed, central, name, end])
}

test('ZIP 正文可解析，超限声明、损坏数据和虚报大小被拒绝', () => {
  const markdown = exported('zip 正文')
  assert.equal(readExportBuffer('chat.zip', zip(markdown)).markdown, markdown)
  assert.throws(() => readExportBuffer('chat.zip', zip(markdown, MAX_IMPORT_BYTES + 1)), /64 MB/)
  assert.throws(() => readExportBuffer('chat.zip', zip(markdown, 1)), /大小/)
  assert.throws(() => readExportBuffer('chat.zip', Buffer.from('broken')), /有效/)
})

test('同一分钟的不同附件和图片不会合并，重复导出仍可去重', () => {
  const markdown = exported('[[文件]] a.pdf\n\n测试者 2026年1月1日 10:00\n[[文件]] b.pdf\n\n测试者 2026年1月1日 10:00\n![](a.png)\n\n测试者 2026年1月1日 10:00\n![](b.png)')
  const { messages } = parseLarkChatMarkdown(markdown)
  assert.equal(messages.length, 4)
  assert.equal(dedupeMessages([...messages, ...messages]).length, 4)
})

test('导入较早的消息后，已有引用保持稳定；重启后也可读取', async (t) => {
  const f = fixture(t)
  const imports = join(f.directory, 'imports')
  mkdirSync(imports)
  writeFileSync(join(imports, 'recent.md'), exported('原始消息 unique', '11:00'))
  const env = { XUNJI_CHAT_IMPORT_DIR: imports }
  const call = f.mcp('chat-import-mcp.mjs', env)
  const [hit] = await call('chat_import_search', { query: 'unique' })
  writeFileSync(join(imports, 'older.md'), exported('更早的消息', '09:00'))
  const context = await call('chat_import_read', { id: hit.id })
  assert.equal(context.messages.find((message) => message.current).content, '原始消息 unique')
  const restarted = f.mcp('chat-import-mcp.mjs', env)
  assert.equal((await restarted('chat_import_read', { id: hit.id })).messages.find((message) => message.current).content, '原始消息 unique')
})

test('历史会话追加并刷新后，旧引用仍对应旧消息', async (t) => {
  const f = fixture(t)
  const sessions = join(f.directory, '.codex', 'sessions')
  mkdirSync(sessions, { recursive: true })
  const file = join(sessions, 'demo.jsonl')
  const event = (text) => JSON.stringify({ type: 'event_msg', timestamp: '2026-01-01T00:00:00Z', payload: { type: 'user_message', message: text } })
  writeFileSync(file, `${event('原始问题 unique')}\n`)
  const env = { USERPROFILE: f.directory, HOME: f.directory, XUNJI_CONVERSATION_ARCHIVE: 'codex', XUNJI_CONVERSATION_ARCHIVE_INDEX_DIR: join(f.directory, 'index') }
  const call = f.mcp('conversation-archive-mcp.mjs', env)
  const [hit] = await call('conversation_archive_search', { query: 'unique' })
  appendFileSync(file, `${event('新增问题')}\n`)
  await delay(3100)
  assert.equal((await call('conversation_archive_read', { id: hit.id })).content, '原始问题 unique')
  assert.equal((await call('conversation_archive_list')).records, 2)
  const restarted = f.mcp('conversation-archive-mcp.mjs', env)
  assert.equal((await restarted('conversation_archive_read', { id: hit.id })).content, '原始问题 unique')
})

test('代码读取跟进文件修改和删除，索引保持只读边界', async (t) => {
  const f = fixture(t)
  const repo = join(f.directory, 'repo')
  mkdirSync(repo)
  const file = join(repo, 'demo.ts')
  writeFileSync(file, 'export const value = "old"')
  writeFileSync(join(repo, '.env'), 'DEMO=must-not-index')
  const call = f.mcp('codebase-mcp.mjs', { XUNJI_CODEBASE_PATHS: repo, XUNJI_CODEBASE_INDEX_DIR: join(f.directory, 'index') })
  const [hit] = await call('codebase_search', { query: 'value' })
  assert.equal((await call('codebase_list'))[0].files, 1)
  writeFileSync(file, 'export const value = "updated"')
  assert.match((await call('codebase_read_file', hit)).content, /updated/)
  rmSync(file)
  await assert.rejects(call('codebase_read_file', hit), /未找到文件/)
})

test('敏感文件复查覆盖嵌套文件和空数据目录', (t) => {
  const { directory } = fixture(t)
  mkdirSync(join(directory, 'app', 'config'), { recursive: true })
  mkdirSync(join(directory, 'app', 'scripts', '.dsh'), { recursive: true })
  writeFileSync(join(directory, 'app', 'config', '.env'), 'DEMO=synthetic')
  assert.deepEqual(forbiddenArtifactPaths(directory, ['.env', '.dsh']).sort(), ['app/config/.env', 'app/scripts/.dsh'])
})

test('实际客户端事件只标注取得依据的来源，并识别飞书对话和本地知识', () => {
  let plugin
  let definition
  const noop = () => () => {}
  const sandbox = {
    window: { location: { port: '3000', protocol: 'http:', hostname: '127.0.0.1' }, __ModuleLoader__: { load: ({ factory }) => { plugin = factory(() => ({})) } } },
    document: { getElementById: () => ({} ) },
  }
  runInNewContext(readFileSync('plugins/xunji-workbench/lib/client.js', 'utf8'), sandbox)
  plugin.apply({
    effect: (effect) => effect(),
    uiConversation: { events: { register: (value) => { definition = value; return () => {} } } },
    sidebarRightTabs: { register: noop },
    slots: { inject: (_, register) => register(), register: noop },
  })
  let state = definition.start({}, { event: { type: 'turn/start', data: { turn: 1 } } })
  const invoke = (name, content, isError = false) => {
    state = definition.update({ state }, { event: { type: 'tool/call', data: { turn: 1, name, callId: name } } })
    state = definition.update({ state }, { event: { type: 'tool/result', data: { message: { source: { callId: name }, content: [{ isError, content: [{ type: 'text', text: JSON.stringify(content) }] }] } } } })
  }
  invoke('codebase_search', [], true)
  assert.equal(state.sources.length, 0)
  invoke('chat_import_search', [{ conversation: '示例群', sender: '测试者', timestamp: '2026-01-01' }])
  invoke('knowledge_search', [{ text: '本地依据' }])
  assert.deepEqual(Array.from(state.sources), ['飞书对话', '本地知识'])
  assert.match(state.evidence[0].detail, /示例群.*测试者/)
})
