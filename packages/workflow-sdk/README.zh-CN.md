# AgentILS Workflow SDK

<p align="center">
  <a href="https://www.npmjs.com/package/@agent-ils/workflow-sdk"><img alt="npm" src="https://img.shields.io/npm/v/@agent-ils/workflow-sdk?label=npm&color=CB3837"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white">
  <img alt="tsup" src="https://img.shields.io/badge/tsup-ESM-7C3AED">
  <img alt="React" src="https://img.shields.io/badge/React-18%2B-61DAFB?logo=react&logoColor=black">
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3%2B-4FC08D?logo=vue.js&logoColor=white">
</p>

<p align="center">
  <a href="https://github.com/bugfix2020/AgentILS/blob/main/packages/workflow-sdk/README.md">English</a> | 简体中文
</p>

`@agent-ils/workflow-sdk` 是一个框架无关的工作流执行引擎。将多步骤工作流定义为节点数组，运行时通过 context 传递和 patch 更新状态，并可选用 React hooks 或 Vue 3 composables 接入响应式 UI。

它**不**提供可视化编辑器、持久化存储或服务端运行时——它是一个轻量级的客户端编排层。

## 安装

```sh
pnpm add @agent-ils/workflow-sdk
```

框架适配层通过子路径导出：

- React：`@agent-ils/workflow-sdk/react`
- Vue：`@agent-ils/workflow-sdk/vue`

## 场景：鉴权后查看敏感数据

用户点击「查看敏感数据」→ 弹出验证码表单 → 验证码正确则拉取并展示数据，**验证码错误则工作流立即中断**——数据拉取不会执行。

```
init → verify → fetch-data → complete
                ↑
                └── 验证码错误 → stop（fetch-data 不会执行）
```

### 定义工作流

```ts
// workflow.ts
import { defineNode, defineWorkflow } from '@agent-ils/workflow-sdk'

export interface AuthContext {
    requestId: string
    code: string
    secretData: string
    fetchedAt: number
    completed: boolean
}

export const authWorkflow = defineWorkflow<AuthContext>({
    id: 'auth-view-secret',
    nodes: [
        defineNode({
            id: 'init',
            run: async () => ({
                type: 'continue',
                patch: { requestId: `req_${Date.now()}` },
            }),
        }),
        // 关键：验证码错误时返回 stop，后续节点不会执行
        defineNode({
            id: 'verify',
            run: async (ctx) => {
                if (ctx.code !== '123456') {
                    return { type: 'stop', reason: `验证码错误：${ctx.code}` }
                }
                return { type: 'continue' }
            },
        }),
        defineNode({
            id: 'fetch-data',
            run: async () => ({
                type: 'continue',
                patch: { secretData: '机密内容...', fetchedAt: Date.now() },
            }),
        }),
        defineNode({
            id: 'complete',
            run: async () => ({ type: 'continue', patch: { completed: true } }),
        }),
    ],
})
```

### React + Antd

```sh
pnpm add @agent-ils/workflow-sdk react antd
```

```tsx
import { useWorkflow } from '@agent-ils/workflow-sdk/react'
import { Steps, Button, Alert } from 'antd'
import { authWorkflow, type AuthContext } from './workflow'
import { VerifyForm } from './VerifyForm'
import { DataViewer } from './DataViewer'

function App() {
    const { status, start } = useWorkflow({ definition: authWorkflow })

    const handleVerify = async (code: string) => {
        const res = await start({
            requestId: '',
            code,
            secretData: '',
            fetchedAt: 0,
            completed: false,
        })
        if (res.status === 'stopped') {
            // 验证失败 — fetch-data 从未执行
            message.error(res.reason)
        }
    }

    return (
        <>
            <Steps
                current={status === 'done' ? 3 : status === 'stopped' ? 1 : 0}
                status={status === 'stopped' ? 'error' : 'process'}
            >
                <Step title="初始化" />
                <Step title="身份验证" />
                <Step title="获取数据" />
                <Step title="完成" />
            </Steps>
            {status === 'idle' && <VerifyForm onSubmit={handleVerify} />}
            {status === 'stopped' && <Alert type="error" description="验证失败" />}
            {status === 'done' && <DataViewer />}
        </>
    )
}
```

