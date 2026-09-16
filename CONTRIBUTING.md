# 参与开发

欢迎提 Issue 和 PR。开始前请先看 [开发指南](docs/开发指南.md)，里面有从源码运行、各资料源的配置方式和接入新资料源的步骤。

## 分支与提交

- `main` 是唯一的长期分支，始终保持可打包、测试全过。
- 改动从 `main` 切分支，命名随意但要能看出意图，例如 `feat/yuque-source`、`fix/import-dedupe`。
- 改完提 PR 到 `main`。CI 会跑体检、类型检查、插件构建和全部测试，绿了才合并。
- 提交说明用中文，第一行说清做了什么。

## 本地验证

```powershell
npm run check   # 体检 + 类型检查 + 构建插件 + 全部测试
```

改动涉及桌面外壳时再跑：

```powershell
cd shell
cargo test --locked
```

## 几条约定

- 所有资料源必须只读。接第三方 MCP 一律经 `scripts/mcp-readonly-proxy.mjs` 启动，并在白名单里只列读取类工具。
- 凭据只走环境变量，不进命令行参数、不进 YAML、不进日志。
- 界面文案只出现“寻迹助手”，`xunji` 只作为包名、CSS 类名和环境变量前缀等内部标识。
- 不提交 `.env`、`.dsh/`、截图里的真实数据；提交前跑一遍 `git status` 确认没有带上本机文件。
- 行为改动要有测试。现有测试在 `tests/`，能直接起进程验证的优先于只匹配源码文本的。

## 发布

发布由 GitHub Actions 完成：把 `package.json` 的 `version` 改成新版本并合并到 `main`，然后打同名标签推送，例如：

```powershell
git tag v0.1.1
git push origin v0.1.1
```

工作流会在干净的 Windows 机器上跑完整检查、构建应用目录、编译安装包，并自动创建 Release 挂上 `xunji-<版本>-setup.exe`。标签与版本号不一致时会直接失败。本机的 `npm run package` 与 `npm run package:installer` 只用于自测。
