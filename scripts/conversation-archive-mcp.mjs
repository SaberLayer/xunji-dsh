import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { matchedPositions, searchTokens } from './search-utils.mjs'
import { createHash } from 'node:crypto'

const enabledSources = new Set((process.env.XUNJI_CONVERSATION_ARCHIVE ?? '').split(',').map((value) => value.trim().toLocaleLowerCase()).filter(Boolean))
const userHome = process.env.USERPROFILE || process.env.HOME || ''
const indexDir = process.env.XUNJI_CONVERSATION_ARCHIVE_INDEX_DIR || join(process.cwd(), '.dsh', 'conversation-archive-index')
const maxSessionBytes = 16 * 1024 * 1024
const maxRecordsPerFile = 600
const maxTextLength = 4200
/** 两次变更扫描之间的最小间隔，避免连续检索反复遍历会话目录。 */
const refreshIntervalMs = 3000

function clip(value, limit = maxTextLength) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function textFrom(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(textFrom).filter(Boolean).join('\n')
  if (!value || typeof value !== 'object') return ''
  if (typeof value.text === 'string') return value.text
  if (typeof value.content === 'string') return value.content
  return ''
}

function walk(directory, predicate, files = []) {
  if (!existsSync(directory)) return files
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) walk(path, predicate, files)
    else if (entry.isFile() && predicate(entry.name, path)) files.push(path)
  }
  return files
}

function cachePath(source) {
  return join(indexDir, `${source}.json`)
}

/**
 * 解析结果的内存缓存，按来源保存 path → 条目。
 *
 * 热更新会反复调用索引流程，而磁盘缓存最大的一份有数十 MB，
 * 每次从磁盘反序列化会让检索明显变慢，因此首次读入后常驻内存。
 */
const memoryCache = new Map()

function loadCache(source) {
  const cached = memoryCache.get(source)
  if (cached) return cached
  let entries = new Map()
  try {
    const cache = JSON.parse(readFileSync(cachePath(source), 'utf8'))
    if (cache.version !== 2) return entries
    entries = new Map((cache.files ?? []).map((file) => [file.path, file]))
  } catch { /* 首次运行或缓存损坏时重新解析 */ }
  memoryCache.set(source, entries)
  return entries
}

function saveCache(source, files) {
  memoryCache.set(source, new Map(files.map((file) => [file.path, file])))
  mkdirSync(indexDir, { recursive: true })
  const path = cachePath(source)
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify({ version: 2, source, updatedAt: new Date().toISOString(), files }), 'utf8')
  renameSync(temporary, path)
}

function makeDoc({ source, kind, path, session, timestamp, project, text }) {
  const content = clip(text)
  if (!content) return null
  return {
    // 引用不依赖倒序编号；追加消息或重新建索引不会改变已有引用。
    id: createHash('sha256').update(JSON.stringify([source, path, kind, session ?? null, timestamp ?? null, text])).digest('hex'),
    source,
    kind,
    path,
    session: session ?? null,
    timestamp: timestamp ?? null,
    project: project ?? null,
    content,
    truncated: String(text ?? '').replace(/\s+/g, ' ').trim().length > maxTextLength,
  }
}

