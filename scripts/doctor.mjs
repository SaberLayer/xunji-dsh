import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  assertSupportedNode,
  csvOption,
  featureRequirements,
  loadEnvFile,
  resolveHome,
  rootDir,
  validateFeatures,
  versions,
} from './common.mjs'

loadEnvFile()
const problems = []

try {
  assertSupportedNode()
} catch (error) {
  problems.push(error.message)
}

const dshManifest = join(rootDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
if (!existsSync(dshManifest)) {
  problems.push('依赖尚未安装：缺少 @deepseek-ai/dsh')
} else {
  const installed = JSON.parse(readFileSync(dshManifest, 'utf8')).version
  if (installed !== versions.dsh.version) problems.push(`DSH 版本漂移：期望 ${versions.dsh.version}，实际 ${installed}`)
}

const workbenchManifest = join(rootDir, 'plugins', 'xunji-workbench', 'package.json')
if (!existsSync(workbenchManifest)) {
  problems.push('缺少工作台插件')
} else {
  const workbench = JSON.parse(readFileSync(workbenchManifest, 'utf8'))
  if (workbench.version !== '0.1.0') problems.push(`Workbench 版本异常：${workbench.version ?? '未知'}`)
  const dshPackages = [
    '@deepseek-ai/dsh-api-remotes',
    '@deepseek-ai/dsh-client-ui-chat',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-sidebar-right',
    '@deepseek-ai/dsh-client-ui-slots',
  ]
  for (const name of dshPackages) {
    const actual = workbench.peerDependencies?.[name] ?? workbench.devDependencies?.[name]
    if (actual !== versions.dsh.version) problems.push(`Workbench ${name} 版本漂移：期望 ${versions.dsh.version}，实际 ${actual ?? '缺失'}`)
  }
}

const profileRoot = join(rootDir, 'profiles')
const basePatch = join(profileRoot, 'base.cordis.patch.yml')
const profileFiles = [
  basePatch,
  ...Object.values(featureRequirements).map(({ patch }) => join(profileRoot, 'mcp', patch)),
]
for (const path of profileFiles) {
  if (!existsSync(path)) problems.push(`缺少 Profile：${path}`)
  else {
    const text = readFileSync(path, 'utf8')
    if (/\b(?:mg_|sk-|pat-)[A-Za-z0-9_-]{12,}/.test(text)) problems.push(`疑似在配置中写入真实密钥：${path}`)
  }
}

if (existsSync(basePatch)) {
  const baseConfig = readFileSync(basePatch, 'utf8')
  if (!/id: agent-default-model\s+config:\s+provider: deepseek-official\s+model: deepseek-flash\b/m.test(baseConfig)) {
    problems.push('默认模型必须为支持图片输入的 deepseek-flash')
  }
}

const larkPatch = join(profileRoot, 'mcp', 'lark.cordis.patch.yml')
if (existsSync(larkPatch)) {
  const larkConfig = readFileSync(larkPatch, 'utf8')
  const readOnlyLarkTools = 'docx.v1.document.rawContent,docx.builtin.search,wiki.v2.space.getNode,wiki.v1.node.search'
  if (!larkConfig.includes(`- '${readOnlyLarkTools}'`) || larkConfig.includes('process.env.LARK_TOOLS')) {
    problems.push('飞书工具白名单必须固定为只读文档/知识库查询接口')
  }
}

const mastergoPatch = join(profileRoot, 'mcp', 'mastergo.cordis.patch.yml')
if (existsSync(mastergoPatch)) {
  const mastergoConfig = readFileSync(mastergoPatch, 'utf8')
  if (!mastergoConfig.includes('@mastergo/magic-mcp@0.2.8') || /@mastergo\/vibe-mcp/i.test(mastergoConfig)) {
    problems.push('MasterGo 必须使用只读 Magic MCP，不能接入具备画布写入能力的 Vibe MCP')
  }
}

// 0.1.5 起 minimal 预设把 persona 设为 complete，会屏蔽本程序的资料路由提示词和检索工具
const settingsPath = join(resolveHome(), 'settings.yaml')
if (existsSync(settingsPath) && /^agent-presets:\s*\r?\n\s+default:\s*minimal\b/m.test(readFileSync(settingsPath, 'utf8'))) {
  problems.push('稳定 Profile 默认预设为 minimal（极简模式），该预设会屏蔽本程序的资料路由与检索工具；请在设置中改为标准模式')
}

const features = csvOption(process.argv.slice(2), '--with')
problems.push(...validateFeatures(features))

if (problems.length) {
  console.error(`寻迹助手体检失败：\n- ${problems.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log(`寻迹助手体检通过：Node ${process.versions.node}，DSH ${versions.dsh.version}`)
}
