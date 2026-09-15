import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'

export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const versions = JSON.parse(readFileSync(join(rootDir, 'config', 'versions.json'), 'utf8'))

/**
 * 用户数据目录名。
 *
 * 改名会让已安装用户的数据"消失"（实际是换了目录），因此它与界面显示名解耦，
 * 单独在这里定义；确需变更时要同时提供迁移，不能只改字符串。
 */
const DATA_DIR_NAME = '寻迹助手'

/**
 * 用户数据根目录：凭据、会话、索引与导入文件的存放处。
 *
 * 安装版把程序目录当作可整体替换的产物，用户数据必须留在程序目录之外，
 * 否则升级覆盖就会连配置一起清掉。开发仓库里保持原有的项目内 `.dsh`，
 * 这样日常开发和既有数据不受影响。
 */
export function resolveDataDir() {
  if (process.env.XUNJI_DATA_DIR) {
    return isAbsolute(process.env.XUNJI_DATA_DIR)
      ? process.env.XUNJI_DATA_DIR
      : resolve(rootDir, process.env.XUNJI_DATA_DIR)
  }
  // 安装版由打包步骤写入该标记；开发仓库没有此文件，继续使用项目目录
  if (!existsSync(join(rootDir, 'packaged.json'))) return rootDir
  const base = process.env.LOCALAPPDATA || process.env.APPDATA || process.env.USERPROFILE || rootDir
  return join(base, DATA_DIR_NAME)
}

export const dataDir = resolveDataDir()

/** 用户 `.env` 的位置；安装版位于用户数据目录，开发仓库仍在项目根目录。 */
export function resolveEnvPath() {
  return join(dataDir, '.env')
}

export function parseVersion(value) {
  const match = String(value).match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return match.slice(1).map(Number)
}

export function compareVersion(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) throw new Error(`无法比较版本：${left} / ${right}`)
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1
  }
  return 0
}

export function assertSupportedNode() {
  const minimum = versions.node.replace(/^>=/, '')
  if (compareVersion(process.versions.node, minimum) < 0) {
    throw new Error(`Node.js ${process.versions.node} 过低，需要 ${versions.node}`)
  }
}

export function loadEnvFile(path = resolveEnvPath()) {
  if (!existsSync(path)) return
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) {
      // 页面保存使用 JSON 字符串；兼容手写的带引号 Windows 路径。
      try {
        const decoded = JSON.parse(value)
        value = /[\x00-\x1f]/.test(decoded) ? value.slice(1, -1) : decoded
      } catch { value = value.slice(1, -1) }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function encodeEnvValue(value) {
  if (/[\x00-\x1f]/.test(value)) throw new Error('环境变量不能包含换行符或控制字符')
  return /[\s#'"\\]/.test(value) ? JSON.stringify(value) : value
}

export function updateEnvText(current, values) {
  const pending = new Map(Object.entries(values))
  const rows = current ? current.split(/\r?\n/) : []
  const next = rows.map((row) => {
    const match = row.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/)
    if (!match || !pending.has(match[1])) return row
    const value = pending.get(match[1])
    pending.delete(match[1])
    return `${match[1]}=${encodeEnvValue(value)}`
  })
  for (const [key, value] of pending) next.push(`${key}=${encodeEnvValue(value)}`)
  return `${next.join('\n').replace(/\n+$/, '')}\n`
}

export function writeEnvValues(values, path = resolveEnvPath()) {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const next = updateEnvText(current, values)
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temporary, next, { encoding: 'utf8', mode: 0o600 })
  renameSync(temporary, path)
}

export function resolveHome(staging = false) {
  if (process.env.XUNJI_DSH_HOME) {
    return isAbsolute(process.env.XUNJI_DSH_HOME)
      ? process.env.XUNJI_DSH_HOME
      : resolve(rootDir, process.env.XUNJI_DSH_HOME)
  }
  return join(dataDir, staging ? '.dsh-next' : '.dsh')
}

export function commandExists(command) {
  // 当前进程就是 node；安装版用的是随包的运行时，不在 PATH 上，不能靠 where 去找
  if (command === 'node') return true
  const finder = process.platform === 'win32' ? 'where.exe' : 'which'
  return spawnSync(finder, [command], { stdio: 'ignore' }).status === 0
}

export function addUserToolPaths(environment = process.env) {
  if (process.platform !== 'win32') return
  const userProfile = environment.USERPROFILE
  if (!userProfile) return
  const localAppData = environment.LOCALAPPDATA || join(userProfile, 'AppData', 'Local')
  const directories = [
    join(userProfile, '.local', 'bin'),
    join(localAppData, 'Microsoft', 'WinGet', 'Packages', 'astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe'),
  ]
  const entries = (environment.PATH ?? '').split(';').filter(Boolean)
  const missing = directories.filter((directory) => !entries.some((entry) => entry.toLocaleLowerCase() === directory.toLocaleLowerCase()))
  if (missing.length) environment.PATH = `${missing.join(';')};${environment.PATH ?? ''}`
}

