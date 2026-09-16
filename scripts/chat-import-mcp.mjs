import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { conversationNameFrom, dedupeMessages, messageFingerprint, parseLarkChatMarkdown } from './lark-chat-parser.mjs'
import { matchedPositions, searchTokens } from './search-utils.mjs'
import { MAX_IMPORT_BYTES, readExportBuffer } from './chat-import-files.mjs'
import { serveMcp, textResult } from './mcp-server.mjs'

const importDir = process.env.XUNJI_CHAT_IMPORT_DIR || join(process.cwd(), '.dsh', 'imports')
const indexPath = join(importDir, 'index.json')
const maxFileBytes = MAX_IMPORT_BYTES
const maxMessageLength = 4000

function readExport(path) {
  const extension = extname(path).toLocaleLowerCase()
  if (!['.zip', '.md', '.markdown', '.txt'].includes(extension)) return null
  return readExportBuffer(path, readFileSync(path))
}

/** 扫描导入目录，解析每个导出文件，按会话合并去重后落盘。 */
function buildIndex() {
  mkdirSync(importDir, { recursive: true })
  const conversations = new Map()
  const files = []
  for (const entry of readdirSync(importDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const path = join(importDir, entry.name)
    if (!['.zip', '.md', '.markdown', '.txt'].includes(extname(entry.name).toLowerCase())) continue
    const stats = statSync(path)
    const metadata = { file: entry.name, size: stats.size, mtimeMs: stats.mtimeMs }
    if (stats.size > maxFileBytes) { files.push({ ...metadata, error: '文件超过 64 MB，未索引' }); continue }
    let parsed
    try {
      parsed = readExport(path)
    } catch (error) {
      files.push({ ...metadata, error: error instanceof Error ? error.message : '解析失败' })
      continue
    }
    if (!parsed) continue
    const { title, messages } = parseLarkChatMarkdown(parsed.markdown)
    const name = conversationNameFrom(title, parsed.name.replace(/\.[^.]+$/, ''))
    if (!messages.length) {
      files.push({ ...metadata, error: '没有解析到消息；请确认是飞书「导出到文档」下载的 Markdown' })
      continue
    }
    const bucket = conversations.get(name) ?? []
    for (const message of messages) bucket.push({ ...message, file: entry.name })
    conversations.set(name, bucket)
    files.push({ ...metadata, conversation: name, messages: messages.length })
  }

  const records = []
  const summary = []
  for (const [conversation, all] of conversations) {
    const unique = dedupeMessages(all)
    for (const message of unique) {
      const parts = [message.text]
      if (message.images) parts.push(`（含 ${message.images} 张图片）`)
      if (message.files.length) parts.push(`（附件：${message.files.join('、')}）`)
      const content = parts.filter(Boolean).join(' ').slice(0, maxMessageLength)
      if (!content) continue
      records.push({
        id: createHash('sha256').update(`${conversation}\n${messageFingerprint(message)}`).digest('hex'),
        conversation,
        sender: message.sender,
        timestamp: message.timestamp,
        forwardedFrom: message.forwardedFrom,
        file: message.file,
        content,
      })
    }
    summary.push({
      conversation,
      messages: unique.length,
      from: unique[0]?.timestamp ?? null,
      to: unique[unique.length - 1]?.timestamp ?? null,
      senders: [...new Set(unique.map((message) => message.sender))],
    })
  }

  const index = { version: 2, updatedAt: new Date().toISOString(), files, conversations: summary, records }
  const temporary = `${indexPath}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(index), 'utf8')
  renameSync(temporary, indexPath)
  // 页面轮询只读取轻量状态，避免反复解析包含全部消息的索引。
  const statusPath = join(importDir, 'index-status.json')
  writeFileSync(`${statusPath}.${process.pid}.tmp`, JSON.stringify({ files }), 'utf8')
  renameSync(`${statusPath}.${process.pid}.tmp`, statusPath)
  return index
}

function loadIndex() {
  try {
    if (existsSync(indexPath)) {
      const cached = JSON.parse(readFileSync(indexPath, 'utf8'))
      if (cached.version === 2) return cached
    }
  } catch { /* 索引损坏时重建 */ }
  return buildIndex()
}

let index = loadIndex()
let searchIndex = buildSearchIndex(index)

function buildSearchIndex(current) {
  return new Map(current.records.map((record) => [record.id, {
    content: record.content.toLocaleLowerCase(),
    haystack: `${record.conversation}\n${record.sender}\n${record.forwardedFrom ?? ''}\n${record.content}`.toLocaleLowerCase(),
  }]))
}

/** 导入目录有增删或改动时重建索引，使新导入无需重启即可检索。 */
function refreshIfChanged() {
  let signature = ''
  try {
    for (const entry of readdirSync(importDir, { withFileTypes: true })) {
      if (!entry.isFile() || !['.zip', '.md', '.markdown', '.txt'].includes(extname(entry.name).toLowerCase())) continue
      const stats = statSync(join(importDir, entry.name))
      signature += `${entry.name}:${stats.mtimeMs}:${stats.size}\n`
    }
  } catch { return }
  if (signature === refreshIfChanged.signature) return
  index = buildIndex()
  searchIndex = buildSearchIndex(index)
  refreshIfChanged.signature = signature
}

function search({ query, conversation, sender, limit = 8 }) {
  refreshIfChanged()
  const queryTerms = searchTokens(query)
  if (!queryTerms.length) throw new Error('query 至少包含两个字符')
  const normalizedConversation = String(conversation ?? '').toLocaleLowerCase()
  const normalizedSender = String(sender ?? '').toLocaleLowerCase()
  return index.records.map((record) => {
    if (normalizedConversation && !record.conversation.toLocaleLowerCase().includes(normalizedConversation)) return null
    if (normalizedSender && !record.sender.toLocaleLowerCase().includes(normalizedSender)) return null
    const indexed = searchIndex.get(record.id)
    if (!indexed) return null
    const score = queryTerms.reduce((total, term) => total + (indexed.haystack.includes(term) ? (indexed.content.includes(term) ? 2 : 1) : 0), 0)
    if (!score) return null
    const first = matchedPositions(indexed.content, queryTerms).sort((a, b) => a - b)[0] ?? 0
    const start = Math.max(0, first - 160)
    return {
      id: record.id,
      conversation: record.conversation,
      sender: record.sender,
      timestamp: record.timestamp,
      forwardedFrom: record.forwardedFrom,
      score,
      excerpt: record.content.slice(start, start + 600),
    }
  }).filter(Boolean)
    .sort((left, right) => right.score - left.score || String(right.timestamp).localeCompare(String(left.timestamp)))
    .slice(0, Math.max(1, Math.min(Number(limit) || 8, 20)))
}

/** 读取命中消息及其前后若干条，还原上下文。 */
function readContext({ id, before = 3, after = 3 }) {
  refreshIfChanged()
  const position = index.records.findIndex((record) => record.id === id)
  if (position < 0) throw new Error('未找到消息；只能读取 chat_import_search 返回的 id')
  const target = index.records[position]
  const window = index.records
    .filter((record) => record.conversation === target.conversation)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
  const center = window.findIndex((record) => record.id === id)
  const first = Math.max(0, center - Math.max(0, Math.min(Number(before) || 0, 20)))
  const last = Math.min(window.length, center + Math.max(0, Math.min(Number(after) || 0, 20)) + 1)
  return {
    conversation: target.conversation,
    messages: window.slice(first, last).map((record) => ({
      sender: record.sender,
      timestamp: record.timestamp,
      forwardedFrom: record.forwardedFrom,
      content: record.content,
      current: record.id === id,
    })),
  }
}

const tools = [
  { name: 'chat_import_list', description: '列出已导入的飞书对话导出：会话名、消息数、时间范围与参与人。', inputSchema: { type: 'object', properties: {} } },
  { name: 'chat_import_search', description: '检索已导入的飞书对话内容；返回发送人、时间与片段。', inputSchema: { type: 'object', properties: { query: { type: 'string' }, conversation: { type: 'string' }, sender: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['query'] } },
  { name: 'chat_import_read', description: '读取 chat_import_search 命中消息及其前后上下文。', inputSchema: { type: 'object', properties: { id: { type: 'string' }, before: { type: 'integer', minimum: 0, maximum: 20 }, after: { type: 'integer', minimum: 0, maximum: 20 } }, required: ['id'] } },
]

serveMcp({
  name: 'xunji-chat-import',
  tools,
  failure: '对话导入工具失败',
  call(name, args) {
    if (name === 'chat_import_list') {
      refreshIfChanged()
      return textResult({ directory: importDir, conversations: index.conversations, files: index.files, updatedAt: index.updatedAt })
    }
    if (name === 'chat_import_search') return textResult(search(args))
    if (name === 'chat_import_read') return textResult(readContext(args))
    throw new Error('未知对话导入工具')
  },
})
