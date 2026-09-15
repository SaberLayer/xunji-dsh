import { createServer } from 'node:http'
import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, extname, isAbsolute, join, win32 } from 'node:path'
import { writeEnvValues } from './common.mjs'
import { MAX_IMPORT_BYTES, readExportBuffer } from './chat-import-files.mjs'
import { parseLarkChatMarkdown } from './lark-chat-parser.mjs'

export const CONFIG_PORT = 37651

export const CONFIG_VARIABLES = [
  'MG_MCP_TOKEN',
  'MASTERGO_API_BASE_URL',
  'LARK_APP_ID',
  'LARK_APP_SECRET',
  'CONFLUENCE_URL',
  'CONFLUENCE_USERNAME',
  'CONFLUENCE_API_TOKEN',
  'CONFLUENCE_SSL_VERIFY',
  'XUNJI_CODEBASE_PATHS',
  'XUNJI_CONVERSATION_ARCHIVE',
  'XUNJI_CHAT_IMPORT',
]

const allowedVariables = new Set(CONFIG_VARIABLES)

// 非密钥、取值枚举的开关项可以回显实际值，让页面直接选中当前状态；其余变量只返回是否已配置。
const publicVariables = new Set(['XUNJI_CHAT_IMPORT'])

function configuredStatus() {
  return Object.fromEntries(CONFIG_VARIABLES.map((key) => [key, Boolean(process.env[key]?.trim())]))
}

function publicValues() {
  return Object.fromEntries([...publicVariables].map((key) => [key, process.env[key]?.trim() ?? '']))
}

function send(response, status, body, origin) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-file-name',
    Vary: 'Origin',
  })
  response.end(JSON.stringify(body))
}

export function validValue(key, value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x1f]/.test(value)) return false
  if (key === 'MASTERGO_API_BASE_URL' || key === 'CONFLUENCE_URL') return value === '' || /^https?:\/\//i.test(value)
  if (key === 'XUNJI_CONVERSATION_ARCHIVE') return value === '' || value.split(',').map((item) => item.trim().toLocaleLowerCase()).every((item) => item === 'codex' || item === 'claude')
  if (key === 'XUNJI_CHAT_IMPORT') return value === '' || value === 'on' || value === 'off'
  if (key === 'CONFLUENCE_SSL_VERIFY') return value === '' || value === 'true' || value === 'false'
  if (key === 'XUNJI_CODEBASE_PATHS') {
    if (value === '') return true
    const paths = value.split(';').map((path) => path.trim()).filter(Boolean)
    return paths.length > 0 && paths.every((path) => isAbsolute(path) || win32.isAbsolute(path))
  }
  return true
}

const importExtensions = new Set(['.zip', '.md', '.markdown', '.txt'])
const maxImportBytes = MAX_IMPORT_BYTES

/** 只接受文件名本身，拒绝任何路径分隔与父目录引用。 */
export function safeImportName(name) {
  const value = String(name ?? '').trim()
  if (!value || value.length > 200) return null
  if (/[<>:"|?*\x00-\x1f]/.test(value) || /[. ]$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(value)) return null
  if (value !== basename(value) || value.includes('/') || value.includes('\\') || value.startsWith('.')) return null
  if (!importExtensions.has(extname(value).toLocaleLowerCase())) return null
  return value
}

function listImports(directory) {
  let indexed = []
  try { indexed = JSON.parse(readFileSync(join(directory, 'index-status.json'), 'utf8')).files ?? [] } catch { /* 尚未索引 */ }
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name !== 'index.json' && importExtensions.has(extname(entry.name).toLocaleLowerCase()))
      .map((entry) => {
        const stats = statSync(join(directory, entry.name))
        const record = indexed.find((item) => item.file === entry.name && item.size === stats.size && item.mtimeMs === stats.mtimeMs)
        return { name: entry.name, size: stats.size, updatedAt: new Date(stats.mtimeMs).toISOString(), status: record ? (record.error ? 'failed' : 'indexed') : 'pending', error: record?.error }
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  } catch { return [] }
}

function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('文件过大'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.once('end', () => resolve(Buffer.concat(chunks)))
    request.once('error', reject)
  })
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > 16 * 1024) {
        reject(new Error('请求体过大'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.once('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(new Error('请求格式无效')) }
    })
    request.once('error', reject)
  })
}

