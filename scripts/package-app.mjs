// 生成可分发的应用目录：只包含运行所需文件，绝不包含本机凭据、索引与会话数据。
//
// 产物结构（dist/build-<时间戳>/，最新一份记录在 dist/latest.json）：
//   寻迹助手.cmd    启动入口
//   packaged.json     安装版标记，使运行时把用户数据放到用户目录
//   runtime/node.exe  内置 Node（可选）
//   app/              代码 + 扁平化依赖
//
// 依赖必须重新以 hoisted 方式安装：开发目录的 node_modules 是 pnpm 符号链接，
// 指向本机绝对路径，直接拷贝到别的机器会全部失效。

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { rootDir, versions } from './common.mjs'
import { forbiddenArtifactPaths } from './artifact-audit.mjs'

const distDir = join(rootDir, 'dist')
// 每次打包写入独立目录：Windows 上资源管理器窗口或杀毒扫描会长时间占住旧目录，
// 复用同一路径会导致清理失败而中断打包。最新产物位置记录在 latest.json。
const stageDir = join(distDir, `build-${new Date().toISOString().replaceAll(/[:.TZ-]/g, '').slice(0, 14)}`)
const appDir = join(stageDir, 'app')
const runtimeDir = join(stageDir, 'runtime')

/** 随程序分发的文件；未列出的一律不进包。 */
const includedPaths = [
  'package.json',
  'config',
  'profiles',
  'scripts',
  'plugins/xunji-workbench/package.json',
  'plugins/xunji-workbench/cordis.patch.yml',
  'plugins/xunji-workbench/lib',
  'plugins/xunji-workbench/README.md',
]

/** 任何情况下都不得出现在产物中的名字，打包后会逐一复查。 */
const forbiddenNames = ['.env', '.dsh', '.dsh-next', '.credentials.yaml', 'imports', 'knowledge.sqlite', 'node_modules/.cache']

/** 产物中不允许出现的内容特征，避免把密钥写进随包文件。 */
const secretPatterns = [
  { name: 'DeepSeek/OpenAI 风格密钥', pattern: /\bsk-[A-Za-z0-9]{16,}/ },
  { name: 'MasterGo 令牌', pattern: /\bmg_[A-Za-z0-9_-]{16,}/ },
  { name: '飞书应用密钥', pattern: /\bcli_[a-z0-9]{12,}/ },
]

function log(message) { console.log(message) }

function copyInto(target) {
  for (const entry of includedPaths) {
    const source = join(rootDir, entry)
    if (!existsSync(source)) throw new Error(`缺少待打包内容：${entry}`)
    const destination = join(target, entry)
    mkdirSync(dirname(destination), { recursive: true })
    cpSync(source, destination, { recursive: true })
  }
}

/**
 * 以 hoisted 方式安装生产依赖，产出可跨机器拷贝的真实目录树。
 *
 * 安装必须在开发仓库之外进行：在仓库子目录里跑 pnpm 会命中根 `pnpm-workspace.yaml`，
 * 被当成工作区成员后不装依赖反而移除根依赖，曾因此清空过开发环境。
 */
function installPortableDependencies(target) {
  log('安装可移植依赖（hoisted，无符号链接）…')
  const buildDir = mkdtempSync(join(tmpdir(), 'workbench-pack-'))
  try {
    installInto(buildDir)
    log('复制依赖到产物…')
    cpSync(join(buildDir, 'node_modules'), join(target, 'node_modules'), { recursive: true })
    cpSync(join(buildDir, 'pnpm-lock.yaml'), join(target, 'pnpm-lock.yaml'))
  } finally {
    rmSync(buildDir, { recursive: true, force: true })
  }
  const installed = join(target, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  if (!existsSync(installed)) throw new Error('依赖安装失败：产物中没有 @deepseek-ai/dsh')
  pruneDependencies(join(target, 'node_modules'))
}

/**
 * 删掉运行时用不到的开发产物。文件数直接决定安装耗时（每个文件都要落盘并过杀毒扫描），
 * 这一步能去掉约四成文件。类型声明只在编译期使用，源码映射只在调试时使用。
 */
function pruneDependencies(modulesDir) {
  const droppable = /\.(map|d\.ts|d\.cts|d\.mts|md|markdown)$/i
  const droppableDirs = new Set(['test', 'tests', '__tests__', 'docs', 'example', 'examples', '.github'])
  let files = 0
  let bytes = 0
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (droppableDirs.has(entry.name.toLocaleLowerCase())) {
          bytes += directorySize(path)
          files += walkFiles(path).length
          rmSync(path, { recursive: true, force: true })
          continue
        }
        walk(path)
        continue
      }
      if (!entry.isFile() || !droppable.test(entry.name)) continue
      bytes += statSync(path).size
      files += 1
      rmSync(path, { force: true })
    }
  }
  walk(modulesDir)
  log(`裁剪开发产物：${files} 个文件，${(bytes / 1024 / 1024).toFixed(0)} MB`)
}

