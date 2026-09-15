import { AUTO_ROUTING_PROMPT } from "./workflows.js";
//#region src/index.ts
/** Host 侧注册稳定的资料路由提示词；所有交互位于单独发现的 Web 客户端模块。 */
const inject = ["systemPrompt"];
function apply(ctx) {
	ctx.systemPrompt.section({
		name: "xunji:auto-routing",
		order: 180,
		text: AUTO_ROUTING_PROMPT
	});
}
//#endregion
export { apply, inject };

//# sourceMappingURL=index.js.map