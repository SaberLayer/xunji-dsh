# Xunji DSH

一个基于 DeepSeek Harness 的轻量私人开发助手配置套装。它不修改 DSH 核心，也不重新实现聊天、审批、会话和桌面壳；默认安装 Xunji Workbench 与本地知识插件，MasterGo、飞书、Confluence 等能力按需启用。

## 当前组合

- DSH：固定 `0.1.5-rc.2`，不跟随 npm `latest`；原生右侧栏支持多标签、分栏、全屏与 Markdown / 代码 / PDF / 图片预览，对话可上传任意文件。
- 默认模型：`deepseek-v4-flash-vision-exp`。将 MasterGo 设计稿截图拖入对话即可进行视觉分析；Magic MCP 仍负责只读的 DSL/D2C 结构化数据。
- 寻迹助手：左侧栏“新会话”下方的“溯源配置”按钮打开中央工作台页（资料源配置与连接状态，不依赖会话）；会话中也可在原生右侧栏“+”里打开同名标签并排查看；每个回答尾部标注实际检索来源与依据。界面对外只出现“寻迹助手”，不出现项目代号；`xunji` 仅作为包名、CSS 类名和环境变量前缀等内部标识保留。
- Agent 预设：请使用“标准模式”。0.1.5 起“极简模式”只提供持久 Shell，并会屏蔽 Xunji 的资料路由提示词与检索工具，`npm run doctor` 会对此提醒。
- 宠物：默认不安装，避免占用界面；需要时再显式选择候选插件。
- 本地知识：`dsh-knowledge-sqlite@0.1.9`，SQLite FTS5，写入默认审批，查询扩展默认关闭。
- 代码库：可登记一个或多个本机项目根目录，建立增量只读索引；自动排除依赖、构建产物、版本库和 `.env`。
- 历史归档：可按需索引本机 Codex 会话、Claude 项目记忆与输入历史，供检索此前的方案、想法和操作摘要；不读取凭据或日志。
- 飞书对话导入：把飞书客户端「导出到文档 → 下载为 Markdown」得到的 zip 或 md 上传到工作台，按消息逐条建立本机只读索引；同一会话多次导出自动合并去重，不连接飞书、不上传任何内容。
- MasterGo：官方 `@mastergo/magic-mcp@0.2.8` 经本机只读代理启动，只放行读取设计结构、组件文档与图标的 6 个工具；它自带的 C2d（代码同步回设计稿）、getD2c 与 applyDesign（写本地文件）对模型不可见。不接入可修改画布的 Vibe MCP。Magic MCP 没有搜索能力，可在“溯源配置 → MasterGo”按“名称=链接”登记常用设计文件，提问时说名称即可，模型会按名称枚举页面与图层。
- 飞书资料：官方 `@larksuiteoapi/lark-mcp@0.5.1`，固定只开放 4 个文档/知识库读取工具，不能由环境变量放宽。
- Confluence Server/Data Center：`mcp-atlassian==0.23.0`，仅 stdio、只读、3 个查询工具，兼容 6.0+。

所有上游版本和 Git 提交集中在 `config/versions.json`，便于审计与升级。

## 快速开始

要求 Node.js `>=22.19.0`。仓库附带 `.nvmrc`。当前目录下执行：

```powershell
nvm use 24.18.0
npx -y pnpm@11.21.0 install
npm run doctor
npm run setup
npm start
```

需要指定 Web 参数时可直接透传，例如 `npm start -- --no-open --port 3091`。

0.1.5 起 Web 地址带一次性 `token` 参数，请用终端打印的完整地址打开页面；直接访问裸端口会得到 401。

默认数据保存在项目内 `.dsh/`，不会污染系统全局 DSH Profile。

## Windows 一键启动

首次按“快速开始”安装依赖后，直接双击项目根目录的 `启动 Xunji.cmd` 即可后台启动并自动打开浏览器；它会从启动日志解析带 `token` 的地址后再打开。这是开发期的便捷入口，对外分发的安装版走的是 Tauri 桌面外壳，见下方“打包分发”。

## 按需启用企业能力

