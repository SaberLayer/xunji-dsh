import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { AUTO_ROUTING_PROMPT } from './client/workflows.js'

/** Host 侧注册稳定的资料路由提示词；所有交互位于单独发现的 Web 客户端模块。 */
export const inject = ['systemPrompt']

export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'xunji:auto-routing',
    order: 180,
    text: AUTO_ROUTING_PROMPT,
  })
}
