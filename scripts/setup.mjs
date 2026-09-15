import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertSupportedNode, csvOption, ensureProfileBuilds, loadEnvFile, readOption, resolveHome, rootDir, runDsh, versions } from './common.mjs'

loadEnvFile()
assertSupportedNode()

const args = process.argv.slice(2)
const staging = args.includes('--staging')
const pet = readOption(args, '--pet', versions.pets.default)
const extras = csvOption(args, '--with')

if (pet !== 'none' && (!versions.pets[pet] || pet === 'default')) {
  throw new Error(`未知宠物：${pet}；可选 none、harness-pet、deepseek-harness-pets、deepseek-pet`)
}

const specs = []
for (const extra of extras) {
  if (extra === 'lark-bridge') specs.push(versions.plugins.larkBridge)
  else if (extra === 'checkpoint') specs.push(versions.plugins.checkpoint)
  else throw new Error(`未知可选插件：${extra}`)
}

const workbench = join(rootDir, 'plugins', 'xunji-workbench')
console.log(`安装产品层插件：${workbench}`)
await runDsh(['plugin', '--profile', 'web', 'add', workbench], { staging })

console.log(`安装 Profile 依赖：${versions.plugins.knowledge}`)
await runDsh(['plugin', '--profile', 'web', 'add', versions.plugins.knowledge], { staging })

const allowedBuilds = pet === 'harness-pet' ? [versions.buildAllow['harness-pet']] : []
ensureProfileBuilds(allowedBuilds, staging)

const optionalSpecs = pet === 'none' ? specs : [versions.pets[pet], ...specs]
for (const spec of optionalSpecs) {
  console.log(`安装 Profile 依赖：${spec}`)
  await runDsh(['plugin', '--profile', 'web', 'add', spec], { staging })
}

// 记录 Profile 对应的 DSH 版本与程序目录：Profile 内的插件是绝对路径链接，
// 换版本或换安装位置后都必须重新 setup，否则启动会找不到插件。
writeFileSync(join(resolveHome(staging), 'xunji-dsh-version'), `${versions.dsh.version}\n${rootDir}\n`, 'utf8')
console.log(`安装完成：${staging ? '.dsh-next' : '.dsh'} / web Profile / Workbench${pet === 'none' ? '（无宠物）' : ` + 宠物 ${pet}`}`)