export function readOption(args, name, fallback) {
  const index = args.indexOf(name)
  if (index < 0) return fallback
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} 缺少值`)
  return value
}

export function csvOption(args, name) {
  const value = readOption(args, name, '')
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

export function mergeAllowBuilds(yaml, keys) {
  const missing = keys.filter((key) => !yaml.includes(`'${key}': true`))
  if (!missing.length) return yaml
  const rows = missing.map((key) => `  '${key}': true`).join('\n')
  if (/^allowBuilds:\s*$/m.test(yaml)) {
    return yaml.replace(/^allowBuilds:\s*$/m, (line) => `${line}\n${rows}`)
  }
  return `${yaml.trimEnd()}\n\nallowBuilds:\n${rows}\n`
}

export function ensureProfileBuilds(keys, staging = false) {
  if (!keys.length) return
  const path = join(resolveHome(staging), 'profiles', 'web', 'pnpm-workspace.yaml')
  if (!existsSync(path)) throw new Error(`Profile 尚未初始化：${path}`)
  const current = readFileSync(path, 'utf8')
  const next = mergeAllowBuilds(current, keys)
  if (next !== current) writeFileSync(path, next, 'utf8')
}

/** 确保 PATH 上有可执行的 pnpm；缺失时按平台生成最小垫片，指向随包的 pnpm 入口。 */
function ensurePnpmShim(binDir) {
  const entry = join(rootDir, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
  if (!existsSync(entry)) return
  mkdirSync(binDir, { recursive: true })
  if (process.platform === 'win32') {
    const shim = join(binDir, 'pnpm.cmd')
    if (!existsSync(shim)) writeFileSync(shim, `@echo off\r\n"${process.execPath}" "${entry}" %*\r\n`, 'utf8')
    return
  }
  const shim = join(binDir, 'pnpm')
  if (!existsSync(shim)) {
    writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${entry}" "$@"\n`, { encoding: 'utf8', mode: 0o755 })
  }
}

function resolveDshBin() {
  const packagePath = join(rootDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  if (!existsSync(packagePath)) throw new Error('尚未安装依赖，请先运行 npx -y pnpm@11.21.0 install')
  const manifest = JSON.parse(readFileSync(packagePath, 'utf8'))
  const relativeBin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.dsh
  if (!relativeBin) throw new Error('@deepseek-ai/dsh 未声明 dsh 可执行文件')
  return resolve(dirname(packagePath), relativeBin)
}

export async function runDsh(args, { staging = false } = {}) {
  assertSupportedNode()
  loadEnvFile()
  addUserToolPaths()
  const separator = process.platform === 'win32' ? ';' : ':'
  const localBin = join(rootDir, 'node_modules', '.bin')
  const nodeBin = dirname(process.execPath)
  const env = {
    ...process.env,
    DSH_HOME: resolveHome(staging),
    PATH: [nodeBin, localBin, process.env.PATH ?? ''].filter(Boolean).join(separator),
  }
  // 分发包里 pnpm 以依赖形式存在，hoisted 安装不生成 .bin 垫片；
  // DSH 调用 pnpm 安装 Profile 插件时需要它，这里补一个可执行入口。
  ensurePnpmShim(localBin)
  const child = spawn(process.execPath, [resolveDshBin(), ...args], {
    cwd: rootDir,
    env,
    stdio: 'inherit',
  })
  const code = await new Promise((resolveCode, reject) => {
    child.once('error', reject)
    child.once('exit', (exitCode, signal) => resolveCode(exitCode ?? (signal ? 1 : 0)))
  })
  if (code !== 0) throw new Error(`dsh 退出，状态码 ${code}`)
}

export const featureRequirements = {
  mastergo: {
    patch: 'mastergo.cordis.patch.yml',
    env: ['MG_MCP_TOKEN'],
    // 经本机只读代理拉起官方 MCP，两者都要能找到
    commands: ['node', 'npx'],
  },
  lark: {
    patch: 'lark.cordis.patch.yml',
    env: ['LARK_APP_ID', 'LARK_APP_SECRET'],
    commands: ['npx'],
  },
  'confluence-dc': {
    patch: 'confluence-dc.cordis.patch.yml',
    env: ['CONFLUENCE_URL', 'CONFLUENCE_USERNAME', 'CONFLUENCE_API_TOKEN'],
    commands: ['uvx'],
  },
  codebase: {
    patch: 'codebase.cordis.patch.yml',
    env: ['XUNJI_CODEBASE_PATHS'],
    commands: ['node'],
  },
  'conversation-archive': {
    patch: 'conversation-archive.cordis.patch.yml',
    env: ['XUNJI_CONVERSATION_ARCHIVE'],
    commands: ['node'],
  },
  'chat-import': {
    patch: 'chat-import.cordis.patch.yml',
    env: ['XUNJI_CHAT_IMPORT'],
    commands: ['node'],
  },
}

export function configuredFeatures(environment = process.env) {
  return Object.entries(featureRequirements)
    .filter(([name]) => name !== 'chat-import' || environment.XUNJI_CHAT_IMPORT?.trim() === 'on')
    .filter(([, requirement]) => requirement.env.every((key) => Boolean(environment[key]?.trim())))
    .map(([name]) => name)
}

export function validateFeatures(features) {
  const unknown = features.filter((name) => !featureRequirements[name])
  if (unknown.length) throw new Error(`未知能力：${unknown.join(', ')}`)
  const errors = []
  for (const name of features) {
    const requirement = featureRequirements[name]
    if (name === 'chat-import' && process.env.XUNJI_CHAT_IMPORT?.trim() !== 'on') errors.push('chat-import: 请先将 XUNJI_CHAT_IMPORT 设置为 on')
    for (const key of requirement.env) {
      if (!process.env[key]?.trim()) errors.push(`${name}: 缺少环境变量 ${key}`)
    }
    for (const command of requirement.commands) {
      if (!commandExists(command)) errors.push(`${name}: 找不到命令 ${command}`)
    }
  }
  return errors
}
