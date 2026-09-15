import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { addUserToolPaths, configuredFeatures, resolveDataDir, rootDir, updateEnvText } from '../scripts/common.mjs'
import { safeImportName, validValue } from '../scripts/config-server.mjs'
import { conversationNameFrom, dedupeMessages, parseLarkChatMarkdown } from '../scripts/lark-chat-parser.mjs'
import { searchTokens } from '../scripts/search-utils.mjs'
import {
  AUTO_ROUTING_PROMPT,
  CONFIGURATION_GUIDES,
  connectorPhases,
  SOURCES,
} from '../plugins/xunji-workbench/lib/workflows.js'

test('路由提示词覆盖每个资料源的操作要点', () => {
  // 这是唯一送达模型的通道：任何来源的规则只写在别处都等于没生效
  for (const source of SOURCES) {
    if (source.id === 'auto') continue
    assert.ok(
      AUTO_ROUTING_PROMPT.includes(source.instruction),
      `${source.label} 的要点未进入路由提示词`,
    )
  }
  assert.match(AUTO_ROUTING_PROMPT, /所有资料工具均为只读/)
  assert.match(AUTO_ROUTING_PROMPT, /没有可用依据时明确说明，不要猜测/)
})

test('中文检索会拆分短语并保留完整关键词', () => {
  const terms = searchTokens('查询快捷门票的退款流程')
  assert.ok(terms.includes('快捷门票'))
  assert.ok(terms.includes('快捷'))
  assert.ok(terms.includes('门票'))
  assert.ok(terms.includes('退款流程'))
})

test('自动资料路由作为 Host 系统提示词注入，而非仅保留前端文案', () => {
  const source = readFileSync(new URL('../plugins/xunji-workbench/src/index.ts', import.meta.url), 'utf8')
  assert.match(source, /inject = \['systemPrompt'\]/)
  assert.match(source, /xunji:auto-routing/)
  assert.match(source, /AUTO_ROUTING_PROMPT/)
})

test('会话完成后会基于真实工具调用显示资料来源', () => {
  const source = readFileSync(new URL('../plugins/xunji-workbench/src/client/index.tsx', import.meta.url), 'utf8')
  assert.match(source, /conversation\.chat\.turnTail/)
  assert.match(source, /实际检索/)
  assert.match(source, /uiConversation\.events\.register\(sourcesDefinition\)/)
  assert.match(source, /event\.type === 'tool\/call' \|\| event\.type === 'tool\/result'/)
  assert.match(source, /select: selectTurnSources/)
  assert.match(source, /本次回答依据/)
})

