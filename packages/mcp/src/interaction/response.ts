import type { InteractionImage, InteractionResponse } from '../types/index.js'

const CANCEL_MESSAGE = 'User cancelled the operation'
const TIMEOUT_MESSAGE = 'Interaction timed out (no heartbeat).'

export function normalizeInteractionResponse(input: unknown, now = Date.now()): InteractionResponse {
    const body = isRecord(input) ? input : {}
    const cancelled = body.cancelled === true
    const reason = typeof body.reason === 'string' ? body.reason : cancelled ? 'cancelled' : undefined
    const timestamp = typeof body.timestamp === 'number' && Number.isFinite(body.timestamp) ? body.timestamp : now
    const response: InteractionResponse = {
        text: normalizeText(body.text),
        timestamp,
    }
    const images = normalizeImages(body.images)
    if (images.length > 0) response.images = images
    if (typeof body.reportContent === 'string' || body.reportContent === null) {
        response.reportContent = body.reportContent
    }
    if (cancelled) response.cancelled = true
    if (reason) response.reason = reason
    return response
}

export function cancelledInteractionResponse(now = Date.now()): InteractionResponse {
    return {
        text: '',
        cancelled: true,
        reason: 'cancelled',
        timestamp: now,
    }
}

export function timeoutInteractionResponse(now = Date.now()): InteractionResponse {
    return {
        text: '',
        cancelled: true,
        reason: 'heartbeat-timeout',
        timestamp: now,
    }
}

export function textForLlm(response: InteractionResponse): string {
    if (!response.cancelled) return response.text ?? ''
    return JSON.stringify({
        cancelled: true,
        reason: response.reason ?? 'cancelled',
        message: response.reason === 'heartbeat-timeout' ? TIMEOUT_MESSAGE : CANCEL_MESSAGE,
    })
}

function normalizeText(value: unknown): string {
    if (typeof value === 'string') return value
    if (value === null || typeof value === 'undefined') return ''
    try {
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

function normalizeImages(value: unknown): InteractionImage[] {
    if (!Array.isArray(value)) return []
    const images: InteractionImage[] = []
    for (const item of value) {
        if (!isRecord(item) || typeof item.data !== 'string') continue
        const image: InteractionImage = { data: item.data }
        if (typeof item.filename === 'string') image.filename = item.filename
        if (typeof item.mimeType === 'string') image.mimeType = item.mimeType
        images.push(image)
    }
    return images
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}
