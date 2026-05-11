/* eslint-disable no-console */
import { defineNode, defineWorkflow } from '../src/core'

// 定义节点
const startNode = defineNode<{ input: string }>({
    id: 'start',
    name: 'Start Node',
    run: (ctx) => {
        console.log('开始处理:', ctx.input)
        return {
            type: 'continue',
            patch: { step: 'started', timestamp: Date.now() },
        }
    },
})

const processNode = defineNode<{ input: string; step: string; timestamp: number }>({
    id: 'process',
    name: 'Process Node',
    run: (ctx) => {
        console.log('处理数据:', ctx.input)

        // 模拟异步处理
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    type: 'continue',
                    patch: {
                        step: 'processed',
                        result: ctx.input.toUpperCase(),
                        processingTime: Date.now() - ctx.timestamp,
                    },
                })
            }, 100)
        })
    },
})

const validateNode = defineNode<{
    input: string
    step: string
    result: string
    processingTime: number
}>({
    id: 'validate',
    name: 'Validate Node',
    run: (ctx) => {
        console.log('验证结果:', ctx.result)

        if (ctx.result.length === 0) {
            return {
                type: 'stop',
                reason: 'Empty result',
                patch: { error: 'Input cannot be empty' },
            }
        }

        return {
            type: 'continue',
            patch: {
                step: 'validated',
                isValid: true,
                summary: `Validated: ${ctx.result} (${ctx.processingTime}ms)`,
            },
        }
    },
})

const endNode = defineNode<{
    input: string
    step: string
    result: string
    processingTime: number
    isValid: boolean
    summary: string
}>({
    id: 'end',
    name: 'End Node',
    run: (ctx) => {
        console.log('完成处理:', ctx.summary)
        return {
            type: 'continue',
            patch: {
                completed: true,
                finalResult: ctx.summary,
            },
        }
    },
})

// 定义工作流
const workflow = defineWorkflow({
    id: 'basic-example',
    nodes: [startNode, processNode, validateNode, endNode],
})

// 导出
export { workflow, startNode, processNode, validateNode, endNode }
