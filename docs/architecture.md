# 架构说明

## 设计目标

Xunji DSH 是 Profile 配置层，不是新的 Agent 框架。会话、模型、审批、文件工具、Web UI 和插件生命周期由 DSH 提供，本项目只负责组合、版本、权限和升级边界。

```text
DSH 0.1.5-rc.2
├─ 默认 Profile
│  ├─ xunji-workbench
│  └─ dsh-knowledge-sqlite
├─ 可选 MCP overlays
│  ├─ 本机代码库检索
│  ├─ 本机 Codex / Claude 历史归档
│  ├─ 飞书对话导入（手动导出文件）
│  ├─ MasterGo 官方 MCP
│  ├─ Lark 官方 OpenAPI MCP
│  └─ mcp-atlassian（Confluence DC）
└─ 可选原生插件
   ├─ dsh-lark-bridge
   └─ dsh-checkpoint-rewind
```

## Workbench 的接入点

- 全局入口：向 `sidebar.panellist` 注册 id 为 `xunji` 的条目（侧栏自己渲染按钮，标题取注册的 `label`），并向 `main` 插槽以同一 key 注册中央面板；点击按钮由侧栏调用 `ctx.layout.selectPanel('xunji')`，打开会话时布局自动切回对话。按钮的尺寸与配色通过 `button:has(.xunji-panel-glyph)` 覆盖，不引用 DSH 的哈希类名。
- 会话中：向 `ctx.sidebarRightTabs` 注册 `xunji` 标签类型，正文注册到 `sidebar.right.pane.tab`，在右侧栏“+”引导页可选；收起、分栏、全屏由 DSH 右侧栏负责。两处正文共用同一组件。
- 回合尾：向 `ctx.uiConversation.events` 注册一个按 `turn/start`、`tool/call`、`tool/result` 事件累积的定义，把本回合调用过的资料来源与依据发布为回合数据；`conversation.chat.turnTail` 的选择器只在有来源时渲染。
- Host：通过 `systemPrompt.section` 注入资料路由提示词。`minimal` 预设的 persona 为 complete，会拒绝任何插件追加提示词，因此 Xunji 只在标准模式等预设下生效。

## 为什么不会再次臃肿

- 默认运行面只有 Workbench 与本地知识，企业连接器和宠物均不加载。
- 每个企业系统一个独立 overlay，没有全局连接器注册中心和常驻同步器。
- MasterGo、飞书、Confluence 都复用 MCP；没有本项目自研 API SDK。飞书固定工具白名单，MasterGo 固定 Magic MCP，二者均不具备写入口。
- 不 fork DSH、不改内部 SQLite；仅维护薄层 Tauri 启动外壳，不引入 Live2D。
- 所有社区插件均以完整提交或精确包版本锁定。

## 可选宠物

宠物不再属于默认 Profile；仅在明确需要时显式安装。

| 候选 | 运行形态 | 优点 | 主要代价 | 定位 |
|---|---|---|---|---|
| `harness-pet` | DSH Web 原生 | 2 个能力注入、9 类状态、无遥测、适配集中 | 没有直接对话入口，当前上游只声明验证到 rc6 | 可选 |
| `deepseek-harness-pets` | DSH Web 原生 | Petdex 换皮、养成感更强 | 注入面更大、功能更重 | 可选体验版 |
| `deepseek-pet` | DSH Web 原生 | 对话气泡和并行会话体验完整 | peer 使用通配符、升级边界较弱 | 可选 |
| `ds-pet` | Electron 桌面应用 | 真正系统级常驻、托盘与安装包 | 重新引入独立桌面运行时 | 暂不采用 |

## 飞书的两条路线

- Lark OpenAPI MCP：让 Agent 搜索和读取飞书文档/知识库。
- `dsh-lark-bridge`：让人在飞书聊天中启动、审批和控制 DSH 任务。

两者权限、用途和故障面不同，因此不捆绑启用。

## Wiki 与 MasterGo 只读边界

