//#region src/client/workflows.d.ts
type SourceId = 'auto' | 'local' | 'codebase' | 'conversation' | 'chatImport' | 'lark' | 'mastergo' | 'confluence';
type ConnectorId = Exclude<SourceId, 'auto'>;
type ConnectorPhase = 'active' | 'loading' | 'failed' | 'off';
interface InventoryEntry {
  readonly entryId: string;
  readonly moduleName: string;
  readonly enabled: boolean;
  readonly fiberPhase: 'pending' | 'loading' | 'active' | 'failed' | 'unloading' | null;
}
interface SourceDefinition {
  readonly id: SourceId;
  readonly label: string;
  readonly instruction: string;
}
interface ConnectorDefinition {
  readonly id: ConnectorId;
  readonly label: string;
  readonly description: string;
  readonly patterns: readonly string[];
}
interface ConfigurationGuide {
  readonly id: 'codebase' | 'conversation-archive' | 'chat-import' | 'lark' | 'mastergo' | 'confluence-dc';
  readonly connectorId: Exclude<ConnectorId, 'local'>;
  readonly label: string;
  readonly description: string;
  readonly readOnlyScope: string;
  readonly variables: readonly string[];
  readonly fields: readonly ConfigurationField[];
  readonly help: ConfigurationHelp;
}
interface ConfigurationField {
  readonly key: string;
  readonly label: string;
  readonly placeholder: string;
  readonly secret?: boolean;
  readonly optional?: boolean;
  /** 取值固定时改用下拉，避免手输错字。 */
  readonly choices?: readonly {
    readonly value: string;
    readonly label: string;
  }[];
}
interface ConfigurationHelp {
  readonly label: string;
  readonly href: string;
  readonly steps: readonly string[];
}
declare const SOURCES: readonly SourceDefinition[];
/**
 * 注入 Host 的资料路由提示词。
 *
 * 各来源的操作要点必须在这里出现：这是唯一送达模型的通道。此前它们只存在于
 * 前端的提示词拼装函数里，该函数停用后规则就静默失效了。
 */
declare const AUTO_ROUTING_PROMPT: string;
declare const CONNECTORS: readonly ConnectorDefinition[];
declare const CONFIGURATION_GUIDES: readonly ConfigurationGuide[];
declare function connectorPhases(entries: readonly InventoryEntry[]): Record<ConnectorId, ConnectorPhase>;
//#endregion
export { AUTO_ROUTING_PROMPT, CONFIGURATION_GUIDES, CONNECTORS, ConfigurationField, ConfigurationGuide, ConnectorId, ConnectorPhase, InventoryEntry, SOURCES, connectorPhases };
//# sourceMappingURL=workflows.d.ts.map