function codexSessionDocs(file) {
  const docs = []
  let session = basename(file, '.jsonl')
  let project = null
  const rows = readFileSync(file, 'utf8').split(/\r?\n/)
  for (const row of rows) {
    try {
      const event = JSON.parse(row)
      if (event.type === 'session_meta') {
        session = event.payload?.id || session
        project = event.payload?.cwd || project
        break
      }
    } catch { /* 忽略损坏或未完成写入的 JSONL 行 */ }
  }
  for (const row of rows.reverse()) {
    if (docs.length >= maxRecordsPerFile || !row.trim()) continue
    try {
      const event = JSON.parse(row)
      const payload = event.payload ?? {}
      if (event.type === 'session_meta') continue
      const timestamp = event.timestamp || null
      const payloadType = payload.type
      if ((event.type === 'response_item' || event.type === 'event_msg') && (payloadType === 'message' || payloadType === 'user_message' || payloadType === 'agent_message')) {
        const role = payload.role || (payloadType === 'user_message' ? 'user' : payloadType === 'agent_message' ? 'assistant' : '')
        if (role !== 'user' && role !== 'assistant') continue
        const doc = makeDoc({ source: 'codex', kind: role === 'user' ? '用户想法' : '助手结论', path: file, session, timestamp, project, text: textFrom(payload.content) || textFrom(payload.message) })
        if (doc) docs.push(doc)
        continue
      }
      if (event.type === 'response_item' && (payloadType === 'function_call' || payloadType === 'custom_tool_call')) {
        const name = payload.name || payload.tool_name || payload.call_id || '工具'
        const doc = makeDoc({ source: 'codex', kind: '操作记录', path: file, session, timestamp, project, text: `执行工具：${name}` })
        if (doc) docs.push(doc)
        continue
      }
      if ((event.type === 'response_item' || event.type === 'event_msg') && (payloadType === 'patch_apply_end' || payloadType === 'task_complete')) {
        const doc = makeDoc({ source: 'codex', kind: '操作记录', path: file, session, timestamp, project, text: payloadType === 'patch_apply_end' ? '完成补丁更新' : '完成任务' })
        if (doc) docs.push(doc)
      }
    } catch { /* 忽略损坏或未完成写入的 JSONL 行 */ }
  }
  return docs
}

function claudeMemoryDocs(file) {
  const project = relative(join(userHome, '.claude', 'projects'), file).split(/[\\/]/)[0] || null
  const doc = makeDoc({ source: 'claude', kind: '项目记忆', path: file, project, text: readFileSync(file, 'utf8') })
  return doc ? [doc] : []
}

/**
 * 解析 Claude Code 的完整会话记录（`~/.claude/projects/<项目>/<会话>.jsonl`）。
 *
 * 与 Codex 会话一样从文件末尾开始，长会话超限时保留最近内容。
 * 只取用户消息、助手回复正文与工具调用名：思考块属于中间过程，
 * 工具结果体积占大头且多为文件内容，二者都不进索引。
 */
function claudeSessionDocs(file) {
  const docs = []
  const project = relative(join(userHome, '.claude', 'projects'), file).split(/[\\/]/)[0] || null
  const session = basename(file, '.jsonl')
  const rows = readFileSync(file, 'utf8').split(/\r?\n/)
  for (const row of rows.reverse()) {
    if (docs.length >= maxRecordsPerFile || !row.trim()) continue
    try {
      const entry = JSON.parse(row)
      if (entry.type !== 'user' && entry.type !== 'assistant') continue
      const content = entry.message?.content
      const common = { source: 'claude', path: file, session: entry.sessionId ?? session, timestamp: entry.timestamp, project: entry.cwd ?? project }

      if (entry.type === 'user') {
        // 用户消息多为字符串；数组形态里只有 text 属于用户自己说的话
        const text = typeof content === 'string'
          ? content
          : Array.isArray(content) ? content.filter((block) => block?.type === 'text').map((block) => block.text).join('\n') : ''
        const doc = makeDoc({ ...common, kind: '用户想法', text })
        if (doc) docs.push(doc)
        continue
      }

      if (!Array.isArray(content)) continue
      const replies = content.filter((block) => block?.type === 'text').map((block) => block.text).join('\n')
      if (replies.trim()) {
        const doc = makeDoc({ ...common, kind: '助手结论', text: replies })
        if (doc) docs.push(doc)
      }
      const tools = content.filter((block) => block?.type === 'tool_use').map((block) => block.name).filter(Boolean)
      if (tools.length) {
        const doc = makeDoc({ ...common, kind: '操作记录', text: `执行工具：${[...new Set(tools)].join('、')}` })
        if (doc) docs.push(doc)
      }
    } catch { /* 忽略损坏或未完成写入的 JSONL 行 */ }
  }
  return docs
}

function claudeHistoryDocs(file) {
  const docs = []
  const rows = readFileSync(file, 'utf8').split(/\r?\n/)
  for (const row of rows.reverse()) {
    if (docs.length >= maxRecordsPerFile || !row.trim()) continue
    try {
      const entry = JSON.parse(row)
      const doc = makeDoc({ source: 'claude', kind: '用户想法', path: file, session: entry.sessionId, timestamp: entry.timestamp, project: entry.project, text: entry.display })
      if (doc) docs.push(doc)
    } catch { /* 忽略损坏或未完成写入的 JSONL 行 */ }
  }
  return docs
}

