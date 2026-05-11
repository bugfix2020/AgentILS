import { defineNode, defineWorkflow } from '@agent-ils/workflow-sdk'

export interface ApiKeyWorkflowContext {
    requestId: string
    apiKeyId: string
    apiKeyName: string
    smsCode: string
    smsVerified: boolean
    systemCode: string
    systemVerified: boolean
    envCode: string
    envVerified: boolean
    fullApiKey: string
    revealedAt: number
}

export interface NodeIconConfig {
    icon: string
}

function fakeDelay(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
}

const MOCK_SMS_CODE = '123456'
const MOCK_SYSTEM_CODE = 'ABC123'
const MOCK_ENV_CODE = 'PASS'
const MOCK_API_KEYS: Record<string, string> = {
    'key-001': 'sk-prod-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
    'key-002': 'sk-stag-z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4',
    'key-003': 'sk-test-f1e2d3c4b5a6978869504132475869ab',
}

export const smsVerifyNode = defineNode<ApiKeyWorkflowContext, NodeIconConfig>({
    id: 'sms-verify',
    name: '短信验证码',
    description: '请输入发送至您手机号的 6 位短信验证码',
    config: { icon: 'ChatDotRound' },
    run: async (ctx) => {
        await fakeDelay(500)
        if (!ctx.smsCode) return { type: 'stop' as const, reason: 'NEED_SMS_CODE' }
        if (ctx.smsCode !== MOCK_SMS_CODE) return { type: 'stop' as const, reason: '短信验证码错误，请重新输入' }
        return { type: 'continue' as const, patch: { smsVerified: true, requestId: `req_${Date.now()}` } }
    },
})

export const systemCodeNode = defineNode<ApiKeyWorkflowContext, NodeIconConfig>({
    id: 'system-code',
    name: '系统安全码',
    description: '请输入系统分配的安全码以继续操作',
    config: { icon: 'Lock' },
    run: async (ctx) => {
        await fakeDelay(400)
        if (!ctx.systemCode) return { type: 'stop' as const, reason: 'NEED_SYSTEM_CODE' }
        if (ctx.systemCode !== MOCK_SYSTEM_CODE) return { type: 'stop' as const, reason: '系统安全码错误，请重新输入' }
        return { type: 'continue' as const, patch: { systemVerified: true } }
    },
})

export const envCheckNode = defineNode<ApiKeyWorkflowContext, NodeIconConfig>({
    id: 'env-check',
    name: '环境安全检测',
    description: '检测当前操作环境的安全性，请输入环境检测码',
    config: { icon: 'Monitor' },
    run: async (ctx) => {
        await fakeDelay(600)
        if (!ctx.envCode) return { type: 'stop' as const, reason: 'NEED_ENV_CODE' }
        if (ctx.envCode !== MOCK_ENV_CODE) return { type: 'stop' as const, reason: '环境安全检测未通过，请重试' }
        return { type: 'continue' as const, patch: { envVerified: true } }
    },
})

export const revealKeyNode = defineNode<ApiKeyWorkflowContext, NodeIconConfig>({
    id: 'reveal-key',
    name: '展示密钥',
    description: '所有验证通过，正在解密并展示完整 API 密钥',
    config: { icon: 'Key' },
    run: async (ctx) => {
        await fakeDelay(300)
        const fullKey = MOCK_API_KEYS[ctx.apiKeyId] ?? 'sk-unknown'
        return { type: 'continue' as const, patch: { fullApiKey: fullKey, revealedAt: Date.now() } }
    },
})

export const apiKeyWorkflow = defineWorkflow<ApiKeyWorkflowContext>({
    id: 'api-key-reveal',
    nodes: [smsVerifyNode, systemCodeNode, envCheckNode, revealKeyNode],
})

export const STEP_CONFIGS = [
    { field: 'smsCode' as const, hint: '123456', placeholder: '请输入 6 位短信验证码' },
    { field: 'systemCode' as const, hint: 'ABC123', placeholder: '请输入系统安全码' },
    { field: 'envCode' as const, hint: 'PASS', placeholder: '请输入环境检测码' },
]