先把 `.env.example` 复制为 `.env`，只填写需要的系统。然后检查并启动：

```powershell
npm run doctor -- --with mastergo,lark
npm start -- --with mastergo,lark
```

可选名称：

- `mastergo`
- `lark`
- `confluence-dc`
- `codebase`
- `conversation-archive`
- `chat-import`

多个名称用逗号分隔。默认启动时会自动识别 `.env` 中已完整填写的资料源并全部启用；`--with` 仅用于临时只启用指定来源。

飞书文档/知识库读取不需要启用机器人；聊天记录不走这条路径，见下方对话导入。

启动后，左侧栏“溯源配置”提供各资料源的图形化指引：实时启用状态、固定只读范围、需要填写的变量和官方获取路径。可以直接在页面填写并保存；保存接口仅监听本机 `127.0.0.1`、只接受白名单变量、不会把密钥回显或存储到浏览器，重启后自动生效；Agent 会按问题自动选择已启用的资料源。远端凭据会在首次实际检索时由对应 MCP 验证。

Confluence Data Center 需要额外安装 `uv`，确保 `uvx` 在 PATH 中。7.1 没有 PAT，模板使用用户名和密码；建议创建权限最小的只读账号。

代码库不需要 Git Token：在“溯源配置 → 代码库”填写项目根目录的绝对路径并保存，多个项目用英文分号分隔。首次重启会建立索引；运行期间检索前会检测变更（最短间隔 3 秒），读取文件时立即检查更新。索引保存在本机数据目录，不会写入被检索项目。已保存的配置可点击“清除此项”，再保存并重启；对话导入选择“停用”后也需保存并重启。

飞书对话导入在“溯源配置 → 飞书对话导入”启用。先在飞书客户端多选消息导出到文档，再把云文档“下载为 Markdown”（带图片时是 zip），最后把文件拖进该页的上传区即可；导入后立即可检索，不需要重启。文件保存在 `.dsh/imports/`，索引只记消息正文、发送人、时间与附件名，图片只记数量。

导出文件和 ZIP 解压后的正文均限制为 64 MB。上传时先校验格式，页面分别显示“待检索时索引”“已索引”和失败原因；无效文件不会覆盖已有的同名导出。去重会考虑附件和图片标识，避免同一分钟的不同附件被合并。

历史归档与导入消息使用稳定引用 ID，新增记录不会改变已有引用。旧格式索引会在启动时自动重建；旧版本产生的引用需要重新检索获取，源会话和导出文件不会被修改。

历史归档在“溯源配置 → Codex / Claude 历史”填写 `codex`、`claude` 或 `codex,claude` 后启用。两边都索引完整会话：你的提问、助手的结论和执行过的工具都能查到。读取范围是 `~/.codex` 的会话事件、`~/.claude/projects` 下的会话记录与项目记忆，以及 Claude 输入历史；不会读取认证文件、密钥、日志、沙箱或 SQLite 原始库，缓存只保存在本机数据目录。

为控制索引体积，思考过程与工具返回内容不入库：前者属于中间推理，后者多为文件原文且占绝大部分体积。工具调用只记名称，便于回答“当时做了什么操作”。

归档有覆盖上限：Codex / Claude 会话文件超过 16 MB 时跳过，每个文件保留最近约 600 条记录，单条正文最多 4200 字符。归档列表工具会返回跳过文件、达到条目上限的文件和截断条目数，读取结果也会标记截断。代码库每个项目最多索引 20000 个文件，单文件最多 1 MB。

索引在运行期间自动跟进：检索前会比对会话文件的修改时间与大小，有新增或追加就增量重建，因此刚在别处聊完的内容不必重启即可查到。扫描按最短 3 秒间隔节流，解析结果常驻内存，没有变化时只是比对文件状态。

## 可选宠物

默认 Profile 不包含宠物。以后确有需要时可在隔离 Profile 显式选择：

```powershell
npm run setup -- --staging --pet deepseek-harness-pets
npm start -- --staging
```

候选值为 `harness-pet`、`deepseek-harness-pets`、`deepseek-pet`；默认值为 `none`。不要在同一个 Profile 同时安装多个宠物，避免重复 overlay。