function indexFiles(source, files, parse) {
  const previous = loadCache(source)
  const next = []
  let changed = files.length !== previous.size
  for (const file of files) {
    const stats = statSync(file)
    const cached = previous.get(file)
    if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
      next.push(cached)
      continue
    }
    changed = true
    try { next.push({ path: file, mtimeMs: stats.mtimeMs, size: stats.size, docs: parse(file) }) } catch { /* 单个历史文件失败不阻断其他资料 */ }
  }
  // 无变化时跳过写盘：热更新会频繁走到这里，最大的一份缓存有数十 MB
  if (changed) saveCache(source, next)
  return next.flatMap((entry) => entry.docs ?? [])
}

/** 按来源收集待索引文件；与解析分开，便于先用文件签名判断是否需要重建。 */
let skippedFiles = []
function collectFiles() {
  skippedFiles = []
  const includeSession = (name, path) => {
    if (!name.endsWith('.jsonl')) return false
    try {
      if (statSync(path).size <= maxSessionBytes) return true
      skippedFiles.push({ path, reason: '会话文件超过 16 MB，未索引' })
    } catch { skippedFiles.push({ path, reason: '会话文件不可读取' }) }
    return false
  }
  const groups = []
  if (enabledSources.has('codex')) {
    const root = join(userHome, '.codex')
    groups.push({
      source: 'codex',
      parse: codexSessionDocs,
      files: [join(root, 'sessions'), join(root, 'archived_sessions')]
        .flatMap((directory) => walk(directory, includeSession)),
    })
  }
  if (enabledSources.has('claude')) {
    const root = join(userHome, '.claude')
    const projects = join(root, 'projects')
    groups.push({
      source: 'claude-memory',
      parse: claudeMemoryDocs,
      files: walk(projects, (name, path) => name.endsWith('.md') && /[\\/]memory[\\/][^\\/]+\.md$/i.test(path)),
    })
    // 完整会话记录：项目目录下与 memory 同级的 <会话ID>.jsonl
    groups.push({
      source: 'claude-session',
      parse: claudeSessionDocs,
      files: walk(projects, includeSession),
    })
    const history = join(root, 'history.jsonl')
    if (existsSync(history)) groups.push({ source: 'claude-history', parse: claudeHistoryDocs, files: [history] })
  }
  return groups
}

/** 文件清单的指纹；路径、修改时间与大小任一变化都会触发重建。 */
function signatureOf(groups) {
  const parts = []
  for (const group of groups) {
    for (const file of group.files) {
      try {
        const stats = statSync(file)
        parts.push(`${file}:${stats.mtimeMs}:${stats.size}`)
      } catch { /* 扫描期间文件被删除，忽略 */ }
    }
  }
  return parts.join('\n')
}

let archives = []
let archiveSearchIndex = new Map()
let lastSignature = null
let lastCheckedAt = 0

function rebuild(groups) {
  archives = groups.flatMap((group) => indexFiles(group.source, group.files, group.parse))
  archiveSearchIndex = new Map(archives.map((doc) => [doc.id, {
    content: doc.content.toLocaleLowerCase(),
    haystack: `${doc.kind}\n${doc.project ?? ''}\n${doc.path}\n${doc.content}`.toLocaleLowerCase(),
  }]))
}

/**
 * 会话文件有新增或追加时重建索引，让刚结束的对话无需重启即可检索。
 *
 * 扫描本身要遍历数百个会话文件，因此按时间节流；缓存常驻内存，
 * 未变化时重建只是比对 stat，不会重新解析。
 */
function refreshIfChanged() {
  const now = Date.now()
  if (now - lastCheckedAt < refreshIntervalMs) return
  lastCheckedAt = now
  const groups = collectFiles()
  const signature = signatureOf(groups)
  if (signature === lastSignature) return
  rebuild(groups)
  lastSignature = signature
}

{
  const groups = collectFiles()
  lastSignature = signatureOf(groups)
  lastCheckedAt = Date.now()
  rebuild(groups)
}

function textResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

