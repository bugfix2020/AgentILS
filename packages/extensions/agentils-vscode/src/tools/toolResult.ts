import * as vscode from 'vscode'
import type { Logger } from '@agent-ils/logger'
import type { InteractionResponse } from '@agent-ils/mcp/types'

interface ResultFields {
    traceId?: string
    lmId?: string
    toolName?: string
}

interface ImageLike {
    data?: string
    mimeType?: string
    filename?: string
}

export function buildCancelledToolResult(log: Logger, fields: ResultFields = {}): vscode.LanguageModelToolResult {
    const payload = {
        cancelled: true,
        message: 'User cancelled the operation',
    }
    log.info('tool result cancelled', {
        ...fields,
        operation: 'tool.result.cancelled',
        wrapper: 'vscode.LanguageModelToolResult',
    })
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2))])
}

export function buildHeartbeatTimeoutToolResult(
    log: Logger,
    fields: ResultFields = {},
): vscode.LanguageModelToolResult {
    const payload = {
        cancelled: true,
        reason: 'heartbeat-timeout',
        message: 'Interaction timed out (no heartbeat).',
    }
    log.warn('tool result heartbeat timeout', {
        ...fields,
        operation: 'tool.result.timeout',
        wrapper: 'vscode.LanguageModelToolResult',
    })
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2))])
}

export function buildToolResultFromResponse(
    response: InteractionResponse,
    log: Logger,
    fields: ResultFields = {},
): vscode.LanguageModelToolResult {
    log.info('tool result build begin', {
        ...fields,
        operation: 'tool.result.begin',
        cancelled: !!response.cancelled,
        textLen: (response.text ?? '').length,
        imageCount: response.images?.length ?? 0,
    })

    if (response.cancelled) return buildCancelledToolResult(log, fields)

    const parts: Array<vscode.LanguageModelTextPart | vscode.LanguageModelDataPart> = [
        new vscode.LanguageModelTextPart(response.text ?? ''),
    ]

    for (const image of response.images ?? []) {
        const parsed = parseImage(image as ImageLike)
        if (!parsed) {
            log.warn('tool result skipped invalid image', {
                ...fields,
                operation: 'tool.result.image.skip',
                filename: (image as ImageLike).filename,
            })
            continue
        }
        parts.push(new vscode.LanguageModelDataPart(parsed.bytes, parsed.mimeType))
    }

    const result = new vscode.LanguageModelToolResult(parts)
    log.info('tool result build end', {
        ...fields,
        operation: 'tool.result.end',
        wrapper: 'vscode.LanguageModelToolResult',
        textLen: (response.text ?? '').length,
        imageCount: Math.max(0, parts.length - 1),
    })
    return result
}

function parseImage(image: ImageLike): { bytes: Uint8Array; mimeType: string } | undefined {
    if (!image.data) return undefined
    const dataUrl = image.data.match(/^data:([^;]+);base64,(.+)$/)
    const mimeType = dataUrl?.[1] ?? image.mimeType ?? 'image/png'
    const base64 = dataUrl?.[2] ?? image.data
    try {
        return { bytes: new Uint8Array(Buffer.from(base64, 'base64')), mimeType }
    } catch {
        return undefined
    }
}
