import * as vscode from 'vscode'
import type { AgentilsClient } from '@agent-ils/mcp/client'
import type { ToolName } from '@agent-ils/mcp/types'
import type { Logger } from '@agent-ils/logger'
import type { AgentilsWebviewManager } from '../webview/manager.js'
import { createExtensionLogger } from '../logging.js'
import { buildCancelledToolResult, buildHeartbeatTimeoutToolResult, buildToolResultFromResponse } from './toolResult.js'

interface ToolInput {
    question?: string
    context?: string
    placeholder?: string
    action?: string
    params?: Record<string, unknown>
}

/**
 * Map between the LM tool id (registered in VS Code; prefixed to avoid
 * collisions with other extensions like justwe9517.human-clarification)
 * and the underlying mcp business toolName carried in the park payload.
 */
interface ToolBinding {
    lmId: string
    toolName: ToolName
    handlerName: 'clarification' | 'contact' | 'feedback' | 'dynamicAction'
    confirmationLabel: string
}

const TOOL_BINDINGS: ToolBinding[] = [
    {
        lmId: 'agentils_request_user_clarification',
        toolName: 'request_user_clarification',
        handlerName: 'clarification',
        confirmationLabel: '与用户进行澄清',
    },
    {
        lmId: 'agentils_request_contact_user',
        toolName: 'request_contact_user',
        handlerName: 'contact',
        confirmationLabel: '联系用户',
    },
    {
        lmId: 'agentils_request_user_feedback',
        toolName: 'request_user_feedback',
        handlerName: 'feedback',
        confirmationLabel: '与用户进行反馈沟通',
    },
    {
        lmId: 'agentils_request_dynamic_action',
        toolName: 'request_dynamic_action',
        handlerName: 'dynamicAction',
        confirmationLabel: '执行动态操作',
    },
]

export const REGISTERED_LM_IDS = TOOL_BINDINGS.map((b) => b.lmId)

export function registerTools(
    context: vscode.ExtensionContext,
    client: AgentilsClient,
    webview: AgentilsWebviewManager,
    channel: vscode.OutputChannel,
): void {
    const log = createExtensionLogger(channel, 'tools')
    log.info('tool registration begin', {
        operation: 'tool.registration.begin',
        count: TOOL_BINDINGS.length,
        lmIds: REGISTERED_LM_IDS,
    })
    for (const binding of TOOL_BINDINGS) {
        const disposable = registerOneTool(binding, log, client, webview)
        if (disposable) context.subscriptions.push(disposable)
    }
    log.info('tool registration end', {
        operation: 'tool.registration.end',
        count: TOOL_BINDINGS.length,
        lmIds: REGISTERED_LM_IDS,
    })
}

function registerOneTool(
    binding: ToolBinding,
    log: Logger,
    client: AgentilsClient,
    webview: AgentilsWebviewManager,
): vscode.Disposable | undefined {
    const { lmId, toolName } = binding
    try {
        return vscode.lm.registerTool<ToolInput>(lmId, {
            async invoke(options, _token) {
                const traceId = `lm-${lmId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
                const input = options.input ?? {}
                const normalized = normalizeToolInput(binding, input)
                const baseFields = {
                    traceId,
                    lmId,
                    toolName,
                    handler: binding.handlerName,
                }

                log.info('tool invocation begin', {
                    ...baseFields,
                    operation: 'tool.invoke.begin',
                    input,
                    qLen: normalized.question.length,
                })

                if (!normalized.question) {
                    log.warn('tool invocation missing question', {
                        ...baseFields,
                        operation: 'tool.invoke.validation',
                    })
                    throw new Error(`${toolName}: missing 'question'`)
                }

                log.info('tool delegate decision', {
                    ...baseFields,
                    operation: `handler.${binding.handlerName}.delegateDecision`,
                    delegated: false,
                    stateOwner: 'mcp',
                })
                webview.ensurePanel()

                try {
                    const response = await client.park({
                        toolName,
                        question: normalized.question,
                        context: normalized.context,
                        placeholder: normalized.placeholder,
                        action: normalized.action,
                        params: normalized.params,
                    })

                    log.info('tool invocation end', {
                        ...baseFields,
                        operation: 'tool.invoke.end',
                        textLen: (response.text ?? '').length,
                        cancelled: !!response.cancelled,
                        imageCount: response.images?.length ?? 0,
                    })
                    return buildToolResultFromResponse(response, log, baseFields)
                } catch (err) {
                    const msg = (err as Error).message
                    log.warn('tool invocation error', {
                        ...baseFields,
                        operation: 'tool.invoke.error',
                        error: msg,
                    })
                    if (msg === 'cancelled') {
                        return buildCancelledToolResult(log, baseFields)
                    }
                    if (msg === 'heartbeat-timeout') {
                        return buildHeartbeatTimeoutToolResult(log, baseFields)
                    }
                    throw err
                }
            },
            async prepareInvocation(options, _token) {
                log.info('prepare invocation begin', {
                    operation: 'lm.prepareInvocation.begin',
                    lmId,
                    toolName,
                    input: options.input,
                })
                const confirmation = {
                    confirmationMessages: {
                        title: 'AgentILS 授权申请',
                        message: `是否允许 AgentILS ${binding.confirmationLabel}？`,
                    },
                }
                log.info('prepare invocation end', {
                    operation: 'lm.prepareInvocation.end',
                    lmId,
                    toolName,
                    confirmationLabel: binding.confirmationLabel,
                })
                return {
                    ...confirmation,
                }
            },
        })
    } catch (err) {
        const msg = (err as Error).message
        if (/already registered/i.test(msg)) {
            log.warn('tool registration skipped already registered', {
                operation: 'tool.registration.skip',
                lmId,
                toolName,
                error: msg,
            })
            return undefined
        }
        throw err
    }
}

function normalizeToolInput(binding: ToolBinding, input: ToolInput): Required<Pick<ToolInput, 'question'>> & ToolInput {
    if (binding.toolName !== 'request_dynamic_action') {
        return {
            question: stringOrEmpty(input.question),
            context: optionalString(input.context),
            placeholder: optionalString(input.placeholder),
        }
    }

    const params = isRecord(input.params) ? input.params : {}
    const action = stringOrEmpty(input.action)
    return {
        question:
            optionalString(params.question) ??
            optionalString(input.question) ??
            optionalString(params.prompt) ??
            (action ? `dynamic:${action}` : ''),
        context: optionalString(params.context) ?? optionalString(input.context),
        placeholder: optionalString(params.placeholder) ?? optionalString(input.placeholder),
        action,
        params,
    }
}

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined
}

function stringOrEmpty(value: unknown): string {
    return optionalString(value) ?? ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}
