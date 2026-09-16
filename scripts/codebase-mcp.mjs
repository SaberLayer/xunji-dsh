import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { matchedPositions, searchTokens } from './search-utils.mjs'
import { serveMcp, textResult } from './mcp-server.mjs'

const roots = (process.env.XUNJI_CODEBASE_PATHS ?? '').split(';').map((value) => value.trim()).filter(Boolean)
const indexDir = process.env.XUNJI_CODEBASE_INDEX_DIR || join(process.cwd(), '.dsh', 'codebase-index')
const ignoredDirectories = new Set(['.git', '.hg', '.svn', '.history', '.dsh', '.dsh-next', 'node_modules', 'dist', 'build', 'coverage', 'output', '.next', '.nuxt', '.cache', 'vendor', 'target'])
const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.json', '.css', '.scss', '.less', '.html', '.md', '.py', '.java', '.go', '.rs', '.cs', '.php', '.rb', '.sql', '.yml', '.yaml', '.xml', '.sh'])
const sensitiveFileNames = new Set(['credentials.json', 'credential.json', 'service-account.json', 'serviceaccount.json', 'secrets.json', 'secret.json', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519'])
const sensitiveExtensions = new Set(['.pem', '.key', '.p12', '.pfx', '.jks', '.kdbx'])
const maxFileBytes = 1024 * 1024
const maxFilesPerRoot = 20000
const memoryCache = new Map()

function isSensitiveFile(name) {
  const normalized = name.toLocaleLowerCase()
  return normalized.startsWith('.env')
    || sensitiveFileNames.has(normalized)
    || normalized.startsWith('service-account-') && normalized.endsWith('.json')
    || normalized.startsWith('secret-') && normalized.endsWith('.json')
    || sensitiveExtensions.has(extname(normalized))
}

function cachePath(root) {
  const safe = Buffer.from(root).toString('base64url')
  return join(indexDir, `${safe}.json`)
}

function loadCache(root) {
  if (memoryCache.has(root)) return memoryCache.get(root)
  try {
    const cache = JSON.parse(readFileSync(cachePath(root), 'utf8'))
    return new Map((cache.docs ?? []).map((doc) => [doc.path, doc]))
  } catch { return new Map() }
}

function saveCache(root, docs) {
  mkdirSync(indexDir, { recursive: true })
  const path = cachePath(root)
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify({ version: 1, root, updatedAt: new Date().toISOString(), docs }), 'utf8')
  renameSync(temporary, path)
}

function collect(root, directory = root, files = []) {
  if (files.length >= maxFilesPerRoot) return files
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) collect(root, join(directory, entry.name), files)
      if (files.length >= maxFilesPerRoot) break
      continue
    }
    if (!entry.isFile() || isSensitiveFile(entry.name) || !allowedExtensions.has(extname(entry.name).toLocaleLowerCase())) continue
    const absolute = join(directory, entry.name)
    const stats = statSync(absolute)
    if (stats.size <= maxFileBytes) files.push({ absolute, path: relative(root, absolute).replaceAll('\\', '/'), mtimeMs: stats.mtimeMs, size: stats.size })
    if (files.length >= maxFilesPerRoot) break
  }
  return files
}

function indexRoot(root) {
  const absoluteRoot = resolve(root)
  if (!isAbsolute(root) || !existsSync(absoluteRoot) || !statSync(absoluteRoot).isDirectory()) return { root, error: '目录不存在或不是绝对路径', docs: [] }
  const previous = loadCache(absoluteRoot)
  const files = collect(absoluteRoot)
  let changed = files.length !== previous.size
  const docs = files.map((file) => {
    const cached = previous.get(file.path)
    if (cached && cached.mtimeMs === file.mtimeMs && cached.size === file.size) return cached
    changed = true
    const content = readFileSync(file.absolute, 'utf8')
    return { ...file, content }
  })
  const existing = codebases.find((base) => base.root === absoluteRoot && !base.error)
  if (!changed && existing) return existing
  memoryCache.set(absoluteRoot, new Map(docs.map((doc) => [doc.path, doc])))
  if (changed) saveCache(absoluteRoot, docs)
  return {
    root: absoluteRoot,
    name: basename(absoluteRoot),
    docs: docs.map((doc) => ({ ...doc, pathText: doc.path.toLocaleLowerCase(), searchText: `${doc.path}\n${doc.content}`.toLocaleLowerCase() })),
  }
}

