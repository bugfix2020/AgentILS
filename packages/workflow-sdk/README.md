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
  English | <a href="https://github.com/bugfix2020/AgentILS/blob/main/packages/workflow-sdk/README.zh-CN.md">简体中文</a>
</p>

`@agent-ils/workflow-sdk` is a framework-agnostic workflow execution engine. Define multi-step workflows as arrays of nodes, run them with context passing and patch-based state updates, and optionally integrate with React hooks or Vue 3 composables for reactive UI state.

It does **not** provide a visual editor, persistence, or a server runtime — it is a lightweight client-side orchestration layer.

## Install

```sh
pnpm add @agent-ils/workflow-sdk
```

## Scenario: Auth-Gated Data Access

A user clicks "View Secret Data" → a verification code form appears → if the code is correct, protected data is fetched and displayed. If the code is wrong, the workflow **stops immediately** — no data fetch happens.

```
init → verify → fetch-data → complete
                ↑
                └── wrong code → stop (fetch-data never runs)
```

### Define the workflow

```ts
// workflow.ts
import { defineNode, defineWorkflow } from '@agent-ils/workflow-sdk/core'

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
        // Key: verify returns { type: 'stop' } on wrong code
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
            // verification failed — fetch-data NEVER ran
            message.error(res.reason)
        }
    }

    return (
        <>
            <Steps
                current={status === 'done' ? 3 : status === 'stopped' ? 1 : 0}
                status={status === 'stopped' ? 'error' : 'process'}
            >
                <Step title="Init" />
                <Step title="Verify" />
                <Step title="Fetch" />
                <Step title="Done" />
            </Steps>
            {status === 'idle' && <VerifyForm onSubmit={handleVerify} />}
            {status === 'stopped' && <Alert type="error" description="Verification failed" />}
            {status === 'done' && <DataViewer />}
        </>
    )
}
```

Full runnable project: [`examples/react-antd/`](https://github.com/bugfix2020/AgentILS/tree/main/packages/workflow-sdk/examples/react-antd)

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
        <el-step title="Init" /><el-step title="Verify" /> <el-step title="Fetch" /><el-step title="Done" />
    </el-steps>
    <VerifyForm v-if="status === 'idle'" @submit="handleVerify" />
    <el-alert v-if="status === 'stopped'" type="error" description="Verification failed" />
    <DataViewer v-if="status === 'done'" />
</template>
```

Full runnable project: [`examples/vue-element-plus/`](https://github.com/bugfix2020/AgentILS/tree/main/packages/workflow-sdk/examples/vue-element-plus)

## Interrupting a Workflow

There are two ways to prevent downstream nodes from executing:

### 1. `stop` signal — controlled interruption

Return `{ type: 'stop', reason: '...' }` from any node's `run`. The workflow halts immediately, patches are still applied, and `result.status === 'stopped'`.

```ts
defineNode({
    id: 'gate',
    run: async (ctx) => {
        if (!ctx.authorized) return { type: 'stop', reason: 'Not authorized' }
        return { type: 'continue' }
    },
})
```

### 2. Thrown exception — unexpected failure

Throw inside `run`. The workflow catches it, sets `result.status === 'failed'`, and stores the error in `result.error`.

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

### 3. `AbortSignal` — external cancellation

Pass an `AbortSignal` via `run({ signal })`. The engine checks for abort between nodes.

```ts
const ac = new AbortController()
setTimeout(() => ac.abort(), 5000)
const result = await workflow.run({ initialContext: {}, signal: ac.signal })
```

## API

### Core

| Export                    | Kind     | Description                                              |
| ------------------------- | -------- | -------------------------------------------------------- |
| `defineNode(opts)`        | Function | Identity helper for creating a typed node                |
| `defineWorkflow(def)`     | Function | Identity helper for creating a typed workflow definition |
| `createWorkflow(def)`     | Function | Returns `{ definition, run(options) }`                   |
| `applyPatch(ctx, patch?)` | Function | Shallow-merge a partial patch into context               |

### Node `run` return — `WorkflowSignal`

| Type       | Fields                      | Effect                            |
| ---------- | --------------------------- | --------------------------------- |
| `continue` | `patch?: Partial<TContext>` | Merge patch, proceed to next node |
| `stop`     | `reason: string`, `patch?`  | Merge patch, stop workflow        |

### `run()` options

| Option           | Type                  | Description                                         |
| ---------------- | --------------------- | --------------------------------------------------- |
| `initialContext` | `TContext`            | Required. Starting context passed to the first node |
| `hook?`          | `{ before?, after? }` | Lifecycle callbacks around each node                |
| `signal?`        | `AbortSignal`         | Cooperative abort between node executions           |

### `run()` result — `WorkflowRunResult`

| Field     | Type                              | Description                         |
| --------- | --------------------------------- | ----------------------------------- |
| `status`  | `'done' \| 'stopped' \| 'failed'` | Terminal state                      |
| `context` | `TContext`                        | Final context after last patch      |
| `reason?` | `string`                          | Present when `status === 'stopped'` |
| `error?`  | `unknown`                         | Present when `status === 'failed'`  |

## What It Does NOT Do

- No visual workflow editor or DAG UI.
- No built-in persistence, replay, or time-travel debugging.
- No server-side orchestration, queuing, or distributed execution.
- No schema validation between node inputs/outputs — type safety is between you and TypeScript.
