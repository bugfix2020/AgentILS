import { defineNode, defineWorkflow } from '@agent-ils/workflow-sdk'

export interface AuthWorkflowContext {
    requestId: string
    code: string
    secretData: string
    fetchedAt: number
    completed: boolean
}

function fakeDelay(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
}

const MOCK_CODE = '123456'
const MOCK_SECRET = '机密文档内容：2026 年 Q3 产品路线图 ...'

export const initNode = defineNode<AuthWorkflowContext>({
    id: 'init',
    name: '初始化',
    run: async () => {
        await fakeDelay(500)
        return {
            type: 'continue',
            patch: { requestId: `req_${Date.now()}` },
        }
    },
})

export const verifyNode = defineNode<AuthWorkflowContext>({
    id: 'verify',
    name: '身份验证',
    run: async (ctx) => {
        await fakeDelay(300)
        if (ctx.code !== MOCK_CODE) {
            return {
                type: 'stop',
                reason: `验证码错误：输入 "${ctx.code}"，期望 "${MOCK_CODE}"`,
            }
        }
        return { type: 'continue' }
    },
})

export const fetchDataNode = defineNode<AuthWorkflowContext>({
    id: 'fetch-data',
    name: '获取数据',
    run: async () => {
        await fakeDelay(800)
        return {
            type: 'continue',
            patch: {
                secretData: MOCK_SECRET,
                fetchedAt: Date.now(),
            },
        }
    },
})

export const completeNode = defineNode<AuthWorkflowContext>({
    id: 'complete',
    name: '完成',
    run: async () => {
        return { type: 'continue', patch: { completed: true } }
    },
})

export const authWorkflow = defineWorkflow<AuthWorkflowContext>({
    id: 'auth-view-secret',
    nodes: [initNode, verifyNode, fetchDataNode, completeNode],
})
