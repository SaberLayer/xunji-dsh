import { Context } from "@deepseek-ai/cordis";
//#region src/client/index.d.ts
declare const SOURCES_KEY = "xunji-sources";
type Evidence = {
  readonly label: string;
  readonly detail: string;
  readonly href?: string;
};
/** 每个回合内实际调用过的资料工具，按事件流累积后发布到回合数据。 */
interface XunjiSourcesTurnData {
  readonly sources: readonly string[];
  readonly evidence: readonly Evidence[];
}
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap {
    [SOURCES_KEY]: XunjiSourcesTurnData;
  }
}
declare const inject: string[];
declare function apply(ctx: Context): void;
//#endregion
export { apply, inject };