## 可选原生插件

飞书作为远程控制入口和飞书资料检索是两件事。需要在飞书里直接控制 DSH 时，可在独立 Profile 中额外安装：

```powershell
npm run setup -- --staging --with lark-bridge
```

Git 检查点插件目前只验证到 rc6，默认不启用；需要评估时使用 `--with checkpoint` 在 staging Profile 测试。

## 打包分发

```powershell
npm run package            # 生成应用目录（dist/build-<时间戳>），含编译桌面外壳
npm run package:installer  # 编译成单个安装包 exe（需 Inno Setup 6）
```

产出 `dist/寻迹助手-<版本>-安装.exe`，约 63MB。双击安装包后可在向导里选择安装位置，默认装到用户目录，不需要管理员权限，也不需要预装 Node（运行时已内置）。首次启动会自动初始化，约一分钟，之后秒开。

打开的是独立桌面窗口，不是浏览器标签页：`shell/` 下的 Tauri 外壳负责窗口、启动编排与服务生命周期，界面用系统自带的 WebView2 渲染，外壳本身约 5MB。启动期间窗口内显示进度，失败时直接显示原因与日志路径。关闭窗口即结束后台服务；即使从任务管理器强制结束外壳，作业对象也会把服务进程树一并终止，不会留下占用端口的孤儿进程。

构建需要两样工具：Rust（`https://rustup.rs`）与 Inno Setup（`winget install -e --id JRSoftware.InnoSetup`）。

**用户数据与程序分离**。配置、会话、索引和已导入的对话都在 `%LOCALAPPDATA%\寻迹助手`，程序装在别处。因此升级只需运行新版安装包覆盖，配置不会丢；卸载也不会删数据。想彻底清除，手动删除该数据目录即可。

**打包不会带上任何本机数据**。只有显式列出的程序文件进包，`.env`、`.dsh`、导入的对话、索引、会话与凭据都被排除；打包最后一步会逐文件复查，发现疑似密钥立即报错中止。依赖会在系统临时目录重新以扁平方式安装，因为开发目录的 `node_modules` 是指向本机绝对路径的符号链接，换机即失效。

分发依赖复用仓库 `pnpm-lock.yaml` 并启用冻结检查，Rust 构建使用 `--locked`。只有新构建全部成功后才更新 `dist/latest.json` 并清理更早的构建，保留上一个版本供回退。

## 升级与回滚

先在隔离环境验证，不直接覆盖日常 Profile：

```powershell
npm run setup -- --staging
npm start -- --staging
```

升级时只调整 `package.json` 与 `config/versions.json` 的固定版本，并重新生成依赖锁。`.dsh/` 和 `.dsh-next/` 完全分离，验证失败直接继续使用 `.dsh/`，无需回滚 DSH 内部数据库。

`npm run setup` 会把 DSH 版本写入对应 Profile 目录的 `xunji-dsh-version`；升级根依赖后、尚未对稳定 `.dsh/` 运行 `setup` 之前，`npm start` 会拒绝用新 CLI 启动旧 Profile，避免会话数据被提前单向迁移。切换步骤见 `docs/upgrading.md`。

详细边界见 `docs/architecture.md`，升级清单见 `docs/upgrading.md`，安装与使用说明见 `docs/使用说明.md`，哪些数据会离开本机见 `docs/隐私说明.md`。

## 安全原则

- `.env`、`.dsh/`、`.dsh-next/` 均已忽略，不提交凭据和会话数据。
- 企业 MCP 默认关闭，且凭据通过环境变量注入。
- Confluence DC 固定安全修复版本，强制只读工具白名单。
- 飞书 MCP 默认不开放消息发送、文档导入、权限变更等写工具；App ID 与 App Secret 经环境变量传入，不进入命令行参数。
- MasterGo 只允许 Magic MCP 读取设计资料；禁止接入 Vibe MCP 的画布写入能力，令牌不进入命令行参数或 YAML。
- 第三方 MCP 一律经 `scripts/mcp-readonly-proxy.mjs` 启动：DSH 客户端不过滤工具，代理负责只暴露白名单工具并拒绝白名单外的调用。