test('工作台入口位于左侧栏“新会话”下方，点击打开中央全局面板', () => {
  const source = readFileSync(new URL('../plugins/xunji-workbench/src/client/index.tsx', import.meta.url), 'utf8')
  const style = readFileSync(new URL('../plugins/xunji-workbench/src/client/style.ts', import.meta.url), 'utf8')
  assert.match(source, /name: 'sidebar\.panellist'/)
  assert.match(source, /label: '溯源配置'/)
  assert.match(source, /name: 'main',\s+key: PANEL_ID/)
  assert.match(source, /id: PANEL_ID/)
  assert.match(source, /data-xunji-workbench-panel/)
  assert.match(style, /button:has\(\.xunji-panel-glyph\)\{height:38px/)
  assert.match(style, /border-radius:12px;background:color-mix/)
  assert.match(style, /button:has\(\.xunji-panel-glyph\)\{[^}]*box-shadow:none/)
})

test('飞书与 MasterGo 资料源明确禁止写入', () => {
  const larkPatch = readFileSync(new URL('../profiles/mcp/lark.cordis.patch.yml', import.meta.url), 'utf8')
  const mastergoPatch = readFileSync(new URL('../profiles/mcp/mastergo.cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(AUTO_ROUTING_PROMPT, /不得导入、编辑文档或变更协作权限/)
  assert.match(AUTO_ROUTING_PROMPT, /不得修改画布、文件、变量或组件库/)
  assert.match(larkPatch, /docx\.v1\.document\.rawContent,docx\.builtin\.search,wiki\.v2\.space\.getNode,wiki\.v1\.node\.search/)
  assert.doesNotMatch(larkPatch, /process\.env\.LARK_TOOLS/)
  assert.match(mastergoPatch, /@mastergo\/magic-mcp@0\.2\.8/)
  assert.doesNotMatch(mastergoPatch, /@mastergo\/vibe-mcp/)
})

test('默认模型支持将设计稿截图作为图片输入', () => {
  const basePatch = readFileSync(new URL('../profiles/base.cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(basePatch, /id: agent-default-model/)
  assert.match(basePatch, /model: deepseek-v4-flash-vision-exp/)
})

test('图形化配置指引仅暴露变量名、只读范围与按需启动命令', () => {
  assert.deepEqual(CONFIGURATION_GUIDES.map((item) => item.id), [
    'codebase',
    'conversation-archive',
    'chat-import',
    'lark',
    'mastergo',
    'confluence-dc',
  ])
  assert.ok(CONFIGURATION_GUIDES.every((item) => item.readOnlyScope.includes('只读') || item.readOnlyScope.includes('读取')))
  assert.ok(CONFIGURATION_GUIDES.every((item) => item.variables.length > 0))
})

test('配置服务只会替换指定环境变量且不接受换行注入', () => {
  const next = updateEnvText('# 保留注释\nLARK_APP_ID=old\nUNRELATED=value\n', {
    LARK_APP_ID: 'cli_new',
    LARK_APP_SECRET: 'secret value',
  })
  assert.match(next, /# 保留注释/)
  assert.match(next, /LARK_APP_ID=cli_new/)
  assert.match(next, /LARK_APP_SECRET="secret value"/)
  assert.match(next, /UNRELATED=value/)
  assert.throws(() => updateEnvText('', { LARK_APP_ID: 'cli\nMALICIOUS=value' }), /不能包含换行符/)
})

test('配置服务接受 Windows 代码库绝对路径', () => {
  assert.equal(validValue('XUNJI_CODEBASE_PATHS', 'C:\\workspace\\demo-project'), true)
  assert.equal(validValue('XUNJI_CODEBASE_PATHS', 'C:\\repo-a;D:\\repo-b'), true)
  assert.equal(validValue('XUNJI_CODEBASE_PATHS', 'demo-project'), false)
})

test('自动选择会将已填写凭据的资料源纳入启动清单', () => {
  assert.deepEqual(configuredFeatures({
    MG_MCP_TOKEN: 'mastergo-token',
    CONFLUENCE_URL: 'https://wiki.example.com',
    CONFLUENCE_USERNAME: 'reader',
    CONFLUENCE_API_TOKEN: 'password',
  }), ['mastergo', 'confluence-dc'])
})

test('自动选择会将已登记的本机代码库纳入启动清单', () => {
  assert.deepEqual(configuredFeatures({ XUNJI_CODEBASE_PATHS: 'C:\\workspace\\demo-project' }), ['codebase'])
})

test('自动选择会将显式启用的本机历史归档纳入启动清单', () => {
  assert.deepEqual(configuredFeatures({ XUNJI_CONVERSATION_ARCHIVE: 'codex,claude' }), ['conversation-archive'])
  assert.equal(validValue('XUNJI_CONVERSATION_ARCHIVE', 'codex,claude'), true)
  assert.equal(validValue('XUNJI_CONVERSATION_ARCHIVE', 'codex,unknown'), false)
})

test('代码库资料策略仅允许只读检索', () => {
  const server = readFileSync(new URL('../scripts/codebase-mcp.mjs', import.meta.url), 'utf8')
  assert.match(AUTO_ROUTING_PROMPT, /codebase_search/)
  assert.match(AUTO_ROUTING_PROMPT, /当前会话工作区/)
  assert.match(AUTO_ROUTING_PROMPT, /不得写入、执行或修改任何项目文件/)
  assert.match(server, /sensitiveFileNames/)
  assert.match(server, /sensitiveExtensions/)
  assert.match(server, /isSensitiveFile/)
})

test('代码库 Profile 固定为本机 MCP 与显式路径配置', () => {
  const patch = readFileSync(new URL('../profiles/mcp/codebase.cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(patch, /serverName: codebase/)
  assert.match(patch, /XUNJI_CODEBASE_PATHS/)
  assert.match(patch, /scripts\/codebase-mcp\.mjs/)
})

test('历史归档 Profile 仅暴露本机只读 MCP', () => {
  const patch = readFileSync(new URL('../profiles/mcp/conversation-archive.cordis.patch.yml', import.meta.url), 'utf8')
  const server = readFileSync(new URL('../scripts/conversation-archive-mcp.mjs', import.meta.url), 'utf8')
  assert.match(patch, /serverName: conversation-archive/)
  assert.match(patch, /XUNJI_CONVERSATION_ARCHIVE/)
  assert.match(server, /conversation_archive_search/)
  assert.match(server, /event\.type === 'event_msg'/)
  assert.match(server, /join\(root, 'sessions'\)/)
  assert.match(server, /memory\[\\\\\/\]/)
  assert.doesNotMatch(server, /auth\.json/)
  // 同一段内容常在多个会话文件里重复，需去重后再截断结果
  assert.match(server, /function dedupeByContent/)
  assert.match(server, /\.filter\(dedupeByContent\(\)\)/)
  // Codex 与 Claude 都要索引完整会话，否则查不到助手说过什么
  assert.match(server, /function codexSessionDocs/)
  assert.match(server, /function claudeSessionDocs/)
  assert.match(server, /source: 'claude-session'/)
  // 思考块与工具结果不进索引：前者是中间过程，后者体积占大头且多为文件内容
  assert.match(server, /block\?\.type === 'text'/)
  assert.match(server, /block\?\.type === 'tool_use'/)
  assert.doesNotMatch(server, /'thinking'/)
  assert.doesNotMatch(server, /'tool_result'/)
})

test('历史归档在运行期间跟进新会话，且不因此拖慢检索', () => {
  const server = readFileSync(new URL('../scripts/conversation-archive-mcp.mjs', import.meta.url), 'utf8')
  // 与对话导入一致：三个入口都要先检查变更，否则刚聊完的内容要重启才查得到
  assert.match(server, /function refreshIfChanged/)
  assert.equal(server.match(/^\s*refreshIfChanged\(\)$/gm)?.length, 3)
  // 遍历数百个会话文件不能每次检索都做，按时间节流
  assert.match(server, /const refreshIntervalMs/)
  assert.match(server, /now - lastCheckedAt < refreshIntervalMs/)
  // 最大的一份磁盘缓存有数十 MB，重建必须走内存缓存并跳过无谓写盘
  assert.match(server, /const memoryCache = new Map\(\)/)
  assert.match(server, /if \(changed\) saveCache/)
})

test('飞书导出 Markdown 按发送人、时间、图片、附件与转发来源解析', () => {
  const markdown = [
    '# 张三与李四的会话 2026年9月11日',
    '',
    '> 查看原消息记录，可点击[回到会话](https://applink.feishu.cn/x)',
    '',
    '张三 2026年7月6日 14:32',
    '',
    '![img\\_a\\.jpeg](图片和附件/img_a.jpeg)',
    '',
    '等下测试环境更新',
    '',
    '李四 2026年7月7日 15:57',
    '不着急',
    '',
    '张三 2026年8月31日 18:11',
    '',
    '\\[张三与王五的会话记录\\]',
    '',
    '---',
    '',
    '王五 2026年8月28日 18:46',
    '\\[\\[文件\\]\\] 座位图\\-1286座\\(1\\)\\.xlsx',
    '',
    '---',
    '',
  ].join('\n')
  const { title, messages } = parseLarkChatMarkdown(markdown)
  assert.equal(conversationNameFrom(title, ''), '张三与李四的会话')
  assert.equal(messages.length, 3)
  assert.deepEqual(
    messages.map((message) => [message.sender, message.timestamp, message.text, message.images, message.files.length, message.forwardedFrom]),
    [
      ['张三', '2026-07-06T14:32', '等下测试环境更新', 1, 0, null],
      ['李四', '2026-07-07T15:57', '不着急', 0, 0, null],
      ['王五', '2026-08-28T18:46', '', 0, 1, '张三与王五的会话记录'],
    ],
  )
  assert.equal(messages[2].files[0], '座位图-1286座(1).xlsx')
})

test('同一会话多次导出按发送人、时间与正文去重并按时间排序', () => {
  const make = (sender, timestamp, text) => ({ sender, timestamp, text, images: 0, files: [], forwardedFrom: null })
  const unique = dedupeMessages([
    make('张三', '2026-07-07T15:57', '不着急'),
    make('张三', '2026-07-06T14:32', '先更新'),
    make('张三', '2026-07-07T15:57', '不着急'),
  ])
  assert.deepEqual(unique.map((message) => message.timestamp), ['2026-07-06T14:32', '2026-07-07T15:57'])
})

test('固定取值的配置项渲染为下拉而非文本框', () => {
  const guide = CONFIGURATION_GUIDES.find((item) => item.id === 'chat-import')
  const field = guide?.fields.find((item) => item.key === 'XUNJI_CHAT_IMPORT')
  const source = readFileSync(new URL('../plugins/xunji-workbench/src/client/index.tsx', import.meta.url), 'utf8')
  const config = readFileSync(new URL('../scripts/config-server.mjs', import.meta.url), 'utf8')
  assert.deepEqual(field?.choices?.map((choice) => choice.value), ['on', 'off'])
  assert.match(source, /field\.choices\s*\n?\s*\?\s*<select/)
  // 下拉直接选中当前值，不再需要「保持不变」这一档
  assert.doesNotMatch(source, /保持不变/)
  assert.match(source, /values\[field\.key\] \?\? current\[field\.key\]/)
  // 只回显非密钥开关，密钥仍然只返回是否已配置
  assert.match(config, /const publicVariables = new Set\(\['XUNJI_CHAT_IMPORT'\]\)/)
  assert.doesNotMatch(config, /publicVariables = new Set\(\[[^\]]*(TOKEN|SECRET|PASSWORD)/)
})

test('对话导入服务只接受导出文件名，拒绝路径穿越', () => {
  assert.equal(safeImportName('张三与李四的会话 2026年9月11日.zip'), '张三与李四的会话 2026年9月11日.zip')
  assert.equal(safeImportName('notes.md'), 'notes.md')
  assert.equal(safeImportName('../../.env'), null)
  assert.equal(safeImportName('sub/dir.zip'), null)
  assert.equal(safeImportName('C:\\evil.zip'), null)
  assert.equal(safeImportName('payload.exe'), null)
  assert.equal(safeImportName('.env'), null)
  assert.equal(validValue('XUNJI_CHAT_IMPORT', 'on'), true)
  assert.equal(validValue('XUNJI_CHAT_IMPORT', 'yes'), false)
})

test('配置页文案与当前功能一致：无密钥卡不提凭据，飞书卡指向对话导入', () => {
  const source = readFileSync(new URL('../plugins/xunji-workbench/src/client/index.tsx', import.meta.url), 'utf8')
  const lark = CONFIGURATION_GUIDES.find((item) => item.id === 'lark')
  // 无密钥字段的资料源不显示凭据措辞
  assert.match(source, /const hasSecret = guide\.fields\.some\(\(field\) => field\.secret\)/)
  assert.match(source, /hasSecret \? '如何获取凭据' : '使用步骤'/)
  assert.match(source, /hasSecret \? '不会回显已有密钥' : '无需密钥'/)
  // 飞书文档卡不得再声称对话检索未启用
  assert.doesNotMatch(lark?.description ?? '', /暂未启用/)
  assert.doesNotMatch(lark?.readOnlyScope ?? '', /不做手工导入/)
  assert.ok(lark?.help.steps.some((step) => step.includes('飞书对话导入')))
  // 自动检索说明需覆盖全部已接入来源
  assert.match(source, /代码库、历史归档、飞书对话、Confluence、MasterGo 或飞书文档/)
})

test('对话导入资料源为只读，且要求读取上下文后再下结论', () => {
  const patch = readFileSync(new URL('../profiles/mcp/chat-import.cordis.patch.yml', import.meta.url), 'utf8')
  const server = readFileSync(new URL('../scripts/chat-import-mcp.mjs', import.meta.url), 'utf8')
  assert.match(AUTO_ROUTING_PROMPT, /chat_import_search/)
  assert.match(AUTO_ROUTING_PROMPT, /chat_import_read/)
  assert.match(AUTO_ROUTING_PROMPT, /不得写入或修改导入文件/)
  assert.match(patch, /serverName: chat-import/)
  assert.match(patch, /XUNJI_CHAT_IMPORT_DIR/)
  assert.match(server, /chat_import_list/)
  assert.doesNotMatch(server, /execFileSync/)
  const config = readFileSync(new URL('../scripts/config-server.mjs', import.meta.url), 'utf8')
  assert.match(config, /'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'/)
  assert.match(config, /'Access-Control-Allow-Headers': 'content-type, x-file-name'/)
  assert.equal(configuredFeatures({ XUNJI_CHAT_IMPORT: 'on' }).includes('chat-import'), true)
})

test('开发仓库数据留在项目内，安装版改用用户目录以免升级丢配置', () => {
  const previous = process.env.XUNJI_DATA_DIR
  delete process.env.XUNJI_DATA_DIR
  try {
    // 开发仓库没有 packaged.json 标记
    assert.equal(resolveDataDir(), rootDir)
    process.env.XUNJI_DATA_DIR = 'C:\\custom\\data'
    assert.equal(resolveDataDir(), 'C:\\custom\\data')
  } finally {
    if (previous === undefined) delete process.env.XUNJI_DATA_DIR
    else process.env.XUNJI_DATA_DIR = previous
  }
})

test('用户数据目录名在脚本与外壳中保持一致', () => {
  // 两侧不一致会让外壳与服务各读各的目录，表现为配置凭空消失
  const common = readFileSync(new URL('../scripts/common.mjs', import.meta.url), 'utf8')
  const launcher = readFileSync(new URL('../shell/src/launcher.rs', import.meta.url), 'utf8')
  const fromCommon = /const DATA_DIR_NAME = '([^']+)'/.exec(common)?.[1]
  const fromShell = /PathBuf::from\(base\)\.join\("([^"]+)"\)/.exec(launcher)?.[1]
  assert.ok(fromCommon, '未找到脚本侧的数据目录名')
  assert.equal(fromShell, fromCommon)
})

test('打包只带程序文件，并复查凭据与本机数据', () => {
  const packager = readFileSync(new URL('../scripts/package-app.mjs', import.meta.url), 'utf8')
  // 白名单式复制：本机数据目录不在其中
  assert.match(packager, /const includedPaths = \[/)
  for (const excluded of ['.dsh', '.env', 'imports', '.credentials.yaml']) {
    assert.ok(packager.includes(`'${excluded}'`) === false || packager.includes('forbiddenNames'), `${excluded} 必须在禁止清单而非包含清单`)
  }
  assert.match(packager, /forbiddenNames = \['\.env', '\.dsh'/)
  assert.match(packager, /auditArtifact\(\)/)
  // 依赖必须重装为扁平结构，否则 pnpm 符号链接换机即失效
  assert.match(packager, /node-linker=hoisted/)
  assert.match(packager, /packaged\.json/)
})

test('安装包允许选择安装位置、免提权，且卸载不删用户数据', () => {
  const installer = readFileSync(new URL('../config/installer.iss', import.meta.url), 'utf8')
  assert.match(installer, /DisableDirPage=no/)
  assert.match(installer, /PrivilegesRequiredOverridesAllowed=dialog/)
  // 默认装到用户目录：免 UAC，静默安装也不会卡在提权
  assert.match(installer, /DefaultDirName=\{localappdata\}\\Programs/)
  assert.match(installer, /PrivilegesRequired=lowest/)
  // 两万多个小文件用固实+极限压缩会让解压变成长任务
  assert.match(installer, /SolidCompression=no/)
  assert.doesNotMatch(installer, /Compression=lzma2\/max/)
  // 卸载只清理程序目录内的运行期缓存
  assert.doesNotMatch(installer, /Type: filesandordirs; Name: "\{localappdata\}\\寻迹助手/)
  assert.match(installer, /UninstallDelete/)
})

test('分发包自带 pnpm，否则同事机器上无法初始化 Profile', () => {
  const packager = readFileSync(new URL('../scripts/package-app.mjs', import.meta.url), 'utf8')
  const common = readFileSync(new URL('../scripts/common.mjs', import.meta.url), 'utf8')
  assert.match(packager, /pnpm: versions\.packageManager\.split\('@'\)\[1\]/)
  // hoisted 安装不生成 .bin 垫片，运行时需自行补一个
  assert.match(common, /function ensurePnpmShim/)
  assert.match(common, /pnpm\.cmd/)
  // 每次打包写独立目录，避免被资源管理器或杀毒占用而清理失败
  assert.match(packager, /build-\$\{new Date\(\)/)
  assert.match(packager, /latest\.json/)
})

test('桌面外壳在换版本或换安装位置后重建 Profile', () => {
  const launcher = readFileSync(new URL('../shell/src/launcher.rs', import.meta.url), 'utf8')
  const setup = readFileSync(new URL('../scripts/setup.mjs', import.meta.url), 'utf8')
  const start = readFileSync(new URL('../scripts/start.mjs', import.meta.url), 'utf8')
  // setup 记录版本与程序目录两行，外壳比对第二行
  assert.match(setup, /\$\{versions\.dsh\.version\}\\n\$\{rootDir\}/)
  assert.match(launcher, /fn needs_setup/)
  assert.match(launcher, /lines\(\)\.nth\(1\)/)
  assert.match(launcher, /runtime"\)\.join\("node\.exe"\)/)
  assert.match(launcher, /LOCALAPPDATA/)
  assert.match(start, /Profile 指向旧程序目录/)
})

test('桌面外壳把服务地址作为新窗口初始地址，并随窗口收尾子进程', () => {
  const main = readFileSync(new URL('../shell/src/main.rs', import.meta.url), 'utf8')
  const launcher = readFileSync(new URL('../shell/src/launcher.rs', import.meta.url), 'utf8')
  // DSH 会话 Cookie 是 SameSite=Strict，从 tauri://localhost 跳转会丢 Cookie 导致 401
  assert.match(main, /WebviewUrl::External/)
  assert.doesNotMatch(main, /window\.location\.replace/)
  assert.match(main, /window\.label\(\) == "app"/)
  // 只接受写完整的日志行，避免读到截断的 token
  assert.match(launcher, /for line in text\.lines\(\)/)
  // 作业对象保证强制结束外壳时不留孤儿服务
  assert.match(launcher, /JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE/)
  assert.match(launcher, /fn adopt/)
})

test('Windows 用户工具路径会加入 PATH，供 where 解析 uvx', () => {
  const environment = {
    USERPROFILE: 'C:\\missing-user',
    LOCALAPPDATA: 'C:\\missing-user\\AppData\\Local',
    PATH: 'C:\\existing',
  }
  addUserToolPaths(environment)
  assert.equal(
    environment.PATH,
    'C:\\missing-user\\.local\\bin;C:\\missing-user\\AppData\\Local\\Microsoft\\WinGet\\Packages\\astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe;C:\\existing',
  )
})

test('自动资料策略会将内部规范路由到已启用的 Confluence', () => {
  assert.match(AUTO_ROUTING_PROMPT, /涉及 Confluence 页面、内部规范或制度时优先检索已启用的 Confluence/)
  assert.match(AUTO_ROUTING_PROMPT, /无需用户额外指定资料源/)
})

test('Confluence 策略要求将关键词转换为有效 CQL', () => {
  assert.match(AUTO_ROUTING_PROMPT, /siteSearch ~ "关键词"/)
  assert.match(AUTO_ROUTING_PROMPT, /不要把裸关键词或单独带引号的词当作查询/)
})

test('连接状态只认 Host 中已启用的真实条目', () => {
  const phases = connectorPhases([
    { entryId: 'knowledge', moduleName: 'dsh-knowledge-sqlite', enabled: true, fiberPhase: 'active' },
    { entryId: 'mastergo', moduleName: '@deepseek-ai/dsh-mcp-client', enabled: true, fiberPhase: 'loading' },
    { entryId: 'lark', moduleName: '@deepseek-ai/dsh-mcp-client', enabled: false, fiberPhase: 'active' },
    { entryId: 'confluence-dc', moduleName: '@deepseek-ai/dsh-mcp-client', enabled: true, fiberPhase: 'failed' },
  ])
  assert.deepEqual(phases, {
    local: 'active',
    codebase: 'off',
    conversation: 'off',
    chatImport: 'off',
    lark: 'off',
    mastergo: 'loading',
    confluence: 'failed',
  })
})

test('客户端构建通过 DSH ModuleLoader 获取 React', () => {
  const bundle = readFileSync(new URL('../plugins/xunji-workbench/lib/client.js', import.meta.url), 'utf8')
  assert.match(bundle, /factory: \(require\) =>/)
  assert.match(bundle, /require\(['"]react['"]\)/)
  assert.match(bundle, /return XunjiWorkbench/)
})

test('对外界面不出现内部代号，也不覆盖 DSH 自带徽标', () => {
  const source = readFileSync(new URL('../plugins/xunji-workbench/src/client/index.tsx', import.meta.url), 'utf8')
  const workflows = readFileSync(new URL('../plugins/xunji-workbench/src/client/workflows.ts', import.meta.url), 'utf8')
  // 内部标识（类型名、CSS 类、环境变量）可保留，用户可见文案不得出现代号
  const visibleOf = (code) => [...code.matchAll(/'([^'\n]*[一-龥][^'\n]*)'|>([^<>{}\n]*[一-龥][^<>{}\n]*)</g)]
    .map((match) => match[1] ?? match[2] ?? '')
  assert.deepEqual(visibleOf(source).filter((text) => text.includes('Xunji')), [])
  assert.deepEqual(visibleOf(workflows).filter((text) => text.includes('Xunji')), [])
  assert.match(source, /<strong>寻迹助手<\/strong>/)
  assert.match(source, /title: \(\) => '寻迹助手'/)
  // 对外不得出现真实项目名，示例一律用中性占位
  const workflowsText = readFileSync(new URL('../plugins/xunji-workbench/src/client/workflows.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(workflowsText, /demo-project/)
  // 不再用字母徽标覆盖官方 Hero 品牌位
  assert.doesNotMatch(source, /conversation\.hero\.brand\.mark/)
  assert.doesNotMatch(source, />S<\/span>/)
})

test('Workbench 会话态迁入 DSH 原生右侧栏', () => {
  const source = readFileSync(new URL('../plugins/xunji-workbench/src/client/index.tsx', import.meta.url), 'utf8')
  assert.match(source, /sidebarRightTabs\.register\(/)
  assert.match(source, /name: 'sidebar\.right\.pane\.tab'/)
  assert.doesNotMatch(source, /conversation\.input\.dock/)
  assert.doesNotMatch(source, /shell\.overlay/)
  assert.doesNotMatch(source, /inputActions\.setDraft/)
  assert.match(source, /data-xunji-workbench-tab/)
  assert.match(source, /data-xunji-configuration-panel/)
  assert.doesNotMatch(source, /启动此资料源/)
  assert.match(source, /保存到本机 \.env/)
  assert.match(source, /已按当前配置自动启用资料源/)
  assert.doesNotMatch(source, /使用所选资料/)
  assert.match(source, /不写入浏览器/)
  assert.match(source, /当前 Host 插件状态/)
  assert.doesNotMatch(source, /打开 DSH 插件设置/)
  assert.doesNotMatch(source, /data-xunji-workbench-trigger/)
})

test('Workbench 不再自绘固定栏，也不再嗅探 DSH 内部类名', () => {
  const style = readFileSync(new URL('../plugins/xunji-workbench/src/client/style.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(style, /position:fixed/)
  assert.doesNotMatch(style, /_scrollBody/)
  assert.doesNotMatch(style, /\.xunji-workflow|\.xunji-sources|\.xunji-apply|\.xunji-home|\.xunji-rail-open/)
  assert.match(style, /\.xunji-tab\{width:100%;min-height:100%/)
  assert.match(style, /\.xunji-panel\{width:100%;height:100%/)
})

test('Workbench 依赖与客户端注入清单对齐 0.1.5 的包拆分', () => {
  const manifest = JSON.parse(readFileSync(new URL('../plugins/xunji-workbench/package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-client-runtime'], undefined)
  assert.equal(manifest.devDependencies['@deepseek-ai/dsh-client-runtime'], undefined)
  for (const name of ['@deepseek-ai/dsh-client-ui-chat', '@deepseek-ai/dsh-client-ui-sidebar-right']) {
    assert.equal(manifest.peerDependencies[name], manifest.devDependencies['@deepseek-ai/dsh-client-ui-slots'])
    assert.ok(manifest.dsh.client.inject.includes(name))
  }
})

test('Windows 一键启动器复用服务或选择完整端口对，且不会结束进程', () => {
  const launcher = readFileSync(new URL('../scripts/launch-xunji.ps1', import.meta.url), 'utf8')
  const entry = readFileSync(new URL('../启动 Xunji.cmd', import.meta.url), 'utf8')
  assert.match(launcher, /Test-LoopbackPort/)
  assert.match(launcher, /ConnectAsync/)
  assert.match(launcher, /Test-LoopbackPort \(\$_ \+ 1\)/)
  assert.match(launcher, /\[switch\]\$NoBrowser/)
  assert.match(launcher, /CreateNoWindow = \$true/)
  assert.match(launcher, /\$env:ComSpec/)
  assert.match(launcher, /launcher-\$timestamp\.err\.log/)
  assert.match(launcher, /scripts\/start\.mjs/)
  assert.doesNotMatch(launcher, /Stop-Process|taskkill|Remove-Item/)
  assert.match(entry, /launch-xunji\.ps1/)
})

test('启动器打开带 token 的 Web 地址，并为复用已运行服务保存该地址', () => {
  const launcher = readFileSync(new URL('../scripts/launch-xunji.ps1', import.meta.url), 'utf8')
  assert.match(launcher, /function Get-XunjiUrl/)
  assert.match(launcher, /token=\\S\+/)
  assert.match(launcher, /xunji-url-\$port\.txt/)
  assert.match(launcher, /xunji-url-\$PreferredPort\.txt/)
})

test('升级守护：setup 记录 Profile 的 DSH 版本，start 拒绝用新 CLI 启动未迁移的稳定 Profile', () => {
  const setup = readFileSync(new URL('../scripts/setup.mjs', import.meta.url), 'utf8')
  const start = readFileSync(new URL('../scripts/start.mjs', import.meta.url), 'utf8')
  const doctor = readFileSync(new URL('../scripts/doctor.mjs', import.meta.url), 'utf8')
  assert.match(setup, /xunji-dsh-version/)
  assert.match(start, /xunji-dsh-version/)
  assert.match(start, /if \(!staging && existsSync\(versionMarker\)\)/)
  assert.match(doctor, /default:\\s\*minimal/)
})