function search({ query, source, project, limit = 8 }) {
  refreshIfChanged()
  const queryTerms = searchTokens(query)
  if (!queryTerms.length) throw new Error('query 至少包含两个字符')
  const normalizedProject = String(project ?? '').toLocaleLowerCase()
  return archives.map((doc) => {
    if (source && doc.source !== source) return null
    if (normalizedProject && !`${doc.project ?? ''} ${doc.path}`.toLocaleLowerCase().includes(normalizedProject)) return null
    const indexed = archiveSearchIndex.get(doc.id)
    if (!indexed) return null
    const score = queryTerms.reduce((total, term) => total + (indexed.haystack.includes(term) ? (indexed.content.includes(term) ? 2 : 1) : 0), 0)
    if (!score) return null
    const first = matchedPositions(indexed.content, queryTerms).sort((a, b) => a - b)[0] ?? 0
    return { ...doc, score, excerpt: doc.content.slice(Math.max(0, first - 240), Math.max(0, first - 240) + 800), content: undefined }
  }).filter(Boolean)
    .sort((left, right) => right.score - left.score || String(right.timestamp).localeCompare(String(left.timestamp)))
    // 同一段内容常在多个会话文件里重复出现，去重后再截断，避免重复项挤占有限的结果位
    .filter(dedupeByContent())
    .slice(0, Math.max(1, Math.min(Number(limit) || 8, 20)))
}

/** 按发送人无关的内容指纹去重；保留排序最靠前的那条。 */
function dedupeByContent() {
  const seen = new Set()
  return (hit) => {
    const key = `${hit.source}\n${hit.kind}\n${hit.excerpt}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }
}

const tools = [
  { name: 'conversation_archive_list', description: '列出已启用的 Codex / Claude 本机历史归档及条目数量；只读，不访问凭据或日志。', inputSchema: { type: 'object', properties: {} } },
  { name: 'conversation_archive_search', description: '检索此前的用户想法、项目记忆、助手结论和操作记录。', inputSchema: { type: 'object', properties: { query: { type: 'string' }, source: { type: 'string', enum: ['codex', 'claude'] }, project: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['query'] } },
  { name: 'conversation_archive_read', description: '读取 conversation_archive_search 返回的单条归档内容。', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
]

function reply(message) { process.stdout.write(`${JSON.stringify(message)}\n`) }
function handle(message) {
  if (!Object.prototype.hasOwnProperty.call(message, 'id')) return
  try {
    let result
    if (message.method === 'initialize') result = { protocolVersion: message.params?.protocolVersion ?? '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'xunji-conversation-archive', version: '0.1.0' } }
    else if (message.method === 'tools/list') result = { tools }
    else if (message.method === 'tools/call') {
      const args = message.params?.arguments ?? {}
      if (message.params?.name === 'conversation_archive_list') {
        refreshIfChanged()
        const bySource = Object.fromEntries([...enabledSources].map((source) => [source, archives.filter((doc) => doc.source === source).length]))
        const limitedFiles = [...memoryCache.values()].flatMap((files) => [...files.values()]).filter((file) => file.docs.length >= maxRecordsPerFile).map((file) => file.path)
        result = textResult({ sources: [...enabledSources], records: archives.length, bySource, skippedFiles, limitedFiles, limits: { maxSessionBytes, maxRecordsPerFile, maxTextLength }, truncatedRecords: archives.filter((doc) => doc.truncated).length })
      }
      else if (message.params?.name === 'conversation_archive_search') result = textResult(search(args))
      else if (message.params?.name === 'conversation_archive_read') {
        refreshIfChanged()
        const doc = archives.find((entry) => entry.id === args.id)
        if (!doc) throw new Error('未找到归档条目；只能读取 search 返回的 id')
        result = textResult({ id: doc.id, source: doc.source, kind: doc.kind, timestamp: doc.timestamp, project: doc.project, session: doc.session, path: doc.path, content: doc.content, truncated: doc.truncated })
      } else throw new Error('未知历史归档工具')
    } else throw new Error('不支持的方法')
    reply({ jsonrpc: '2.0', id: message.id, result })
  } catch (error) { reply({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: error instanceof Error ? error.message : '历史归档工具失败' } }) }
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  const rows = buffer.split(/\r?\n/)
  buffer = rows.pop() ?? ''
  for (const row of rows) if (row.trim()) { try { handle(JSON.parse(row)) } catch { /* 忽略非法协议行 */ } }
})
