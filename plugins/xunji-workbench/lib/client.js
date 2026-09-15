window.__ModuleLoader__.load({ id: "xunji-workbench", factory: (require) => { const react = require('react'); const react_jsx_runtime = require('react/jsx-runtime');
var XunjiWorkbench = (function(exports, react, react_jsx_runtime) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region src/client/workflows.ts
	const SOURCES = [
		{
			id: "auto",
			label: "自动选择",
			instruction: "无需用户额外指定资料源：涉及 Confluence 页面、内部规范或制度时优先检索已启用的 Confluence；涉及设计稿、组件或视觉还原时优先检索已启用的 MasterGo；涉及已登记项目的代码、接口、路由或组件时优先检索代码库；询问此前方案、决策或操作记录时优先检索已启用的本机历史归档；涉及同事沟通、需求口径、线上问题反馈或“谁说过什么”时优先检索已导入的飞书对话；涉及当前工作区或本地资料时优先检索项目与本地知识。只调用当前已启用的工具，并在回答中标注实际使用的来源。"
		},
		{
			id: "local",
			label: "项目与本地知识",
			instruction: "优先检查当前工作区和本地知识库；缺少依据时明确指出，不要猜测。"
		},
		{
			id: "codebase",
			label: "代码库",
			instruction: "只使用已启用的代码库只读工具检索已登记项目；多个项目已登记时，先用 codebase_list 并优先选择与当前会话工作区同名或同路径的代码库，再用 codebase_search 定位、codebase_read_file 读取所需行，并标注代码库和文件路径。无法匹配当前工作区时先说明，不得跨项目臆测。不得写入、执行或修改任何项目文件。"
		},
		{
			id: "conversation",
			label: "历史归档",
			instruction: "只使用已启用的本机历史归档工具检索 Codex / Claude 的用户想法、项目记忆、助手结论和操作摘要；先搜索再读取命中条目，并标注来源、项目和时间。不得写入、删除或修改任何 Codex / Claude 文件。"
		},
		{
			id: "chatImport",
			label: "飞书对话",
			instruction: "只使用已启用的对话导入只读工具检索用户手动导入的飞书聊天记录：先用 chat_import_search 定位，再用 chat_import_read 读取命中消息的前后文再下结论，并标注会话、发送人和时间。导入内容按消息逐条索引，图片只记数量、附件只记文件名；需要看图时提示用户回原会话。不得写入或修改导入文件。"
		},
		{
			id: "lark",
			label: "飞书",
			instruction: "优先使用已启用的飞书文档与知识库只读工具，并在回答中说明资料来源；不得导入、编辑文档或变更协作权限。"
		},
		{
			id: "mastergo",
			label: "MasterGo",
			instruction: "只使用 MasterGo Magic MCP 读取设计上下文，结合当前项目规范给出可实施结果；不得修改画布、文件、变量或组件库。"
		},
		{
			id: "confluence",
			label: "Confluence",
			instruction: "优先使用已启用的 Confluence 只读工具检索规范，并保留页面来源。调用 confluence_search 时必须传入有效 CQL：关键词检索使用 `siteSearch ~ \"关键词\"`（例如 `siteSearch ~ \"订单退款\"`），不要把裸关键词或单独带引号的词当作查询。"
		}
	];
	[
		"资料路由：仅在当前可见的已启用工具能够提供依据时，按问题内容主动检索，不要求用户手动指定来源。",
		SOURCES[0].instruction,
		"各来源要点（仅适用于当前已启用者）：",
		...SOURCES.filter((source) => source.id !== "auto").map((source) => `- ${source.label}：${source.instruction}`),
		"所有资料工具均为只读。回答中说明实际使用的资料来源；没有可用依据时明确说明，不要猜测。"
	].join("\n");
	const CONNECTORS = [
		{
			id: "local",
			label: "本地知识",
			description: "项目资料与 SQLite FTS5",
			patterns: ["dsh-knowledge-sqlite", "knowledge-sqlite"]
		},
		{
			id: "codebase",
			label: "代码库",
			description: "已登记项目的本机只读索引",
			patterns: ["codebase", "mcp-codebase"]
		},
		{
			id: "conversation",
			label: "历史归档",
			description: "Codex / Claude 的本机只读记忆与操作记录",
			patterns: ["conversation-archive", "mcp-conversation-archive"]
		},
		{
			id: "chatImport",
			label: "飞书对话",
			description: "手动导入的聊天记录只读索引",
			patterns: ["chat-import", "mcp-chat-import"]
		},
		{
			id: "lark",
			label: "飞书",
			description: "文档和知识库只读检索",
			patterns: ["lark", "feishu"]
		},
		{
			id: "mastergo",
			label: "MasterGo",
			description: "设计稿与设计系统上下文",
			patterns: ["mastergo", "magic-mcp"]
		},
		{
			id: "confluence",
			label: "Confluence",
			description: "Data Center 资料检索",
			patterns: ["confluence"]
		}
	];
	const CONFIGURATION_GUIDES = [
		{
			id: "codebase",
			connectorId: "codebase",
			label: "代码库",
			description: "本机项目的只读代码检索",
			readOnlyScope: "只读取显式登记的项目目录；自动忽略依赖、构建产物、版本库、.env、证书、私钥与常见凭据文件",
			variables: ["XUNJI_CODEBASE_PATHS"],
			fields: [{
				key: "XUNJI_CODEBASE_PATHS",
				label: "项目绝对路径",
				placeholder: "C:\\workspace\\my-project（多个路径用英文分号分隔）"
			}],
			help: {
				label: "本机索引说明",
				href: "https://modelcontextprotocol.io/specification/2025-03-26/server/tools",
				steps: [
					"填写项目根目录的绝对路径，例如 C:\\workspace\\my-project",
					"保存并重启，首次启动会建立或增量更新本机索引",
					"代码问题会自动检索；登记多个项目时会优先匹配当前会话工作区"
				]
			}
		},
		{
			id: "conversation-archive",
			connectorId: "conversation",
			label: "Codex / Claude 历史",
			description: "检索本机项目记忆、对话结论与操作摘要",
			readOnlyScope: "只读取启用的 Codex / Claude 历史与项目记忆；不读取凭据、日志、沙箱或原始数据库，也不会改写源文件",
			variables: ["XUNJI_CONVERSATION_ARCHIVE"],
			fields: [{
				key: "XUNJI_CONVERSATION_ARCHIVE",
				label: "归档来源",
				placeholder: "codex,claude"
			}],
			help: {
				label: "本机归档说明",
				href: "https://modelcontextprotocol.io/specification/2025-03-26/server/tools",
				steps: [
					"填写 codex、claude 或 codex,claude",
					"保存并重启，索引只保存在本项目 .dsh 目录",
					"提问此前的方案、想法或操作时会自动检索已启用的归档"
				]
			}
		},
		{
			id: "chat-import",
			connectorId: "chatImport",
			label: "飞书对话导入",
			description: "检索手动导入的飞书聊天记录",
			readOnlyScope: "只读取你放入本机导入目录的导出文件；不连接飞书、不上传任何内容，图片只记数量、附件只记文件名",
			variables: ["XUNJI_CHAT_IMPORT"],
			fields: [{
				key: "XUNJI_CHAT_IMPORT",
				label: "启用对话导入",
				placeholder: "on",
				choices: [{
					value: "on",
					label: "启用"
				}, {
					value: "off",
					label: "停用"
				}]
			}],
			help: {
				label: "查看飞书导出说明",
				href: "https://www.feishu.cn/hc/zh-CN/articles/158045525235",
				steps: [
					"飞书客户端里悬停消息点“…”→“多选”，用“选择以下消息”一次勾选最多 100 条，点“导出到文档”",
					"打开生成的云文档，右上角“…”→“下载为”→ Markdown；带图片时会下载为 zip",
					"在下方把 zip 或 md 拖入上传区；同一会话多次导出会自动合并去重，导入后立即可检索"
				]
			}
		},
		{
			id: "lark",
			connectorId: "lark",
			label: "飞书",
			description: "飞书文档与知识库的按需查询；聊天记录见“飞书对话导入”",
			readOnlyScope: "固定 4 个文档 / 知识库只读查询接口，无需启用机器人；本卡片不读取聊天记录，聊天记录走手动导入",
			variables: ["LARK_APP_ID", "LARK_APP_SECRET"],
			fields: [{
				key: "LARK_APP_ID",
				label: "App ID",
				placeholder: "cli_xxx"
			}, {
				key: "LARK_APP_SECRET",
				label: "App Secret",
				placeholder: "飞书应用密钥",
				secret: true
			}],
			help: {
				label: "打开飞书开发者后台",
				href: "https://open.feishu.cn/app",
				steps: [
					"创建企业自建应用（无需启用机器人能力）",
					"在“凭证与基础信息”复制 App ID 和 App Secret",
					"申请文档与 Wiki 的只读权限并发布应用",
					"聊天记录不经这里：请用“飞书对话导入”上传客户端导出的文件，无需企业授权"
				]
			}
		},
		{
			id: "mastergo",
			connectorId: "mastergo",
			label: "MasterGo",
			description: "通过 Magic MCP 获取设计上下文",
			readOnlyScope: "只读 DSL / D2C，不修改画布或设计资产",
			variables: ["MG_MCP_TOKEN"],
			fields: [{
				key: "MG_MCP_TOKEN",
				label: "个人访问令牌",
				placeholder: "MasterGo token",
				secret: true
			}, {
				key: "MASTERGO_API_BASE_URL",
				label: "服务地址",
				placeholder: "https://mastergo.com",
				optional: true
			}],
			help: {
				label: "查看 Magic MCP 官方说明",
				href: "https://mastergo.com/help/ai-features/magic-mcp.html",
				steps: [
					"登录 MasterGo，进入个人设置",
					"在“安全设置”生成个人访问令牌",
					"确认账号为团队版且设计文件位于有权限的团队项目"
				]
			}
		},
		{
			id: "confluence-dc",
			connectorId: "confluence",
			label: "Confluence DC",
			description: "Confluence Data Center 7.1 资料检索",
			readOnlyScope: "只读搜索、页面与子页面",
			variables: [
				"CONFLUENCE_URL",
				"CONFLUENCE_USERNAME",
				"CONFLUENCE_API_TOKEN"
			],
			fields: [
				{
					key: "CONFLUENCE_URL",
					label: "站点地址",
					placeholder: "https://confluence.example.com"
				},
				{
					key: "CONFLUENCE_USERNAME",
					label: "只读账号",
					placeholder: "username"
				},
				{
					key: "CONFLUENCE_API_TOKEN",
					label: "密码或 PAT",
					placeholder: "Confluence 7.1 使用只读账号密码",
					secret: true
				}
			],
			help: {
				label: "查看 Atlassian 凭据说明",
				href: "https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html",
				steps: [
					"Confluence 7.1 暂不支持 PAT，请使用权限最小的只读账号密码",
					"升级至 7.9+ 后，可在个人设置创建可过期的 PAT",
					"将账号权限限制到需要检索的空间"
				]
			}
		}
	];
	function entryMatches(entry, patterns) {
		const haystack = `${entry.entryId} ${entry.moduleName}`.toLocaleLowerCase();
		return patterns.some((pattern) => haystack.includes(pattern));
	}
	function connectorPhases(entries) {
		return Object.fromEntries(CONNECTORS.map((connector) => {
			const matches = entries.filter((entry) => entryMatches(entry, connector.patterns) && entry.enabled);
			let phase = "off";
			if (matches.some((entry) => entry.fiberPhase === "active")) phase = "active";
			else if (matches.some((entry) => entry.fiberPhase === "failed")) phase = "failed";
			else if (matches.length > 0) phase = "loading";
			return [connector.id, phase];
		}));
	}
	//#endregion
	//#region src/client/style.ts
	const STYLE_ID = "xunji-workbench-style";
	const CSS = `
.xunji-panel,.xunji-tab{box-sizing:border-box;font-family:var(--ds-font-family,Inter,"PingFang SC","Microsoft YaHei",sans-serif);color:var(--dsw-alias-label-primary,#182230)}
.xunji-panel *,.xunji-tab *{box-sizing:border-box}
.xunji-panel button,.xunji-tab button{font:inherit}
.xunji-panel button:focus-visible,.xunji-tab button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#3b6ff5);outline-offset:2px}
.xunji-section-title{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:24px;margin-bottom:6px}
.xunji-section-title strong{font-size:12px;font-weight:680}
.xunji-section-title span{min-width:0;color:var(--dsw-alias-label-tertiary,#778292);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xunji-section-title button{flex:none;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,#526071);font-size:11px;cursor:pointer;padding:4px 6px}
.xunji-section-actions{display:flex;align-items:center;gap:2px}
.xunji-section-title button:hover{background:var(--dsw-alias-interactive-bg-hover,#f1f3f7)}
.xunji-connections{display:flex;flex-direction:column;gap:6px}
.xunji-connection{min-width:0;border:1px solid var(--dsw-alias-border-l2,#dce2ea);background:color-mix(in srgb,var(--dsw-alias-bg-layer-3,#fafbfc) 88%,transparent);border-radius:10px;padding:7px 8px;display:flex;align-items:center;gap:8px}
.xunji-connection__icon{flex:none;width:28px;height:28px;border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l2,#dce2ea);display:grid;place-items:center;color:var(--dsw-alias-state-business-primary,#3b6ff5);font-size:10px;font-weight:800}
.xunji-connection__copy{min-width:0;flex:1}
.xunji-connection__copy strong{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xunji-connection__copy span{display:block;margin-top:2px;color:var(--dsw-alias-label-tertiary,#7b8796);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xunji-connection__phase{flex:none;display:flex;align-items:center;gap:4px;color:var(--dsw-alias-label-tertiary,#7b8796);font-size:10px;white-space:nowrap}
.xunji-connection__phase i{width:6px;height:6px;border-radius:50%;background:currentColor}
.xunji-connection__phase[data-phase=active]{color:var(--dsw-alias-state-success-primary,#1e9d66)}
.xunji-connection__phase[data-phase=failed]{color:var(--dsw-alias-state-error-primary,#d84a4a)}
.xunji-connection__phase[data-phase=loading]{color:var(--dsw-alias-state-business-primary,#3b6ff5)}
.xunji-connections[data-compact=true]{display:grid;grid-template-columns:1fr 1fr}
.xunji-connections[data-compact=true] .xunji-connection__copy span{display:none}
.xunji-mini-mark{display:inline-grid;place-items:center;border-radius:10px;overflow:hidden;box-shadow:0 5px 16px rgba(49,93,224,.2)}
.xunji-tab{width:100%;min-height:100%;overflow-y:auto;overscroll-behavior:contain;padding:16px 18px 20px}
.xunji-tab__top{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;min-width:0;margin-bottom:14px}
.xunji-tab__connections{margin-top:4px}
.xunji-panel{width:100%;height:100%;overflow-y:auto;overscroll-behavior:contain;padding:28px 32px 40px}
.xunji-panel__surface{max-width:1040px;margin:0 auto}
.xunji-panel .xunji-tab__top{margin-bottom:18px}
.xunji-panel .xunji-dock__top-actions{width:auto}
.xunji-panel__grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:22px;align-items:start;margin-top:6px}
.xunji-panel__grid .xunji-tab__connections{margin-top:0}
.xunji-panel-glyph{flex:none;display:inline-block}
button:has(.xunji-panel-glyph){height:38px;min-height:38px;justify-content:center;gap:6px;margin:0 2px;padding:8px 16px;border:.5px solid color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 35%,var(--dsw-alias-border-l3,#d5dbe5));border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 8%,var(--dsw-alias-button-elevated-fill,#fff));color:var(--dsw-alias-state-business-primary,#315de0);font-size:14px;font-weight:500;line-height:22px;box-shadow:none}
button:has(.xunji-panel-glyph):hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 14%,var(--dsw-alias-button-elevated-fill,#fff))}
button:has(.xunji-panel-glyph)[aria-current=page]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 18%,var(--dsw-alias-button-elevated-fill,#fff));color:var(--dsw-alias-state-business-primary,#315de0);font-weight:600}
.xunji-dock__brand{min-width:0;display:flex;align-items:center;gap:10px}
.xunji-dock__brand-copy{min-width:0;display:flex;flex-direction:column;gap:2px}
.xunji-dock__brand-copy strong{font-size:15px;line-height:20px}
.xunji-dock__brand-copy span{color:var(--dsw-alias-label-tertiary,#778292);font-size:11px;line-height:15px}
.xunji-mini-mark{flex:none;width:32px;height:32px;border-radius:10px;font-size:14px}
.xunji-dock__top-actions{width:100%;display:flex;align-items:center;gap:6px}
.xunji-dock__config-toggle{flex:1;height:32px;border:0;border-radius:9px;background:var(--dsw-alias-bg-layer-2,#f3f5f8);color:var(--dsw-alias-state-business-primary,#315de0);padding:0 10px;font-size:11px;font-weight:650;text-align:left;cursor:pointer}
.xunji-dock__config-toggle:hover,.xunji-dock__config-toggle[aria-pressed=true]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 10%,transparent)}
.xunji-dock__connections-summary{flex:none;display:flex;align-items:center;gap:6px;height:32px;border:1px solid var(--dsw-alias-border-l2,#dce2ea);border-radius:999px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#526071);padding:0 11px;font-size:12px}
.xunji-status-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#9aa4b2)}
.xunji-status-dot[data-state=ready]{background:var(--dsw-alias-state-success-primary,#1e9d66)}
.xunji-status-dot[data-state=error]{background:var(--dsw-alias-state-error-primary,#d84a4a)}
.xunji-dock__connection-summary{margin:9px 0 0;color:var(--dsw-alias-label-tertiary,#778292);font-size:11px;line-height:16px}
.xunji-dock__notice{min-width:0;margin:12px 0 0;padding-top:11px;border-top:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#dce2ea) 76%,transparent);color:var(--dsw-alias-label-tertiary,#778292);font-size:10px;line-height:15px}
.xunji-config-panel{min-width:0}
.xunji-config-panel__intro{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:11px}
.xunji-config-panel__intro strong{display:block;font-size:13px;line-height:18px}
.xunji-config-panel__intro span:not(.xunji-config-panel__safe){display:block;margin-top:2px;color:var(--dsw-alias-label-tertiary,#778292);font-size:10px;line-height:14px}
.xunji-config-panel__safe{flex:none;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#1e9d66) 10%,transparent);color:var(--dsw-alias-state-success-primary,#1e9d66);padding:4px 7px;font-size:9px;font-weight:700;white-space:nowrap}
.xunji-config-panel__tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:9px}
.xunji-config-panel__tabs button{min-width:0;height:30px;border:1px solid var(--dsw-alias-border-l2,#dce2ea);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#526071);padding:0 8px;font-size:10px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xunji-config-panel__tabs button:hover{background:var(--dsw-alias-interactive-bg-hover,#f1f3f7)}
.xunji-config-panel__tabs button[data-active=true]{border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 48%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 10%,transparent);color:var(--dsw-alias-state-business-primary,#315de0);font-weight:700}
.xunji-config-panel__card{border:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 23%,var(--dsw-alias-border-l2,#dce2ea));border-radius:12px;background:linear-gradient(145deg,color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 5%,var(--dsw-alias-bg-layer-1,#fff)),var(--dsw-alias-bg-layer-1,#fff));padding:11px}
.xunji-config-panel__heading{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.xunji-config-panel__heading h3{margin:0;font-size:12px;line-height:17px}
.xunji-config-panel__heading p{margin:2px 0 0;color:var(--dsw-alias-label-tertiary,#778292);font-size:10px;line-height:14px}
.xunji-config-panel__permission{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:6px;margin-top:10px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-3,#f7f8fa) 86%,transparent);padding:7px 8px}
.xunji-config-panel__permission span{color:var(--dsw-alias-label-tertiary,#778292);font-size:9px}
.xunji-config-panel__permission strong{border-radius:5px;background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#1e9d66) 12%,transparent);color:var(--dsw-alias-state-success-primary,#1e9d66);padding:2px 5px;font-size:9px}
.xunji-config-panel__permission p{min-width:0;margin:0;color:var(--dsw-alias-label-secondary,#526071);font-size:9px;line-height:13px}
.xunji-config-panel__field{margin-top:10px}
.xunji-config-panel__field>span{display:block;margin-bottom:5px;color:var(--dsw-alias-label-tertiary,#778292);font-size:9px;font-weight:650}
.xunji-config-panel__variables{display:flex;flex-wrap:wrap;gap:5px}
.xunji-config-panel__variables code{border:1px solid var(--dsw-alias-border-l2,#dce2ea);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);padding:4px 6px;color:var(--dsw-alias-label-secondary,#526071);font-family:var(--ds-font-family-mono,ui-monospace,monospace);font-size:9px}
.xunji-config-panel__form{display:grid;gap:7px;margin-top:11px;padding:9px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 22%,var(--dsw-alias-border-l2,#dce2ea));border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 4%,transparent)}
.xunji-config-panel__form-title{display:flex;align-items:center;justify-content:space-between;gap:6px;color:var(--dsw-alias-label-secondary,#526071);font-size:10px;font-weight:700}
.xunji-config-panel__form-title em{color:var(--dsw-alias-label-tertiary,#778292);font-size:9px;font-style:normal;font-weight:500}
.xunji-config-panel__input{display:block;min-width:0}
.xunji-config-panel__input>span{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:3px;color:var(--dsw-alias-label-secondary,#526071);font-size:9px}
.xunji-config-panel__input i{border-radius:4px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-tertiary,#778292);padding:2px 4px;font-size:8px;font-style:normal}
.xunji-config-panel__input i[data-configured=true]{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#1e9d66) 10%,transparent);color:var(--dsw-alias-state-success-primary,#1e9d66)}
.xunji-config-panel__input select{width:100%;height:29px;border:1px solid var(--dsw-alias-border-l2,#dce2ea);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#182230);padding:0 6px;font-size:13px;outline:0;cursor:pointer}
.xunji-config-panel__input select:focus{border-color:var(--dsw-alias-state-business-primary,#3b6ff5);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 12%,transparent)}
.xunji-config-panel__input input{width:100%;height:27px;border:1px solid var(--dsw-alias-border-l2,#dce2ea);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#182230);padding:0 7px;font-size:10px;outline:0}
.xunji-config-panel__input input:focus{border-color:var(--dsw-alias-state-business-primary,#3b6ff5);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 12%,transparent)}
.xunji-config-panel__form>button{height:28px;border:0;border-radius:7px;background:var(--dsw-alias-state-business-primary,#3b6ff5);color:#fff;font-size:10px;font-weight:700;cursor:pointer}
.xunji-config-panel__form>button:disabled{cursor:wait;opacity:.6}
.xunji-import{margin-top:11px;padding:9px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 22%,var(--dsw-alias-border-l2,#dce2ea));border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 4%,transparent)}
.xunji-import__drop{display:flex;flex-direction:column;align-items:center;gap:3px;margin-top:7px;padding:14px 10px;border:1px dashed color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 42%,var(--dsw-alias-border-l2,#dce2ea));border-radius:9px;background:var(--dsw-alias-bg-layer-1,#fff);cursor:pointer;text-align:center}
.xunji-import__drop:hover,.xunji-import__drop[data-dragging=true]{border-color:var(--dsw-alias-state-business-primary,#3b6ff5);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 7%,var(--dsw-alias-bg-layer-1,#fff))}
.xunji-import__drop input{display:none}
.xunji-import__drop strong{font-size:12px;color:var(--dsw-alias-state-business-primary,#315de0)}
.xunji-import__drop span{font-size:11px;color:var(--dsw-alias-label-tertiary,#778292);line-height:16px}
.xunji-import__list{list-style:none;display:flex;flex-direction:column;gap:5px;margin:9px 0 0;padding:0}
.xunji-import__list li{display:flex;align-items:center;gap:8px;min-width:0;border:1px solid var(--dsw-alias-border-l2,#dce2ea);border-radius:7px;background:var(--dsw-alias-bg-layer-1,#fff);padding:5px 6px 5px 8px}
.xunji-import__name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}
.xunji-import__meta{flex:none;color:var(--dsw-alias-label-tertiary,#778292);font-size:11px}
.xunji-import__status{max-width:40%;font-size:11px;color:var(--dsw-alias-label-tertiary,#778292);overflow-wrap:anywhere}
.xunji-import__status[data-failed=true]{color:var(--dsw-alias-state-error-primary,#d84a4a)}
.xunji-config-panel__clear{justify-self:start;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#526071);font-size:11px;cursor:pointer;padding:2px 0}
.xunji-import__list button{flex:none;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#526071);padding:3px 6px;font-size:11px;cursor:pointer}
.xunji-import__list button:hover{background:var(--dsw-alias-interactive-bg-hover,#f1f3f7);color:var(--dsw-alias-state-error-primary,#d84a4a)}
.xunji-config-panel__help{margin-top:10px;border-top:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#dce2ea) 78%,transparent);padding-top:9px}
.xunji-config-panel__help strong{display:block;color:var(--dsw-alias-label-secondary,#526071);font-size:10px}
.xunji-config-panel__help ol{margin:5px 0 6px;padding-left:17px;color:var(--dsw-alias-label-tertiary,#778292);font-size:9px;line-height:14px}
.xunji-config-panel__help a{color:var(--dsw-alias-state-business-primary,#315de0);font-size:9px;font-weight:700;text-decoration:none}
.xunji-config-panel__unified{margin:9px 0 0;color:var(--dsw-alias-label-tertiary,#778292);font-size:9px;line-height:14px}
.xunji-config-panel__notice{margin:8px 0 0;color:var(--dsw-alias-state-success-primary,#1e9d66);font-size:10px;line-height:14px}
.xunji-dock__brand-copy span{font-size:12px;line-height:18px}
.xunji-section-title strong{font-size:13px}
.xunji-section-title span,.xunji-section-title button,.xunji-connection__copy span,.xunji-connection__phase,.xunji-dock__notice{font-size:11px;line-height:16px}
.xunji-connection__copy strong,.xunji-dock__config-toggle{font-size:12px}
.xunji-config-panel__intro span:not(.xunji-config-panel__safe),.xunji-config-panel__heading p,.xunji-config-panel__permission p,.xunji-config-panel__field>span,.xunji-config-panel__form-title,.xunji-config-panel__input>span,.xunji-config-panel__help strong,.xunji-config-panel__help ol,.xunji-config-panel__help a,.xunji-config-panel__unified,.xunji-config-panel__notice{font-size:12px;line-height:18px}
.xunji-config-panel__tabs button,.xunji-config-panel__heading h3,.xunji-config-panel__input input,.xunji-config-panel__form>button{font-size:13px}
.xunji-config-panel__permission span,.xunji-config-panel__permission strong,.xunji-config-panel__variables code,.xunji-config-panel__form-title em{font-size:11px}
.xunji-turn-sources{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:8px 0 0;color:var(--dsw-alias-label-tertiary,#778292);font-size:11px;line-height:16px}
.xunji-turn-sources>span{font-weight:650}
.xunji-turn-sources i{border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6ff5) 9%,transparent);color:var(--dsw-alias-state-business-primary,#315de0);padding:2px 7px;font-size:11px;font-style:normal}
.xunji-turn-evidence{display:flex;align-items:center;flex-wrap:wrap;gap:5px;width:100%;padding-top:2px;color:var(--dsw-alias-label-tertiary,#778292)}
.xunji-turn-evidence>span{font-weight:650}
.xunji-turn-evidence em,.xunji-turn-evidence a{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:5px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-3,#f7f8fa) 85%,transparent);padding:2px 6px;color:var(--dsw-alias-label-secondary,#526071);font-size:10px;font-style:normal;text-decoration:none}
.xunji-turn-evidence a{color:var(--dsw-alias-state-business-primary,#315de0)}
@media(max-width:1100px){.xunji-panel__grid{grid-template-columns:1fr}.xunji-panel{padding:20px}}
@media(max-width:680px){.xunji-tab{padding:13px}.xunji-dock__brand-copy span{display:none}.xunji-dock__top-actions{gap:4px}.xunji-dock__config-toggle{padding:0 7px}}
`;
	//#endregion
	//#region src/client/brand.ts
	const BRAND_ICON = "data:image/png;base64,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";
	//#endregion
	//#region src/client/index.tsx
	/** 右侧栏标签类型：id 是实现标识（用于 keyed 插槽），kind 是打开时使用的名称。 */
	const TAB_ID = "xunji-workbench";
	const TAB_KIND = "xunji";
	/** 左侧栏全局面板：sidebar.panellist 的 id 与 main 插槽的 key 必须一致。 */
	const PANEL_ID = "xunji";
	const SOURCES_KEY = "xunji-sources";
	const configPort = Number(window.location.port || (window.location.protocol === "https:" ? "443" : "80")) + 1;
	const CONFIG_API_URL = `${window.location.protocol}//${window.location.hostname}:${configPort}/v1/config`;
	const PHASE_COPY = {
		active: "已启用",
		loading: "读取中",
		failed: "异常",
		off: "按需"
	};
	function initials(label) {
		if (label === "本地知识") return "DB";
		if (label === "代码库") return "CB";
		if (label === "历史归档") return "AR";
		if (label === "飞书对话") return "IM";
		if (label === "飞书") return "FS";
		if (label === "MasterGo") return "MG";
		return "CF";
	}
	function sourceForTool(name) {
		const normalized = name.toLocaleLowerCase();
		if (normalized.includes("confluence") || normalized.includes("atlassian")) return "Confluence";
		if (normalized.includes("mastergo") || normalized.includes("magic")) return "MasterGo";
		if (normalized.includes("codebase")) return "代码库";
		if (normalized.includes("conversation_archive") || normalized.includes("conversation-archive")) return "历史归档";
		if (normalized.includes("chat_import") || normalized.includes("chat-import")) return "飞书对话";
		if (normalized.includes("knowledge")) return "本地知识";
		if (normalized.includes("lark") || normalized.includes("feishu") || normalized.includes("wiki")) return "飞书";
		return null;
	}
	function textFromContent(block) {
		const value = block;
		return value.type === "text" && typeof value.text === "string" ? value.text : null;
	}
	function asRecords(text) {
		try {
			const parsed = JSON.parse(text);
			if (Array.isArray(parsed)) return parsed.filter((item) => Boolean(item) && typeof item === "object");
			return parsed && typeof parsed === "object" ? [parsed] : [];
		} catch {
			return [];
		}
	}
	function evidenceFromResult(source, text) {
		const records = asRecords(text);
		const own = [];
		if (source === "代码库") for (const record of records) {
			if (typeof record.path !== "string") continue;
			own.push({
				label: source,
				detail: `${typeof record.codebase === "string" ? record.codebase : "代码库"} · ${record.path}`
			});
		}
		else if (source === "飞书对话") for (const record of records) {
			if (typeof record.conversation !== "string") continue;
			const messages = Array.isArray(record.messages) ? record.messages : [record];
			for (const message of messages) {
				if (Array.isArray(record.messages) && message.current !== true) continue;
				const parts = [
					record.conversation,
					message.sender,
					message.timestamp
				].filter((item) => typeof item === "string");
				if (typeof message.sender === "string") own.push({
					label: source,
					detail: parts.join(" · ")
				});
			}
		}
		else if (source === "历史归档") for (const record of records) {
			const parts = [
				record.source,
				record.kind,
				record.project,
				record.timestamp
			].filter((item) => typeof item === "string" && item.length > 0);
			if (parts.length) own.push({
				label: source,
				detail: parts.join(" · ")
			});
		}
		if (!own.length && ![
			"代码库",
			"历史归档",
			"飞书对话"
		].includes(source) && text.trim() && text.trim() !== "[]") {
			const href = text.match(/https?:\/\/[^\s)\]"']+/)?.[0];
			own.push(href ? {
				label: source,
				detail: "打开原始资料",
				href
			} : {
				label: source,
				detail: "已使用检索结果"
			});
		}
		return own;
	}
	/** 按会话事件流累积每个回合调用过的资料工具，并把结果发布为回合数据供回合尾读取。 */
	const sourcesDefinition = {
		kind: SOURCES_KEY,
		match: (event) => {
			if (event.type === "turn/start") return {
				id: String(event.data.turn),
				role: "start"
			};
			if (event.type === "tool/call" || event.type === "tool/result") return {
				id: String(event.data.turn),
				role: "update"
			};
			return null;
		},
		start: (_context, match) => {
			if (match.event.type !== "turn/start") throw new Error("xunji-sources 只能由 turn/start 事件开始");
			return {
				turn: match.event.data.turn,
				calls: /* @__PURE__ */ new Map(),
				sources: [],
				evidence: []
			};
		},
		update: (context, match) => {
			const { state } = context;
			if (match.event.type === "tool/call") {
				const calls = new Map(state.calls).set(String(match.event.data.callId), match.event.data.name);
				return {
					...state,
					calls
				};
			}
			if (match.event.type !== "tool/result") return state;
			const block = match.event.data.message.content[0];
			const name = state.calls.get(String(match.event.data.message.source.callId));
			const source = name ? sourceForTool(name) : null;
			if (!source || block.isError === true) return state;
			const text = block.content.map(textFromContent).filter((item) => item !== null).join("\n");
			const sources = state.sources.includes(source) ? state.sources : [...state.sources, source];
			const evidence = evidenceFromResult(source, text);
			if (!evidence.length) return {
				...state,
				sources
			};
			const seen = new Set(state.evidence.map((item) => `${item.label}\n${item.detail}\n${item.href ?? ""}`));
			const fresh = evidence.filter((item) => !seen.has(`${item.label}\n${item.detail}\n${item.href ?? ""}`));
			return {
				...state,
				sources,
				evidence: fresh.length ? [...state.evidence, ...fresh].slice(0, 3) : state.evidence
			};
		},
		buildLocationData: (context, scope, previous) => {
			const state = context.state;
			if (scope !== "turn" || !state) return null;
			if (previous?.kind === "turn" && previous.key === SOURCES_KEY && previous.turn === state.turn && previous.value.sources === state.sources && previous.value.evidence === state.evidence) return previous;
			return {
				kind: "turn",
				turn: state.turn,
				key: SOURCES_KEY,
				value: {
					sources: state.sources,
					evidence: state.evidence
				}
			};
		}
	};
	function useInventory(listPlugins) {
		const [inventory, setInventory] = (0, react.useState)([]);
		const [state, setState] = (0, react.useState)("loading");
		const refresh = (0, react.useCallback)(async () => {
			setState("loading");
			try {
				const snapshot = await listPlugins();
				setInventory(snapshot.entries);
				setState("ready");
			} catch {
				setState("error");
			}
		}, [listPlugins]);
		(0, react.useEffect)(() => {
			refresh();
		}, [refresh]);
		return {
			inventory,
			state,
			refresh
		};
	}
	function ConnectionList({ inventory, state, compact = false }) {
		const phases = (0, react.useMemo)(() => connectorPhases(inventory), [inventory]);
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "xunji-connections",
			"data-compact": compact || void 0,
			children: CONNECTORS.map((connector) => {
				const phase = state === "ready" ? phases[connector.id] : state === "error" ? "failed" : "loading";
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "xunji-connection",
					"data-connector": connector.id,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "xunji-connection__icon",
							children: initials(connector.label)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "xunji-connection__copy",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: connector.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: connector.description })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "xunji-connection__phase",
							"data-phase": phase,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {}), PHASE_COPY[phase]]
						})
					]
				}, connector.id);
			})
		});
	}
	function selectTurnSources(owner) {
		const data = owner.turn.data.get(SOURCES_KEY);
		return data && data.sources.length ? data : null;
	}
	function TurnSources({ matched }) {
		return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "xunji-turn-sources",
			"aria-label": `本次实际检索来源：${matched.sources.join("、")}`,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "实际检索" }),
				matched.sources.map((source) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { children: source }, source)),
				matched.evidence.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "xunji-turn-evidence",
					"aria-label": "本次回答依据",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "依据" }), matched.evidence.map((item) => item.href ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
						href: item.href,
						target: "_blank",
						rel: "noreferrer",
						children: item.detail
					}, `${item.label}-${item.detail}`) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", { children: item.detail }, `${item.label}-${item.detail}`))]
				})
			]
		});
	}
	function formatSize(bytes) {
		if (bytes >= 1048576) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
		if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${bytes} B`;
	}
	/** 对话导入区：把飞书导出的 zip / md 存到本机导入目录，MCP 检索时自动重建索引。 */
	function ImportPanel({ onNotice }) {
		const [files, setFiles] = (0, react.useState)([]);
		const [busy, setBusy] = (0, react.useState)(false);
		const [dragging, setDragging] = (0, react.useState)(false);
		const [notice, setNotice] = (0, react.useState)("");
		const refresh = (0, react.useCallback)(async () => {
			try {
				const response = await fetch(`${CONFIG_API_URL}/imports`, { cache: "no-store" });
				const body = await response.json();
				if (!response.ok || !body.ok || !body.files) throw new Error("无法读取导入目录。");
				setFiles(body.files);
			} catch (error) {
				setNotice(error instanceof Error ? error.message : "无法读取导入目录。");
			}
		}, []);
		(0, react.useEffect)(() => {
			refresh();
			const timer = window.setInterval(() => {
				refresh();
			}, 3e3);
			return () => window.clearInterval(timer);
		}, [refresh]);
		const upload = async (list) => {
			if (busy || !list?.length) return;
			setBusy(true);
			try {
				for (const file of Array.from(list)) {
					if (file.size > 67108864) throw new Error(`${file.name} 超过 64 MB。`);
					const response = await fetch(`${CONFIG_API_URL}/imports`, {
						method: "POST",
						headers: {
							"Content-Type": "application/octet-stream",
							"X-File-Name": encodeURIComponent(file.name)
						},
						body: file
					});
					const body = await response.json();
					if (!response.ok || !body.ok || !body.files) throw new Error(body.error ?? "上传失败。");
					setFiles(body.files);
				}
				const message = "已上传并通过格式校验；启用对话导入后，下次检索会建立索引。";
				setNotice(message);
				onNotice(message);
			} catch (error) {
				const message = error instanceof Error ? error.message : "上传失败。";
				setNotice(message);
				onNotice(message);
			} finally {
				setBusy(false);
			}
		};
		const remove = async (name) => {
			setBusy(true);
			try {
				const response = await fetch(`${CONFIG_API_URL}/imports`, {
					method: "DELETE",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name })
				});
				const body = await response.json();
				if (!response.ok || !body.ok || !body.files) throw new Error(body.error ?? "删除失败。");
				setFiles(body.files);
				setNotice(`已移除 ${name}`);
			} catch (error) {
				setNotice(error instanceof Error ? error.message : "删除失败。");
			} finally {
				setBusy(false);
			}
		};
		return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "xunji-import",
			"data-xunji-import-panel": true,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "xunji-config-panel__form-title",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "导入对话文件" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", { children: "只保存在本机，不上传" })]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					className: "xunji-import__drop",
					"data-dragging": dragging || void 0,
					onDragOver: (event) => {
						event.preventDefault();
						setDragging(true);
					},
					onDragLeave: () => setDragging(false),
					onDrop: (event) => {
						event.preventDefault();
						setDragging(false);
						upload(event.dataTransfer.files);
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "file",
							accept: ".zip,.md,.markdown,.txt",
							multiple: true,
							disabled: busy,
							onChange: (event) => {
								upload(event.target.files);
								event.target.value = "";
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: busy ? "正在导入…" : "点击选择，或把文件拖到这里" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "支持飞书导出的 .zip（含图片）与 .md；可一次选多个" })
					]
				}),
				files.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: "xunji-import__list",
					children: files.map((file) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "xunji-import__name",
							title: file.name,
							children: file.name
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "xunji-import__meta",
							children: formatSize(file.size)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "xunji-import__status",
							"data-failed": file.status === "failed" || void 0,
							title: file.error,
							children: file.status === "indexed" ? "已索引" : file.status === "failed" ? `解析失败：${file.error ?? "请重新导出"}` : "待检索时索引"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: busy,
							onClick: () => void remove(file.name),
							"aria-label": `移除 ${file.name}`,
							children: "移除"
						})
					] }, file.name))
				}),
				notice ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "xunji-config-panel__notice",
					role: "status",
					children: notice
				}) : null
			]
		});
	}
	function ConfigurationPanel({ inventory, state, onNotice }) {
		const defaultGuide = CONFIGURATION_GUIDES[0];
		const [selectedId, setSelectedId] = (0, react.useState)(defaultGuide.id);
		const [copyNotice, setCopyNotice] = (0, react.useState)("");
		const [values, setValues] = (0, react.useState)({});
		const [cleared, setCleared] = (0, react.useState)([]);
		const [configured, setConfigured] = (0, react.useState)({});
		const [current, setCurrent] = (0, react.useState)({});
		const [saving, setSaving] = (0, react.useState)(false);
		const phases = (0, react.useMemo)(() => connectorPhases(inventory), [inventory]);
		const guide = CONFIGURATION_GUIDES.find((item) => item.id === selectedId) ?? defaultGuide;
		const phase = state === "ready" ? phases[guide.connectorId] : state === "error" ? "failed" : "loading";
		const hasSecret = guide.fields.some((field) => field.secret);
		const refreshConfiguration = (0, react.useCallback)(async () => {
			try {
				const response = await fetch(`${CONFIG_API_URL}/status`, { cache: "no-store" });
				const body = await response.json();
				if (!response.ok || !body.ok || !body.configured) throw new Error("本机配置服务不可用。请通过 npm start 启动。");
				setConfigured(body.configured);
				if (body.values) setCurrent(body.values);
			} catch (error) {
				onNotice(error instanceof Error ? error.message : "无法读取本机配置状态。");
			}
		}, [onNotice]);
		(0, react.useEffect)(() => {
			refreshConfiguration();
		}, [refreshConfiguration]);
		const saveConfiguration = async (event) => {
			event.preventDefault();
			const entries = guide.fields.map((field) => [field.key, cleared.includes(field.key) ? "" : field.secret ? values[field.key] ?? "" : values[field.key]?.trim() ?? ""]).filter(([key, value]) => value.length > 0 || cleared.includes(key));
			if (!entries.length) {
				setCopyNotice("请先填写至少一个配置项；留空的字段会保留现有值。");
				return;
			}
			setSaving(true);
			try {
				const response = await fetch(CONFIG_API_URL, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ values: Object.fromEntries(entries) })
				});
				const body = await response.json();
				if (!response.ok || !body.ok || !body.configured) throw new Error(body.error ?? "保存失败。");
				setConfigured(body.configured);
				if (body.values) setCurrent(body.values);
				setValues({});
				setCleared([]);
				const message = "配置已保存；重启后生效。";
				setCopyNotice(message);
				onNotice(message);
			} catch (error) {
				const message = error instanceof Error ? error.message : "保存失败。";
				setCopyNotice(message);
				onNotice(message);
			} finally {
				setSaving(false);
			}
		};
		return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
			className: "xunji-config-panel",
			"aria-label": "资料源图形化配置",
			"data-xunji-configuration-panel": true,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "xunji-config-panel__intro",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "配置资料源" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "配置与导入文件只保存在本机" })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "xunji-config-panel__safe",
						children: "不写入浏览器"
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "xunji-config-panel__tabs",
					role: "tablist",
					"aria-label": "选择资料源",
					children: CONFIGURATION_GUIDES.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						role: "tab",
						"aria-selected": item.id === guide.id,
						"data-active": item.id === guide.id || void 0,
						onClick: () => {
							setSelectedId(item.id);
							setCopyNotice("");
							setValues({});
							setCleared([]);
						},
						children: item.label
					}, item.id))
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "xunji-config-panel__card",
					role: "tabpanel",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "xunji-config-panel__heading",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: guide.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: guide.description })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "xunji-connection__phase",
								"data-phase": phase,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {}), PHASE_COPY[phase]]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "xunji-config-panel__permission",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "权限范围" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "只读" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: guide.readOnlyScope })
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "xunji-config-panel__field",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "本机 .env 已配置的变量" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "xunji-config-panel__variables",
								children: guide.variables.map((variable) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: variable }, variable))
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
							className: "xunji-config-panel__form",
							onSubmit: (event) => void saveConfiguration(event),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xunji-config-panel__form-title",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "直接填写并保存" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", { children: hasSecret ? "不会回显已有密钥" : "无需密钥" })]
								}),
								guide.fields.map((field) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "xunji-config-panel__input",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
											field.label,
											field.optional ? "（可选）" : "",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
												"data-configured": configured[field.key] || void 0,
												children: configured[field.key] ? "已保存" : "未设置"
											})
										] }),
										field.choices ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											value: values[field.key] ?? current[field.key] ?? "",
											onChange: (event) => setValues((entries) => ({
												...entries,
												[field.key]: event.target.value
											})),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "",
												disabled: true,
												children: "请选择"
											}), field.choices.map((choice) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: choice.value,
												children: choice.label
											}, choice.value))]
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: field.secret ? "password" : "text",
											autoComplete: "off",
											placeholder: field.placeholder,
											value: values[field.key] ?? "",
											onChange: (event) => {
												setValues((current) => ({
													...current,
													[field.key]: event.target.value
												}));
												setCleared((keys) => keys.filter((key) => key !== field.key));
											}
										}),
										!field.choices && configured[field.key] && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "xunji-config-panel__clear",
											type: "button",
											disabled: saving,
											onClick: () => {
												setValues((current) => ({
													...current,
													[field.key]: ""
												}));
												setCleared((keys) => [.../* @__PURE__ */ new Set([...keys, field.key])]);
											},
											children: cleared.includes(field.key) ? "保存后清除" : "清除此项"
										})
									]
								}, field.key)),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "submit",
									disabled: saving,
									children: saving ? "正在保存…" : "保存到本机 .env"
								})
							]
						}),
						guide.id === "chat-import" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImportPanel, { onNotice }) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "xunji-config-panel__help",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: hasSecret ? "如何获取凭据" : "使用步骤" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ol", { children: guide.help.steps.map((step) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: step }, step)) }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
									href: guide.help.href,
									target: "_blank",
									rel: "noreferrer",
									children: [guide.help.label, " ↗"]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "xunji-config-panel__unified",
							children: guide.id === "chat-import" ? "启用开关改动需重启生效；启用后新上传的对话文件即时可检索，无需重启。" : "保存并重启后，会自动启用已配置资料源并按提问内容检索。"
						}),
						copyNotice ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "xunji-config-panel__notice",
							role: "status",
							children: copyNotice
						}) : null
					]
				})
			]
		});
	}
	/** 工作台正文：中央面板与右侧栏标签共用，wide 时配置表单与连接状态并排。 */
	function WorkbenchBody({ listPlugins, wide }) {
		const [showConfiguration, setShowConfiguration] = (0, react.useState)(wide);
		const [notice, setNotice] = (0, react.useState)("已按当前配置自动启用资料源；提问时会按内容选择代码库、历史归档、飞书对话、Confluence、MasterGo 或飞书文档。");
		const { inventory, state, refresh } = useInventory(listPlugins);
		const phases = (0, react.useMemo)(() => connectorPhases(inventory), [inventory]);
		const activeCount = Object.values(phases).filter((phase) => phase === "active").length;
		const connections = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "xunji-tab__connections",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "xunji-section-title",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "当前 Host 插件状态" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "xunji-section-actions",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => void refresh(),
							children: "刷新"
						})
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConnectionList, {
					inventory,
					state
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "xunji-dock__connection-summary",
					children: "首次实际检索时验证远端连通性；资料源的启用与凭据改动需重启生效。"
				})
			]
		});
		return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "xunji-tab__top",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "xunji-dock__brand",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "xunji-mini-mark",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkbenchGlyph, { size: 32 })
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "xunji-dock__brand-copy",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "寻迹助手" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "跨需求、代码与对话的线索检索" })]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "xunji-dock__top-actions",
					children: [wide ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "xunji-dock__config-toggle",
						type: "button",
						"aria-pressed": showConfiguration,
						onClick: () => setShowConfiguration((value) => !value),
						children: showConfiguration ? "返回状态" : "配置资料源"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "xunji-dock__connections-summary",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "xunji-status-dot",
								"data-state": state
							}),
							"启用 ",
							state === "ready" ? `${activeCount}/${CONNECTORS.length}` : "…"
						]
					})]
				})]
			}),
			wide ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "xunji-panel__grid",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfigurationPanel, {
					inventory,
					state,
					onNotice: setNotice
				}), connections]
			}) : showConfiguration ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfigurationPanel, {
				inventory,
				state,
				onNotice: setNotice
			}) : connections,
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "xunji-dock__notice",
				role: "status",
				children: notice
			})
		] });
	}
	/** 会话态的工作台：作为 DSH 原生右侧栏的一个标签页，收起、分栏、全屏都交给宿主。 */
	function XunjiTab({ listPlugins }) {
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
			className: "xunji-tab",
			"aria-label": "寻迹助手",
			"data-xunji-workbench-tab": true,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkbenchBody, {
				listPlugins,
				wide: false
			})
		});
	}
	/** 中央全局面板：由左侧栏“新会话”下方的入口打开，不依赖会话。 */
	function XunjiPanel({ listPlugins }) {
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
			className: "xunji-panel",
			"aria-label": "寻迹助手",
			"data-xunji-workbench-panel": true,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "xunji-panel__surface",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkbenchBody, {
					listPlugins,
					wide: true
				})
			})
		});
	}
	/** 面板标题用的品牌图：与桌面程序同一张图。 */
	function WorkbenchGlyph({ size, className }) {
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
			className,
			src: BRAND_ICON,
			width: size,
			height: size,
			alt: "",
			draggable: false,
			"aria-hidden": "true"
		});
	}
	/** 侧栏入口图标：与宿主“新会话”同为单色线条风格，图形沿用品牌图的对话气泡加代码符号。 */
	function SidebarGlyph({ size, className }) {
		return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			className,
			viewBox: "0 0 24 24",
			width: size,
			height: size,
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "1.7",
			strokeLinecap: "round",
			strokeLinejoin: "round",
			"aria-hidden": "true",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 4.5h8a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4h-5l-3.5 3v-3H8a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M10.5 8.8 8.5 11l2 2.2M13.5 8.8l2 2.2-2 2.2" })]
		});
	}
	/** 左侧栏入口的图标；按钮本身由侧栏渲染，标题取自注册时的 label。 */
	function XunjiPanelIcon({ size }) {
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarGlyph, {
			size,
			className: "xunji-panel-glyph"
		});
	}
	function installStyle() {
		if (document.getElementById("xunji-workbench-style") !== null) return () => {};
		const style = document.createElement("style");
		style.id = STYLE_ID;
		style.dataset.plugin = "xunji-workbench";
		style.textContent = CSS;
		document.head.append(style);
		return () => style.remove();
	}
	const inject = [
		"slots",
		"remote",
		"remote.pluginInventory",
		"uiConversation",
		"sidebarRightTabs"
	];
	function apply(ctx) {
		if (typeof window === "undefined" || typeof document === "undefined") return;
		const listPlugins = async () => {
			const result = await ctx.remote.pluginInventory.list();
			if (!result.ok) throw new Error(result.error.message);
			return result.value;
		};
		ctx.effect(() => {
			const removeStyle = installStyle();
			const disposers = [
				ctx.uiConversation.events.register(sourcesDefinition),
				ctx.sidebarRightTabs.register({
					id: TAB_ID,
					kind: TAB_KIND,
					priority: "extension",
					title: () => "寻迹助手",
					guide: [{
						order: 20,
						title: () => "寻迹助手",
						description: () => "资料源配置、连接状态与自动检索说明"
					}]
				}),
				ctx.slots.inject("main", () => ctx.slots.register({
					name: "main",
					key: PANEL_ID,
					inject: () => ({ listPlugins })
				}, XunjiPanel)),
				ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
					name: "sidebar.panellist",
					id: PANEL_ID,
					order: 10,
					label: "溯源配置"
				}, XunjiPanelIcon)),
				ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
					name: "sidebar.right.pane.tab",
					key: TAB_ID,
					inject: () => ({ listPlugins })
				}, XunjiTab)),
				ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({
					name: "conversation.chat.turnTail",
					priority: -10,
					select: selectTurnSources
				}, TurnSources))
			];
			return () => {
				for (const dispose of disposers.reverse()) dispose();
				removeStyle();
			};
		}, "xunji-workbench: integrated workspace lifecycle");
	}
	//#endregion
	exports.apply = apply;
	exports.inject = inject;
	return exports;
})({}, react, react_jsx_runtime);

return XunjiWorkbench; }});
//# sourceMappingURL=client.js.map