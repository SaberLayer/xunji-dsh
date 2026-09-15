// 把 dist/latest.json 指向的最新产物目录编译成单个安装包 exe。需要本机安装 Inno Setup 6。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { rootDir } from './common.mjs'

const latestPath = join(rootDir, 'dist', 'latest.json')
if (!existsSync(latestPath)) throw new Error('尚未生成应用目录，请先运行 npm run package')
const { stageDir } = JSON.parse(readFileSync(latestPath, 'utf8'))
if (!existsSync(stageDir)) throw new Error(`产物目录已不存在：${stageDir}；请重新运行 npm run package`)

// winget 可能装到 Program Files，也可能装到用户目录（非管理员安装）
const candidates = [
  process.env.INNO_SETUP_ISCC,
  'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
  'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
  join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
].filter(Boolean)
const compiler = candidates.find((path) => existsSync(path))
if (!compiler) {
  throw new Error(`找不到 Inno Setup 编译器。请先安装：\n  winget install -e --id JRSoftware.InnoSetup\n查找路径：\n- ${candidates.join('\n- ')}`)
}

const version = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')).version
execFileSync(compiler, [
  join(rootDir, 'config', 'installer.iss'),
  `/DAppVersion=${version}`,
  `/DSourceDir=${stageDir}`,
  `/DOutputDir=${join(rootDir, 'dist')}`,
], { stdio: 'inherit' })

console.log(`\n安装包已生成：${join(rootDir, 'dist')}`)
