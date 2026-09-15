# Xunji Workbench

Xunji DSH 的轻量产品层。左侧栏“新会话”下方的“溯源配置”按钮（`sidebar.panellist` + `main`）打开中央工作台页；会话中也可作为 DSH 原生右侧栏的同名标签（`sidebar.right.pane.tab`）并排查看；回合尾根据会话事件流标注实际检索来源与依据。

界面对外统一显示“寻迹助手”，不出现项目代号，也不覆盖 DSH 自带的 Hero 徽标；`xunji` 只保留为包名、CSS 类名、data 属性和环境变量前缀等内部标识。改文案时请同步 `tests/workbench.test.mjs` 中的去代号断言。

## 边界

- 连接状态读取官方只读插件清单，不保存凭据。
- 快捷工作流和资料策略只写入 DSH 原生输入草稿，由用户确认后通过官方输入框发送。
- 不直接调用企业 API，不修改 DSH 数据库，不查询私有 DOM。
- 快捷工作流只是透明的提示词模板，可在 `src/client/workflows.ts` 中审阅和调整。
