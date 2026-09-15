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
		instruction: "只使用 MasterGo Magic MCP 读取设计上下文，结合当前项目规范给出可实施结果；不得修改画布、文件、变量或组件库。用户给出设计稿链接时直接用该链接调用工具；用户只说设计稿名称时，从“已登记的 MasterGo 设计稿”里取对应链接，先用 mcp__getPageLayers 按名称找到页面或图层，再用 mcp__getDesignSections 读取；名称不在登记表里时请用户提供链接，不要猜。"
	},
	{
		id: "confluence",
		label: "Confluence",
		instruction: "优先使用已启用的 Confluence 只读工具检索规范，并保留页面来源。调用 confluence_search 时必须传入有效 CQL：关键词检索使用 `siteSearch ~ \"关键词\"`（例如 `siteSearch ~ \"订单退款\"`），不要把裸关键词或单独带引号的词当作查询。"
	}
];
/**
* 注入 Host 的资料路由提示词。
*
* 各来源的操作要点必须在这里出现：这是唯一送达模型的通道。此前它们只存在于
* 前端的提示词拼装函数里，该函数停用后规则就静默失效了。
*/
const AUTO_ROUTING_PROMPT = [
	"资料路由：仅在当前可见的已启用工具能够提供依据时，按问题内容主动检索，不要求用户手动指定来源。",
	SOURCES[0].instruction,
	"各来源要点（仅适用于当前已启用者）：",
	...SOURCES.filter((source) => source.id !== "auto").map((source) => `- ${source.label}：${source.instruction}`),
	"所有资料工具均为只读。回答中说明实际使用的资料来源；没有可用依据时明确说明，不要猜测。"
].join("\n");
/** 解析“名称=链接;名称=链接”格式的设计稿登记表；无效条目忽略。 */
function parseMasterGoFiles(value) {
	return (value ?? "").split(";").map((entry) => entry.trim()).filter(Boolean).flatMap((entry) => {
		const separator = entry.indexOf("=");
		if (separator <= 0) return [];
		const name = entry.slice(0, separator).trim();
		const link = entry.slice(separator + 1).trim();
		return name && /^https:\/\//i.test(link) ? [{
			name,
			link
		}] : [];
	});
}
/** Host 实际注入的路由提示词：在固定规则后附上已登记的设计稿，让模型能按名称定位文件。 */
function routingPromptWith(environment) {
	const files = parseMasterGoFiles(environment.XUNJI_MASTERGO_FILES);
	if (!files.length) return AUTO_ROUTING_PROMPT;
	return `${AUTO_ROUTING_PROMPT}\n已登记的 MasterGo 设计稿（用户提到名称时使用对应链接）：\n${files.map((file) => `- ${file.name}：${file.link}`).join("\n")}`;
}
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
		variables: ["MG_MCP_TOKEN", "XUNJI_MASTERGO_FILES"],
		fields: [
			{
				key: "MG_MCP_TOKEN",
				label: "个人访问令牌",
				placeholder: "MasterGo token",
				secret: true
			},
			{
				key: "MASTERGO_API_BASE_URL",
				label: "服务地址",
				placeholder: "https://mastergo.com",
				optional: true
			},
			{
				key: "XUNJI_MASTERGO_FILES",
				label: "登记设计稿",
				placeholder: "商城后台=https://mastergo.com/file/…；多个用英文分号分隔",
				optional: true
			}
		],
		help: {
			label: "查看 Magic MCP 官方说明",
			href: "https://mastergo.com/help/ai-features/magic-mcp.html",
			steps: [
				"登录 MasterGo，进入个人设置",
				"在“安全设置”生成个人访问令牌",
				"确认账号为团队版且设计文件位于有权限的团队项目",
				"Magic MCP 没有搜索：把常用设计文件按“名称=链接”登记后，提问时说名称即可，不必每次贴链接"
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
export { AUTO_ROUTING_PROMPT, CONFIGURATION_GUIDES, CONNECTORS, SOURCES, connectorPhases, parseMasterGoFiles, routingPromptWith };

//# sourceMappingURL=workflows.js.map