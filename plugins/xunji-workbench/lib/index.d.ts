import { Context } from "@deepseek-ai/cordis";
//#region src/index.d.ts
/** Host 侧注册稳定的资料路由提示词；所有交互位于单独发现的 Web 客户端模块。 */
declare const inject: string[];
declare function apply(ctx: Context): void;
//#endregion
export { apply, inject };
//# sourceMappingURL=index.d.ts.map