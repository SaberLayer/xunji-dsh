import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

// 一个假的上游 MCP：暴露读、写各一个工具，tools/call 原样回显工具名
const upstreamSource = `
let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  const rows = buffer.split(/\\r?\\n/)
  buffer = rows.pop() ?? ''
  for (const row of rows) {
    if (!row.trim()) continue
    const message = JSON.parse(row)
    if (!('id' in message)) continue
    let result
    if (message.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '0' } }
    else if (message.method === 'tools/list') result = { tools: [{ name: 'read_doc', inputSchema: { type: 'object' } }, { name: 'write_doc', inputSchema: { type: 'object' } }] }
    else if (message.method === 'tools/call') result = { content: [{ type: 'text', text: 'called ' + message.params.name }] }
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\\n')
  }
})
`

function startProxy(t, allow) {
  const directory = mkdtempSync(join(tmpdir(), 'xunji-proxy-'))
  const upstream = join(directory, 'upstream.mjs')
  writeFileSync(upstream, upstreamSource)
  const child = spawn(process.execPath, [resolve('scripts/mcp-readonly-proxy.mjs'), '--allow', allow, '--', process.execPath, upstream], { stdio: ['pipe', 'pipe', 'pipe'] })
  const exited = new Promise((done) => child.once('exit', done))
  t.after(async () => {
    child.stdin.end()
    await exited
    rmSync(directory, { recursive: true, force: true })
  })
  let sequence = 0
  const pending = new Map()
  createInterface({ input: child.stdout }).on('line', (line) => {
    const message = JSON.parse(line)
    const task = pending.get(message.id)
    if (!task) return
    pending.delete(message.id)
    task(message)
  })
  return (method, params = {}) => new Promise((done) => {
    const id = ++sequence
    pending.set(id, done)
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })
}

test('只读代理只暴露白名单工具，并拒绝白名单外的调用', async (t) => {
  const call = startProxy(t, 'read_doc')
  const init = await call('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } })
  assert.equal(init.result.serverInfo.name, 'fake')
  const list = await call('tools/list')
  assert.deepEqual(list.result.tools.map((tool) => tool.name), ['read_doc'])
  const allowed = await call('tools/call', { name: 'read_doc', arguments: {} })
  assert.equal(allowed.result.content[0].text, 'called read_doc')
  const denied = await call('tools/call', { name: 'write_doc', arguments: {} })
  assert.equal(denied.result, undefined)
  assert.match(denied.error.message, /白名单/)
})