export function startConfigServer({ port = CONFIG_PORT, allowedOrigins = [], envPath, importDir } = {}) {
  const origins = new Set(allowedOrigins)
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin
    if (!origin || !origins.has(origin)) {
      response.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify({ ok: false, error: '仅允许当前本机 DSH 页面访问配置服务。' }))
      return
    }
    if (request.method === 'OPTIONS') return send(response, 204, {}, origin)
    if (request.url === '/v1/config/status' && request.method === 'GET') return send(response, 200, { ok: true, configured: configuredStatus(), values: publicValues() }, origin)

    // 对话导入文件：列出、写入、删除，均限定在导入目录内
    if (request.url?.startsWith('/v1/config/imports') && importDir) {
      try {
        if (request.url === '/v1/config/imports' && request.method === 'GET') {
          return send(response, 200, { ok: true, files: listImports(importDir) }, origin)
        }
        if (request.url === '/v1/config/imports' && request.method === 'POST') {
          const name = safeImportName(request.headers['x-file-name'] ? decodeURIComponent(String(request.headers['x-file-name'])) : '')
          if (!name) throw new Error('文件名无效；只接受 .zip、.md 或 .txt 导出文件。')
          const body = await readBody(request, maxImportBytes)
          if (!body.length) throw new Error('文件内容为空。')
          const parsed = readExportBuffer(name, body)
          if (!parsed || !parseLarkChatMarkdown(parsed.markdown).messages.length) throw new Error('没有解析到消息；请上传飞书消息导出文档的 Markdown 或 zip。')
          mkdirSync(importDir, { recursive: true })
          const target = join(importDir, name)
          const temporary = `${target}.${process.pid}.${Date.now()}.part`
          writeFileSync(temporary, body)
          renameSync(temporary, target)
          return send(response, 200, { ok: true, files: listImports(importDir) }, origin)
        }
        if (request.url === '/v1/config/imports' && request.method === 'DELETE') {
          const body = await readJson(request)
          const name = safeImportName(body?.name)
          if (!name) throw new Error('文件名无效。')
          unlinkSync(join(importDir, name))
          return send(response, 200, { ok: true, files: listImports(importDir) }, origin)
        }
      } catch (error) {
        return send(response, 400, { ok: false, error: error instanceof Error ? error.message : '导入操作失败。' }, origin)
      }
    }
    if (request.url !== '/v1/config' || request.method !== 'POST') return send(response, 404, { ok: false, error: '未找到配置接口。' }, origin)
    try {
      const body = await readJson(request)
      const values = body?.values
      if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('配置内容无效。')
      const entries = Object.entries(values)
      if (!entries.length) throw new Error('请至少填写一个配置项。')
      const invalid = entries.find(([key, value]) => !allowedVariables.has(key) || !validValue(key, value))
      if (invalid?.[0] === 'XUNJI_CODEBASE_PATHS') throw new Error('代码库路径必须是绝对路径；多个项目请用英文分号分隔，末尾不要加分号。')
      if (invalid) throw new Error('包含不允许或格式不正确的配置项。')
      writeEnvValues(Object.fromEntries(entries), envPath)
      for (const [key, value] of entries) process.env[key] = value
      return send(response, 200, { ok: true, configured: configuredStatus(), values: publicValues() }, origin)
    } catch (error) {
      return send(response, 400, { ok: false, error: error instanceof Error ? error.message : '保存失败。' }, origin)
    }
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve({
      port: server.address().port,
      close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
    }))
  })
}
