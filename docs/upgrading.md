# 升级手册

## 原则

DSH 仍是预发布版本，升级可能包含破坏性变化。稳定 Profile 固定在 `.dsh/`，候选版本固定在 `.dsh-next/`；只有验证通过才更新稳定版本清单。

## 升级步骤

1. 检查 DSH 新 tag、npm 包完整性和迁移说明。
2. 在单独分支修改 `package.json` 与 `config/versions.json`，禁止使用 `latest`、`*` 或浮动 `main`。
3. 重新安装根依赖并生成 lockfile。
4. 使用 `npm run setup -- --staging` 初始化 `.dsh-next/`。
5. 使用 `npm start -- --staging` 验证 Web、会话、审批、Workbench 和知识工具。
6. 分别启用每个企业 overlay，确认工具清单、只读约束和错误降级。
7. 验证通过后再更新稳定 `.dsh/`；失败则保留原版本，不移动或覆盖稳定数据。

## 可选宠物兼容性检查

- 仅在使用 `--pet` 显式安装宠物时执行以下检查。
- 页面仅出现一个宠物实例。
- idle、working、waiting、success、error 状态可区分。
- 切换会话和刷新页面后订阅不重复。
- 宠物关闭后不影响会话输入、审批和工具调用。
- 浏览器控制台无持续错误或定时器泄漏。

## 企业 MCP 检查

- 没有凭据时默认 Profile 仍可启动。
- MCP 工具名带独立命名空间，不互相覆盖。
- Confluence DC 只出现 3 个读取工具，直接调用写工具应失败。
- 飞书只出现配置的文档/知识库读取工具。
- MasterGo token 不出现在配置文件和进程参数中。

## rc.2 之后能否继续升级

能。项目只依赖 DSH 的 Profile、Bundle、MCP Client 和少量客户端插件接口。若客户端接口变化，通常只需升级 Workbench；企业系统继续通过 MCP 隔离，知识数据库也不依赖 DSH 会话表结构。真正需要谨慎迁移的是 `.dsh` Profile 格式，因此始终先在 `.dsh-next` 验证。

## 0.1.1-rc.2 → 0.1.5-rc.2 实际记录

- 客户端包拆分：`@deepseek-ai/dsh-client-runtime` 停止发布，`ClientContext` 改为 cordis `Context`；`conversation.chat.turnTail` 搬到 `dsh-client-ui-chat`，`ctx.slots` 由 `dsh-client-ui-renderer` 声明。这些包不声明自身依赖，Workbench 需要把 `dsh-client-store`、`dsh-client-ui-dockkit`、`dsh-client-ui-primitives` 等类型包列为 devDependencies 才能通过类型检查。
- 右侧栏：新版有原生右侧栏，Workbench 会话态的固定右栏与之重叠，已迁为右侧栏标签；`turnTail` 不能再从会话快照读聊天节点，改为注册会话事件定义。
- Profile 依赖目录：新 CLI 内置 pnpm 使用全局 store，旧 Profile 的 `node_modules` 挂在项目内 store 会报 `ERR_PNPM_UNEXPECTED_STORE`。切换前删除 `<Profile>/profiles/web/node_modules`、`pnpm-lock.yaml` 与 `<Profile>/profiles/node_modules` 再运行 `npm run setup`；`sessions/`、`knowledge.sqlite`、`settings.yaml` 保持不动。
- 会话数据：首次用新 CLI 启动会把 `session.jsonl` 迁移为 `session.v3.jsonl.zstd`，原文件保留但新格式不能降级读取。`setup` 写入的 `xunji-dsh-version` 标记会让 `start` 在标记不匹配时拒绝启动稳定 Profile。
- 预设：`.dsh/settings.yaml` 中 `agent-presets.default` 若为 `minimal`，Xunji 的提示词与资料工具都不可见；切换后请改为 `standard`。
- Web 鉴权：启动输出的地址带 `token`，启动器已改为解析日志后打开并保存该地址。
