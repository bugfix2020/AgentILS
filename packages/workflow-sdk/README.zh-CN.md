# AgentILS Workflow SDK

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white">
  <img alt="tsup" src="https://img.shields.io/badge/tsup-ESM-7C3AED">
  <img alt="React" src="https://img.shields.io/badge/React-18%2B-61DAFB?logo=react&logoColor=black">
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3%2B-4FC08D?logo=vue.js&logoColor=white">
</p>

<p align="center">
  <a href="./README.md">English</a> | 简体中文
</p>

`@agent-ils/workflow-sdk` 是一个框架无关的工作流执行引擎。将多步骤工作流定义为节点数组，运行时通过 context 传递和 patch 更新状态，并可选用 React hooks 或 Vue 3 composables 接入响应式 UI。

它**不**提供可视化编辑器、持久化存储或服务端运行时——它是一个轻量级的客户端编排层。

## 安装

pnpm：

```sh
pnpm add @agent-ils/workflow-sdk
```

npm：

```sh
npm install @agent-ils/workflow-sdk
```

yarn：

```sh
yarn add @agent-ils/workflow-sdk
```

## 快速开始

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

### 核心

| 导出                      | 类型     | 说明                                |
| ------------------------- | -------- | ----------------------------------- |
| `defineNode(opts)`        | Function | 创建带类型节点的辅助函数            |
| `defineWorkflow(def)`     | Function | 创建带类型工作流定义的辅助函数      |
| `createWorkflow(def)`     | Function | 返回 `{ definition, run(options) }` |
| `applyPatch(ctx, patch?)` | Function | 浅合并 partial patch 到 context     |

### 节点 `run` 返回值 — `WorkflowSignal`

| 类型       | 字段                        | 效果                       |
| ---------- | --------------------------- | -------------------------- |
| `continue` | `patch?: Partial<TContext>` | 合并 patch，进入下一个节点 |
| `stop`     | `reason: string`, `patch?`  | 合并 patch，停止工作流     |

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