function installInto(target) {
  const manifest = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'))
  // 分发包不需要构建工具，只保留运行时真正加载的 DSH
  const distManifest = {
    name: manifest.name,
    version: manifest.version,
    private: true,
    type: manifest.type,
    engines: manifest.engines,
    // DSH 初始化 Profile 时会调用 pnpm 安装插件，必须随包分发，
    // 不能指望同事机器上装了 pnpm。
    // 与仓库根 importer 保持同一分类，直接复用已验证的完整依赖锁。
    devDependencies: {
      '@deepseek-ai/dsh': versions.dsh.version,
      pnpm: versions.packageManager.split('@')[1],
    },
  }
  writeFileSync(join(target, 'package.json'), `${JSON.stringify(distManifest, null, 2)}\n`, 'utf8')
  cpSync(join(rootDir, 'pnpm-lock.yaml'), join(target, 'pnpm-lock.yaml'))
  writeFileSync(join(target, '.npmrc'), 'node-linker=hoisted\nsymlink=false\n', 'utf8')
  writeFileSync(join(target, 'pnpm-workspace.yaml'), 'packages: []\n', 'utf8')
  // 直接用 node 跑项目内的 pnpm 入口：Windows 上 Node 24 不允许 spawn .cmd，
  // 用 shell 又要处理中文路径转义，这条路最稳。
  const pnpmEntry = join(rootDir, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
  if (!existsSync(pnpmEntry)) throw new Error('缺少 pnpm，请先运行依赖安装')
  execFileSync(process.execPath, [
    pnpmEntry, 'install',
    '--prod=false', '--frozen-lockfile', '--ignore-scripts', '--ignore-workspace',
    '--config.node-linker=hoisted',
  ], {
    cwd: target,
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' },
  })
}

function copyRuntime() {
  const nodeExecutable = process.execPath
  mkdirSync(runtimeDir, { recursive: true })
  cpSync(nodeExecutable, join(runtimeDir, basename(nodeExecutable)))
  log(`内置 Node 运行时：${process.version}`)
}

/** 编译并放入桌面外壳；它负责窗口、启动编排与子进程生命周期。 */
function buildShell(target) {
  const shellDir = join(rootDir, 'shell')
  const cargo = join(process.env.USERPROFILE ?? '', '.cargo', 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo')
  if (!existsSync(cargo)) throw new Error(`找不到 cargo：${cargo}\n请先安装 Rust：https://rustup.rs`)
  log('编译桌面外壳…')
  execFileSync(cargo, ['build', '--release', '--locked'], { cwd: shellDir, stdio: 'inherit' })
  const built = join(shellDir, 'target', 'release', 'workbench-shell.exe')
  if (!existsSync(built)) throw new Error('外壳编译产物缺失')
  cpSync(built, join(target, '寻迹助手.exe'))
  log(`桌面外壳：${(statSync(built).size / 1024 / 1024).toFixed(1)} MB`)
}

function walkFiles(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) walkFiles(path, files)
    else if (entry.isFile()) files.push(path)
  }
  return files
}

/** 打包后复查：既查禁止出现的路径，也扫描文本文件里的密钥特征。 */
function auditArtifact() {
  log('复查产物…')
  const problems = forbiddenArtifactPaths(stageDir, forbiddenNames).map((path) => `产物包含禁止内容：${path}`)
  const files = walkFiles(stageDir)
  for (const file of files) {
    const relativePath = relative(stageDir, file).replaceAll('\\', '/')
    if (relativePath.startsWith('app/node_modules/') || relativePath.startsWith('runtime/')) continue
    if (statSync(file).size > 2 * 1024 * 1024) continue
    let text
    try { text = readFileSync(file, 'utf8') } catch { continue }
    for (const { name, pattern } of secretPatterns) {
      if (pattern.test(text)) problems.push(`${relativePath} 疑似包含${name}`)
    }
  }
  if (problems.length) throw new Error(`打包复查失败：\n- ${problems.join('\n- ')}`)
  log(`复查通过：${files.length} 个文件，无凭据与本机数据`)
}

function directorySize(directory) {
  return walkFiles(directory).reduce((total, file) => total + statSync(file).size, 0)
}

/**
 * 新产物通过全部检查后再清理更早的构建，只保留上一个版本供回退。
 * 失败不阻断（可能被资源管理器或杀毒占用）。
 */
function pruneOldBuilds(keep) {
  for (const entry of readdirSync(distDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('build-')) continue
    const path = join(distDir, entry.name)
    if (keep.has(path)) continue
    try {
      rmSync(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 })
    } catch {
      log(`旧构建目录被占用，已跳过：${entry.name}`)
    }
  }
}

mkdirSync(appDir, { recursive: true })

log('复制程序文件…')
copyInto(appDir)
installPortableDependencies(appDir)
copyRuntime()

// 安装版标记：运行时据此把 .env 与 DSH 数据放到用户目录，升级覆盖程序不会丢配置
writeFileSync(join(stageDir, 'packaged.json'), `${JSON.stringify({
  name: '寻迹助手',
  dsh: versions.dsh.version,
  builtAt: new Date().toISOString(),
}, null, 2)}\n`, 'utf8')
buildShell(stageDir)
// 标记同样要能被 app/ 下的脚本看到
cpSync(join(stageDir, 'packaged.json'), join(appDir, 'packaged.json'))

auditArtifact()
// 供 package:installer 定位本次产物；先记下上一个成功产物，清理时保留它
const latestPath = join(distDir, 'latest.json')
let previousStage = null
try { previousStage = JSON.parse(readFileSync(latestPath, 'utf8')).stageDir ?? null } catch { /* 首次打包 */ }
writeFileSync(latestPath, `${JSON.stringify({ stageDir, builtAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
pruneOldBuilds(new Set([stageDir, previousStage].filter(Boolean)))
log(`\n完成：${stageDir}`)
log(`体积：${(directorySize(stageDir) / 1024 / 1024).toFixed(0)} MB（压缩后约三分之一）`)
log('下一步：npm run package:installer 生成安装包 exe')
