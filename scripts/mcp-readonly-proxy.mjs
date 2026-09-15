// 通用只读代理：以 MCP 服务的身份被 DSH 拉起，再把真正的上游 MCP 作为子进程启动，
// 只放行白名单里的工具。DSH 的 MCP 客户端不做工具过滤，第三方 MCP 又常常自带写操作，
// 这一层是"资料源只读"承诺的唯一保障。
//
// 用法：node scripts/mcp-readonly-proxy.mjs --allow 工具A,工具B -- <上游命令> [参数...]
//
// 规则：
//   tools/list 的应答只保留白名单工具，模型看不到其余工具；
//   tools/call 调用白名单之外的工具时直接回错误，不转发给上游；
//   其他消息原样双向转发。

import { spawn } from 'node:child_process'

const separator = process.argv.indexOf('--')
const options = separator < 0 ? process.argv.slice(2) : process.argv.slice(2, separator)
const upstream = separator < 0 ? [] : process.argv.slice(separator + 1)
const allowIndex = options.indexOf('--allow')
const allowed = new Set((allowIndex < 0 ? '' : options[allowIndex + 1] ?? '').split(',').map((name) => name.trim()).filter(Boolean))
if (!allowed.size || !upstream.length) {
  process.stderr.write('用法：mcp-readonly-proxy.mjs --allow 工具A,工具B -- <上游命令> [参数...]\n')
  process.exit(2)
}

/** Windows 上 npx、uvx 等是 .cmd 垫片，Node 不允许直接 spawn，统一交给 cmd.exe 解析。 */
function spawnUpstream([command, ...args]) {
  if (process.platform !== 'win32') return spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'] })
  const quote = (value) => (/[\s"]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value)
  return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${[command, ...args].map(quote).join(' ')}"`], {
    stdio: ['pipe', 'pipe', 'inherit'],
    windowsVerbatimArguments: true,
  })
}

const child = spawnUpstream(upstream)
child.once('error', (error) => {
  process.stderr.write(`无法启动上游 MCP：${error.message}\n`)
  process.exit(1)
})
child.once('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
process.stdin.once('end', () => child.kill())

/** 记录客户端发出的 tools/list 请求 id，应答回来时据此过滤。 */
const listRequests = new Set()

function reply(message) { process.stdout.write(`${JSON.stringify(message)}\n`) }

/** 按行切分 JSON-RPC 消息；非 JSON 的行（例如上游误打到 stdout 的日志）丢弃。 */
function lines(stream, handle) {
  let buffer = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buffer += chunk
    const rows = buffer.split(/\r?\n/)
    buffer = rows.pop() ?? ''
    for (const row of rows) {
      if (!row.trim()) continue
      let message
      try { message = JSON.parse(row) } catch { continue }
      handle(message, row)
    }
  })
}

// 客户端 → 上游
lines(process.stdin, (message, raw) => {
  if (message.method === 'tools/call' && message.params && !allowed.has(message.params.name)) {
    if (Object.prototype.hasOwnProperty.call(message, 'id')) {
      reply({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `工具 ${message.params.name} 不在本资料源的只读白名单内，已拒绝调用` } })
    }
    return
  }
  if (message.method === 'tools/list' && Object.prototype.hasOwnProperty.call(message, 'id')) listRequests.add(message.id)
  child.stdin.write(`${raw}\n`)
})

// 上游 → 客户端
lines(child.stdout, (message, raw) => {
  if (Object.prototype.hasOwnProperty.call(message, 'id') && listRequests.has(message.id) && !('method' in message)) {
    listRequests.delete(message.id)
    if (Array.isArray(message.result?.tools)) {
      reply({ ...message, result: { ...message.result, tools: message.result.tools.filter((tool) => allowed.has(tool.name)) } })
      return
    }
  }
  process.stdout.write(`${raw}\n`)
})
