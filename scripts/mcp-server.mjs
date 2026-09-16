// 本机 MCP 服务的公共骨架：stdio 上按行分隔的 JSON-RPC，只处理 initialize、tools/list、tools/call。
// 三个本机资料源只用到这三个方法，自己实现几十行协议代码比引入 SDK 更可控，也不增加随包体积。

export function textResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

/**
 * 启动服务并开始读取 stdin。
 * @param {object} options
 * @param {string} options.name 服务名，出现在 initialize 应答里
 * @param {Array} options.tools tools/list 返回的工具定义
 * @param {(name: string, args: object) => unknown} options.call 执行工具；未知工具应抛错
 * @param {string} [options.failure] 非 Error 异常时的兜底文案
 */
export function serveMcp({ name, version = '0.1.0', tools, call, failure = '工具调用失败' }) {
  const reply = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)

  const handle = (message) => {
    // 通知没有 id，不需要应答
    if (!Object.prototype.hasOwnProperty.call(message, 'id')) return
    try {
      let result
      if (message.method === 'initialize') {
        result = { protocolVersion: message.params?.protocolVersion ?? '2025-03-26', capabilities: { tools: {} }, serverInfo: { name, version } }
      } else if (message.method === 'tools/list') {
        result = { tools }
      } else if (message.method === 'tools/call') {
        result = call(message.params?.name, message.params?.arguments ?? {})
      } else {
        throw new Error('不支持的方法')
      }
      reply({ jsonrpc: '2.0', id: message.id, result })
    } catch (error) {
      reply({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: error instanceof Error ? error.message : failure } })
    }
  }

  let buffer = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    buffer += chunk
    const rows = buffer.split(/\r?\n/)
    buffer = rows.pop() ?? ''
    for (const row of rows) {
      if (!row.trim()) continue
      try { handle(JSON.parse(row)) } catch { /* 忽略非法协议行 */ }
    }
  })
}