- 飞书 Profile 固定为正文读取、文档搜索、知识库节点读取和节点搜索四项工具；文档导入、编辑、协作者权限与消息发送均不在启动参数中。
- MasterGo 固定使用 `@mastergo/magic-mcp` 获取 DSL/D2C 设计上下文；不接入 `@mastergo/vibe-mcp`，因此不会获得画布、变量或组件库的创建和修改能力。
- 默认 DeepSeek 模型为 `deepseek-flash`：可读取用户显式附加的设计稿截图，不会获得 MasterGo 的额外权限，也不会自动抓取或上传远端设计文件。
- 令牌对应的飞书应用与 MasterGo 账号也应只授予目标资料的查看权限；运行时白名单不能替代上游账号权限控制。

## 桌面外壳

- `shell/` 是 Tauri 2 应用，分发版的唯一入口。它定位程序与用户数据目录、必要时运行 `setup.mjs` 初始化、挑选空闲端口拉起 `start.mjs`，再把服务地址作为**新窗口的初始地址**打开。
- 地址必须由新窗口直接加载，不能在启动页里 `location.replace`：DSH 的会话 Cookie 是 `SameSite=Strict`，从 `tauri://localhost` 发起的跳转属于跨站，鉴权重定向后 Cookie 不回传，页面会停在 401。
- 从日志解析带 token 的地址时只接受已换行的完整行，避免读到写入中途的截断 token。
- 服务子进程加入 Windows 作业对象并设置 `KILL_ON_JOB_CLOSE`，外壳被强制结束时子进程树一并终止；正常关闭窗口则走显式收尾。

## 数据边界

- DSH 会话由项目内 `.dsh/` 管理。
- 长期知识由 `dsh-knowledge-sqlite` 的独立数据库管理。
- 企业 MCP 默认按需读取远端资料，不自动把整库同步到本地。
- 代码库 MCP 只读取用户在 `.env` 显式登记的绝对路径，缓存索引位于 `.dsh/codebase-index/`；扫描时排除依赖、构建产物、版本库、`.env`、证书、私钥与常见凭据文件，不向被检索项目写入内容。
- 历史归档 MCP 仅在用户显式启用后读取 Codex 会话事件、Claude 会话记录（`~/.claude/projects/<项目>/<会话>.jsonl`）、Claude 项目记忆和输入历史；不读取认证文件、凭据、日志、沙箱或原始 SQLite 库，缓存位于数据目录的 `conversation-archive-index/`。
- 两个来源都只索引用户消息、助手回复正文与工具调用名。思考块属于中间推理，工具结果多为文件原文且占体积大头，二者都不入库；需要原文时回到对应工具重新读取。
- 索引与对话导入一样支持热更新：工具调用前比对文件清单指纹（路径、修改时间、大小），变化才重建。扫描要遍历数百个会话文件，因此按时间节流；解析结果常驻内存，避免反复反序列化数十 MB 的磁盘缓存，且无变化时不写盘。
- 对话导入 MCP 只读取用户上传到 `.dsh/imports/` 的飞书导出文件，不访问飞书远端；zip 由 Node 自带 zlib 解析（不调用外部 tar），只索引正文、发送人、时间与附件名，图片仅记数量。上传接口是本机配置服务的一部分，文件名经白名单校验，拒绝路径分隔与父目录引用。
- 后续确有离线检索需求时，再单独增加“只读同步 → 分块 → knowledge_write”的可停用任务，不把同步逻辑塞进默认 Profile。

## 外部 Agent 执行器（预留）

- Codex 规划为默认代码执行器，Claude Code 保留为未来可选评审/执行器；两者都不读取或复用历史归档中的认证信息。
- 官方 `@deepseek-ai/dsh-subagent-codex` / `dsh-subagent-claude-code` 已随 DSH `0.1.5-rc.2` 同步发布，声明了 `dsh.bundle` 且 peer 依赖对齐；标准预设也已内置 `tool-subagent-codex` / `tool-subagent-claude-code` 行。接入只剩安装 provider 与状态展示，作为后续独立阶段处理。
- 接入时由 DSH 的正式 Subagent 机制在当前会话工作区委派任务；不会退化为对任意 `codex exec` / `claude` 命令的直通暴露。
