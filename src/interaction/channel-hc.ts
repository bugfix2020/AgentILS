// src/interaction/channel-hc.ts

import { INTERACTION_DEFAULTS } from '../config/defaults.js'

const log = (...args: unknown[]) => console.error('[channel-hc]', ...args)

export type HcResponse = {
  text: string
  images?: Array<{ filename: string; data: string }>
  cancelled?: boolean
}

/** 检查 HC 扩展 HTTP API 是否可用 */
export async function isHcAvailable(): Promise<boolean> {
  try {
    const url = `http://${INTERACTION_DEFAULTS.hcHttpHost}:${INTERACTION_DEFAULTS.hcHttpPort}/health`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(INTERACTION_DEFAULTS.hcHealthTimeout),
    })
    return res.ok
  } catch {
    return false
  }
}

/** 通过 HC 扩展 HTTP API 收集用户输入 */
export async function elicitViaHc(
  toolName: string,
  question: string,
  context?: string,
  placeholder?: string,
): Promise<HcResponse> {
  const url = `http://${INTERACTION_DEFAULTS.hcHttpHost}:${INTERACTION_DEFAULTS.hcHttpPort}/api/tool`
  log('POST', url, 'tool:', toolName)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toolName,
      input: { question, context, placeholder },
    }),
  })

  if (!res.ok) {
    throw new Error(`HC API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as HcResponse
  log('HC response:', data.text?.slice(0, 100), 'cancelled:', data.cancelled)
  return data
}