let codebases = []
let lastCheckedAt = 0
function refreshIfChanged() {
  if (Date.now() - lastCheckedAt < 3000) return
  codebases = roots.map((root) => {
    try { return indexRoot(root) } catch (error) { return { root, docs: [], error: `索引失败：${error.message}` } }
  })
  lastCheckedAt = Date.now()
}
refreshIfChanged()

function search({ query, codebase, limit = 8 }) {
  const queryTerms = searchTokens(query)
  if (!queryTerms.length) throw new Error('query 至少包含两个字符')
  const matches = []
  for (const base of codebases) {
    if (base.error || (codebase && base.name !== codebase && base.root !== codebase)) continue
    for (const doc of base.docs) {
      const score = queryTerms.reduce((total, term) => total + (doc.searchText.includes(term) ? (doc.pathText.includes(term) ? 4 : 1) : 0), 0)
      if (!score) continue
      const first = matchedPositions(doc.content.toLocaleLowerCase(), queryTerms).sort((a, b) => a - b)[0] ?? 0
      const start = Math.max(0, first - 220)
      matches.push({ codebase: base.name, path: doc.path, score, excerpt: doc.content.slice(start, start + 700) })
    }
  }
  return matches.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path)).slice(0, Math.max(1, Math.min(Number(limit) || 8, 20)))
}

function readCode({ codebase, path, start_line = 1, end_line = 240 }) {
  const base = codebases.find((item) => !item.error && (item.name === codebase || item.root === codebase))
  if (!base) throw new Error('未找到代码库，请先用 codebase_list 查看可用代码库')
  const doc = base.docs.find((item) => item.path === path)
  if (!doc) throw new Error('未找到文件；只能读取 codebase_search 返回的相对路径')
  // 读取前只核对这一个文件，不做全量扫描：被删除时报错，被修改时以磁盘内容为准
  let content = doc.content
  try {
    const stats = statSync(join(base.root, doc.path))
    if (stats.mtimeMs !== doc.mtimeMs || stats.size !== doc.size) content = readFileSync(join(base.root, doc.path), 'utf8')
  } catch {
    throw new Error('未找到文件；只能读取 codebase_search 返回的相对路径')
  }
  const lines = content.split(/\r?\n/)
  const first = Math.max(1, Number(start_line) || 1)
  const last = Math.min(lines.length, Math.max(first, Number(end_line) || 240), first + 399)
  return { codebase: base.name, path, start_line: first, end_line: last, content: lines.slice(first - 1, last).join('\n') }
}

const tools = [
  { name: 'codebase_list', description: '列出本机已索引的只读代码库及文件数。', inputSchema: { type: 'object', properties: {} } },
  { name: 'codebase_search', description: '在已登记代码库中检索代码、配置和文档；返回相对路径与片段。', inputSchema: { type: 'object', properties: { query: { type: 'string' }, codebase: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['query'] } },
  { name: 'codebase_read_file', description: '读取 codebase_search 命中的文件片段。', inputSchema: { type: 'object', properties: { codebase: { type: 'string' }, path: { type: 'string' }, start_line: { type: 'integer', minimum: 1 }, end_line: { type: 'integer', minimum: 1, maximum: 400 } }, required: ['codebase', 'path'] } },
]

serveMcp({
  name: 'xunji-codebase',
  tools,
  failure: '代码库工具失败',
  call(name, args) {
    refreshIfChanged()
    if (name === 'codebase_list') return textResult(codebases.map((base) => base.error ? { root: base.root, error: base.error } : { name: base.name, root: base.root, files: base.docs.length, limitReached: base.docs.length >= maxFilesPerRoot }))
    if (name === 'codebase_search') return textResult(search(args))
    if (name === 'codebase_read_file') return textResult(readCode(args))
    throw new Error('未知代码库工具')
  },
})
