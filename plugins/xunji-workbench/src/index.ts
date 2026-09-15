import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { routingPromptWith } from './client/workflows.js'

// Host 侧运行在 DSH 的 Node 进程里；插件不引入 Node 类型，这里只声明用到的部分
declare const process: { readonly env: Record<string, string | undefined> }

/** Host 侧注册稳定的资料路由提示词；所有交互位于单独发现的 Web 客户端模块。 */
export const inject = ['systemPrompt']

export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'xunji:auto-routing',
    order: 180,
    // 每次组装提示词时读取环境：固定规则之后附上已登记的 MasterGo 设计稿（保存配置后重启生效）
    text: () => routingPromptWith(process.env),
  })
}