完整可运行项目：[`examples/react-antd/`](https://github.com/bugfix2020/AgentILS/tree/main/packages/workflow-sdk/examples/react-antd)

### Vue 3 + Element Plus

```sh
pnpm add @agent-ils/workflow-sdk vue element-plus
```

```vue
<script setup lang="ts">
import { useWorkflow } from '@agent-ils/workflow-sdk/vue'
import { authWorkflow, type AuthContext } from './workflow'

const { status, start, abort } = useWorkflow({ definition: authWorkflow })

async function handleVerify(code: string) {
    const res = await start({
        requestId: '',
        code,
        secretData: '',
        fetchedAt: 0,
        completed: false,
    })
    if (res.status === 'stopped') {
        ElMessage.error(res.reason)
    }
}
</script>

<template>
    <el-steps :active="status === 'done' ? 3 : status === 'stopped' ? 1 : 0">
        <el-step title="初始化" /><el-step title="身份验证" /> <el-step title="获取数据" /><el-step title="完成" />
    </el-steps>
    <VerifyForm v-if="status === 'idle'" @submit="handleVerify" />
    <el-alert v-if="status === 'stopped'" type="error" description="验证失败" />
    <DataViewer v-if="status === 'done'" />
</template>
```

完整可运行项目：[`examples/vue-element-plus/`](https://github.com/bugfix2020/AgentILS/tree/main/packages/workflow-sdk/examples/vue-element-plus)

## 中断工作流

有三种方式阻止后续节点执行：

### 1. `stop` 信号 — 受控中断

在节点的 `run` 中返回 `{ type: 'stop', reason: '...' }`。工作流立即中断，patch 仍然会被应用，`result.status === 'stopped'`。

```ts
defineNode({
    id: 'gate',
    run: async (ctx) => {
        if (!ctx.authorized) return { type: 'stop', reason: '未授权' }
        return { type: 'continue' }
    },
})
```

### 2. 抛出异常 — 意外失败

在 `run` 内部 `throw`。工作流捕获异常，设置 `result.status === 'failed'`，错误存储在 `result.error`。

```ts
defineNode({
    id: 'api-call',
    run: async (ctx) => {
        const res = await fetch(ctx.url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return { type: 'continue', patch: { data: await res.json() } }
    },
})
```

### 3. `AbortSignal` — 外部取消

通过 `run({ signal })` 传入 `AbortSignal`。引擎在节点之间检查是否已取消。

```ts
const ac = new AbortController()
setTimeout(() => ac.abort(), 5000)
const result = await workflow.run({ initialContext: {}, signal: ac.signal })
```

## API

### 核心

| 导出                      | 类型 | 说明                                |
| ------------------------- | ---- | ----------------------------------- |
| `defineNode(opts)`        | 函数 | 创建带类型节点的辅助函数            |
| `defineWorkflow(def)`     | 函数 | 创建带类型工作流定义的辅助函数      |
| `createWorkflow(def)`     | 函数 | 返回 `{ definition, run(options) }` |
| `applyPatch(ctx, patch?)` | 函数 | 浅合并 partial patch 到 context     |

### 节点 `run` 返回值 — `WorkflowSignal`

| 类型       | 字段                        | 效果                     |
| ---------- | --------------------------- | ------------------------ |
| `continue` | `patch?: Partial<TContext>` | 合并 patch，进入下个节点 |
| `stop`     | `reason: string`, `patch?`  | 合并 patch，停止工作流   |

### `run()` 参数

| 选项             | 类型                  | 说明                             |
| ---------------- | --------------------- | -------------------------------- |
| `initialContext` | `TContext`            | 必填，传给第一个节点的初始上下文 |
| `hook?`          | `{ before?, after? }` | 每个节点执行前后的生命周期回调   |
| `signal?`        | `AbortSignal`         | 节点间合作式取消                 |

### `run()` 返回值 — `WorkflowRunResult`

| 字段      | 类型                              | 说明                             |
| --------- | --------------------------------- | -------------------------------- |
| `status`  | `'done' \| 'stopped' \| 'failed'` | 终态                             |
| `context` | `TContext`                        | 最终上下文（含最后一次 patch）   |
| `reason?` | `string`                          | 当 `status === 'stopped'` 时存在 |
| `error?`  | `unknown`                         | 当 `status === 'failed'` 时存在  |

## 不做的事

- 不提供可视化工作流编辑器或 DAG UI。
- 不提供内置持久化、回放或时间旅行调试。
- 不提供服务端编排、队列或分布式执行。
- 不校验节点间的输入/输出 schema——类型安全由 TypeScript 编译期保证。
