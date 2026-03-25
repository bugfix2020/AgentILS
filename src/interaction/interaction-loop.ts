// src/interaction/interaction-loop.ts

import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { INTERACTION_DEFAULTS } from '../config/defaults.js'
import { elicit } from './channel-mcp.js'
import { isHcAvailable, elicitViaHc } from './channel-hc.js'
import { isSamplingAvailable, tryCreateMessage } from './sampling-client.js'

const log = (...args: unknown[]) => console.error('[interaction-loop]', ...args)

export type LoopParams = {
  server: Server
  title: string
  question: string
  answer?: string
  channel?: 'auto' | 'mcp' | 'hc'
}

export type LoopResult = {
  feedbackRounds: number
  samplingUsed: boolean
  channel: 'mcp_elicit' | 'hc_webview'
}

/**
 * 核心交互循环。在一次工具调用内完成多轮用户反馈。
 * 外部看只有「一次工具调用」，内部 while(true) 劫持了执行流。
 */
export async function runInteractionLoop(params: LoopParams): Promise<LoopResult> {
  const { server, title } = params
  let { question, answer } = params
  const channelPref = params.channel ?? INTERACTION_DEFAULTS.channelDefault

  const hasSampling = isSamplingAvailable(server)
  const hcAvailable = channelPref !== 'mcp' && (await isHcAvailable())
  const useHc = channelPref === 'hc' ? hcAvailable : channelPref === 'auto' ? false : false
  const channelUsed: LoopResult['channel'] = useHc ? 'hc_webview' : 'mcp_elicit'

  log('loop start — sampling:', hasSampling, 'hc:', hcAvailable, 'channel:', channelUsed)

  let round = 0
  let samplingEverUsed = false
  const collectedFeedback: string[] = []

  while (round < INTERACTION_DEFAULTS.maxFeedbackRounds) {
    round++
    log(`round ${round}`)

    // 1. 构建展示消息
    const displayMessage = buildMessage(title, answer, question, round)

    // 2. 收集用户输入
    let userText: string
    if (useHc) {
      try {
        const hcRes = await elicitViaHc('request_user_feedback', question, answer)
        if (hcRes.cancelled) break
        userText = hcRes.text.trim()
      } catch (err) {
        log('HC channel failed, falling back to MCP:', err)
        const mcpRes = await elicit(server, displayMessage)
        if (mcpRes.action !== 'accept') break
        userText = mcpRes.text
      }
    } else {
      const mcpRes = await elicit(server, displayMessage)
      if (mcpRes.action !== 'accept') break
      userText = mcpRes.text
    }

    // 3. 用户留空 → 退出循环
    if (!userText) {
      log('EXIT: empty input at round', round)
      break
    }

    collectedFeedback.push(userText)

    // 4. 如果 sampling 可用，用 createMessage 反向借脑
    if (hasSampling) {
      const context = buildContext(title, collectedFeedback)
      const llmReply = await tryCreateMessage(server, userText, context)
      if (llmReply) {
        samplingEverUsed = true
        answer = llmReply
        question = '请继续提供反馈，或留空结束讨论：'
        continue
      }
    }

    // 5. sampling 不可用或失败 — 纯收集模式
    answer = `已收集 ${collectedFeedback.length} 条反馈：\n${collectedFeedback.map((f, i) => `${i + 1}. ${f}`).join('\n')}`
    question = '请继续提供反馈，或留空结束讨论：'
  }

  if (round >= INTERACTION_DEFAULTS.maxFeedbackRounds) {
    log('EXIT: max rounds reached')
  }

  log('loop end — rounds:', round, 'sampling used:', samplingEverUsed)
  return { feedbackRounds: round, samplingUsed: samplingEverUsed, channel: channelUsed }
}

function buildMessage(title: string, answer: string | undefined, question: string, round: number): string {
  const parts: string[] = [`**${title}**`, '']
  if (answer) {
    parts.push(answer, '')
  }
  parts.push(question)
  if (round > 1) {
    parts.push('', `_(第 ${round} 轮反馈)_`)
  }
  return parts.join('\n')
}

function buildContext(title: string, feedback: string[]): string {
  const parts = [`任务：${title}`, '', '已收集的反馈历史：']
  feedback.forEach((f, i) => parts.push(`[${i + 1}] ${f}`))
  return parts.join('\n')
}
