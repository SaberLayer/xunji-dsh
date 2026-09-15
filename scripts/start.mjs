import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { addUserToolPaths, configuredFeatures, csvOption, featureRequirements, loadEnvFile, readOption, resolveEnvPath, resolveHome, rootDir, runDsh, validateFeatures, versions } from './common.mjs'
import { startConfigServer } from './config-server.mjs'

loadEnvFile()
addUserToolPaths()
process.env.MASTERGO_API_BASE_URL ||= 'https://mastergo.com'
process.env.CONFLUENCE_SSL_VERIFY ||= 'true'

const args = process.argv.slice(2)
const staging = args.includes('--staging')
// 稳定 Profile 由 setup 写入版本与程序目录标记。DSH 升级会单向迁移会话数据，
// 而 Profile 内的插件是绝对路径链接，换安装位置同样会失效，两者都需重新 setup。
const versionMarker = join(resolveHome(staging), 'xunji-dsh-version')
if (!staging && existsSync(versionMarker)) {
  const [installedVersion, installedRoot] = readFileSync(versionMarker, 'utf8').split(/\r?\n/)
  if (installedVersion?.trim() !== versions.dsh.version) {
    throw new Error(`Profile 仍是 DSH ${installedVersion?.trim()}，当前固定 ${versions.dsh.version}；请先用 npm start -- --staging 验证，再运行 npm run setup 完成切换`)
  }
  // 旧标记没有第二行，视为同目录；安装版换目录后由启动器自动重建
  if (installedRoot && installedRoot.trim() && installedRoot.trim() !== rootDir) {
    throw new Error(`Profile 指向旧程序目录 ${installedRoot.trim()}，当前为 ${rootDir}；请重新运行 npm run setup`)
  }
}
process.env.XUNJI_CODEBASE_INDEX_DIR ||= join(resolveHome(staging), 'codebase-index')
process.env.XUNJI_CONVERSATION_ARCHIVE_INDEX_DIR ||= join(resolveHome(staging), 'conversation-archive-index')
process.env.XUNJI_CHAT_IMPORT_DIR ||= join(resolveHome(staging), 'imports')
const requestedFeatures = csvOption(args, '--with')
const features = requestedFeatures.length ? requestedFeatures : configuredFeatures()
const forwarded = []
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--staging') continue
  if (args[index] === '--with') {
    index += 1
    continue
  }
  forwarded.push(args[index])
}
const errors = validateFeatures(features)
if (errors.length) throw new Error(`配置不完整：\n- ${errors.join('\n- ')}`)
if (!requestedFeatures.length && features.length) console.log(`自动启用已配置资料源：${features.join(', ')}`)
const webPort = Number(readOption(forwarded, '--port', '3000'))
if (!Number.isInteger(webPort) || webPort < 1 || webPort > 65535) throw new Error('--port 必须是 1 到 65535 的整数')
if (webPort === 65535) throw new Error('--port 不能为 65535；本机配置服务会使用紧邻端口')
const configService = await startConfigServer({
  port: webPort + 1,
  allowedOrigins: [`http://127.0.0.1:${webPort}`, `http://localhost:${webPort}`],
  envPath: process.env.XUNJI_CONFIG_ENV_FILE || resolveEnvPath(),
  importDir: process.env.XUNJI_CHAT_IMPORT_DIR,
})

const dshArgs = ['--profile', 'web', '--patch', join(rootDir, 'profiles', 'base.cordis.patch.yml')]
for (const feature of features) {
  dshArgs.push('--patch', join(rootDir, 'profiles', 'mcp', featureRequirements[feature].patch))
}
dshArgs.push(...forwarded)

try {
  await runDsh(dshArgs, { staging })
} finally {
  await configService.close()
}
