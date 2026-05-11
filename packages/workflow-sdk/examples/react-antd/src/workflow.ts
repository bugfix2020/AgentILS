import { defineNode, defineWorkflow } from '@agent-ils/workflow-sdk'

// ── Context 类型 ──────────────────────────────────────────
export interface AuthWorkflowContext {
    // init
    requestId: string
    // verify (用户输入)
    code: string
    // fetch-data
    secretData: string
    fetchedAt: number
    // complete
    completed: boolean
}

// ── 模拟 API ─────────────────────────────────────────────
function fakeDelay(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
}

const MOCK_CODE = '123456'
const MOCK_SECRET = '机密文档内容：2026 年 Q3 产品路线图 ...'

// ── 节点定义 ─────────────────────────────────────────────

/** 1. init — 模拟向后端请求验证码 session */
export const initNode = defineNode<AuthWorkflowContext>({
    id: 'init',
    name: '初始化',
    run: async (_ctx) => {
        await fakeDelay(500)
        return {
            type: 'continue',
            patch: {
                requestId: `req_${Date.now()}`,
            },
        }
    },
})

/** 2. verify — 校验用户输入的验证码
 *  关键：验证码不匹配时返回 stop signal，后续节点不会执行 */
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

/** 3. fetch-data — 验证通过，拉取敏感数据 */
export const fetchDataNode = defineNode<AuthWorkflowContext>({
    id: 'fetch-data',
    name: '获取数据',
    run: async (_ctx) => {
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

/** 4. complete — 标记完成 */
export const completeNode = defineNode<AuthWorkflowContext>({
    id: 'complete',
    name: '完成',
    run: async () => {
        return {
            type: 'continue',
            patch: { completed: true },
        }
    },
})

// ── 工作流定义 ───────────────────────────────────────────
export const authWorkflow = defineWorkflow<AuthWorkflowContext>({
    id: 'auth-view-secret',
    nodes: [initNode, verifyNode, fetchDataNode, completeNode],
})
