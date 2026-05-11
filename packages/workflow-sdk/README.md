# AgentILS Workflow SDK

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white">
  <img alt="tsup" src="https://img.shields.io/badge/tsup-ESM-7C3AED">
  <img alt="React" src="https://img.shields.io/badge/React-18%2B-61DAFB?logo=react&logoColor=black">
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3%2B-4FC08D?logo=vue.js&logoColor=white">
</p>

<p align="center">
  English | <a href="./README.zh-CN.md">简体中文</a>
</p>

`@agent-ils/workflow-sdk` is a framework-agnostic workflow execution engine. Define multi-step workflows as arrays of nodes, run them with context passing and patch-based state updates, and optionally integrate with React hooks or Vue 3 composables for reactive UI state.

It does **not** provide a visual editor, persistence, or a server runtime — it is a lightweight client-side orchestration layer.

## Install

pnpm:

```sh
pnpm add @agent-ils/workflow-sdk
```

npm:

```sh
npm install @agent-ils/workflow-sdk
```

yarn:

```sh
yarn add @agent-ils/workflow-sdk
```

## Quick Start

```ts
import { defineNode, defineWorkflow, createWorkflow } from '@agent-ils/workflow-sdk'

const workflow = createWorkflow(
    defineWorkflow({
        id: 'my-workflow',
        nodes: [
            defineNode({
                id: 'double',
                run: async (ctx) => ({ type: 'continue', patch: { value: ctx.value * 2 } }),
            }),
            defineNode({
                id: 'add',
                run: async (ctx) => ({ type: 'continue', patch: { value: ctx.value + 10 } }),
            }),
        ],
    }),
)

const result = await workflow.run({ initialContext: { value: 5 } })
console.log(result.status) // 'done'
console.log(result.context.value) // 20
```

## React

```sh
pnpm add @agent-ils/workflow-sdk react
```

```tsx
import { useWorkflow } from '@agent-ils/workflow-sdk/react'
import { defineNode, defineWorkflow } from '@agent-ils/workflow-sdk'

const definition = defineWorkflow({
    id: 'counter',
    nodes: [
        defineNode({
            id: 'inc',
            run: async (ctx) => ({ type: 'continue', patch: { count: ctx.count + 1 } }),
        }),
    ],
})

function App() {
    const { status, start, abort } = useWorkflow({ definition })

    return (
        <button onClick={() => start({ count: 0 })} disabled={status === 'running'}>
            {status}
        </button>
    )
}
```

## Vue 3

```sh
pnpm add @agent-ils/workflow-sdk vue
```

```vue
<script setup>
import { useWorkflow } from '@agent-ils/workflow-sdk/vue'
import { defineNode, defineWorkflow } from '@agent-ils/workflow-sdk'

const definition = defineWorkflow({
    id: 'counter',
    nodes: [
        defineNode({
            id: 'inc',
            run: async (ctx) => ({ type: 'continue', patch: { count: ctx.count + 1 } }),
        }),
    ],
})

const { status, start, abort } = useWorkflow({ definition })
</script>

<template>
    <button :disabled="status === 'running'" @click="start({ count: 0 })">
        {{ status }}
    </button>
</template>
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
