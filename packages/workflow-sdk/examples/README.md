# Workflow SDK Examples

## 基本示例

### basic.ts

展示了基本的 workflow 定义和使用：

- 4 个节点的简单工作流
- 数据在节点间传递和转换
- 错误处理和条件停止

```typescript
import { workflow } from './basic'

// 执行 workflow
const result = await workflow.run({
    initialContext: { input: 'hello' },
})
```

### React 示例

#### react-example.tsx

展示如何在 React 组件中使用 workflow：

```tsx
import { useWorkflow } from '@agent-ils/workflow-sdk/react'
import { workflow } from './basic'

function MyComponent() {
    const { status, start } = useWorkflow({
        definition: workflow,
    })

    const handleSubmit = async () => {
        const result = await start({ input: 'hello' })
        console.log(result)
    }

    return (
        <div>
            <button onClick={handleSubmit}>Start</button>
            <div>Status: {status}</div>
        </div>
    )
}
```

### Vue 示例

#### vue-example.vue

展示如何在 Vue 3 组件中使用 workflow：

```vue
<template>
    <div>
        <button @click="handleSubmit">Start</button>
        <div>Status: {{ status }}</div>
    </div>
</template>

<script setup>
import { useWorkflow } from '@agent-ils/workflow-sdk/vue'
import { workflow } from './basic'

const { status, start } = useWorkflow({
    definition: workflow,
})

const handleSubmit = async () => {
    const result = await start({ input: 'hello' })
    console.log(result)
}
</script>
```

### Hook 示例

#### hooks-example.ts

展示如何使用 before/after hook 监控 workflow 执行：

```typescript
import { runWithHooks } from './hooks-example'

// 执行带有钩子的 workflow
const { result, events } = await runWithHooks()

// events 包含所有执行事件
```

## 核心概念

1. **节点定义**: 使用 `defineNode` 定义节点
2. **工作流定义**: 使用 `defineWorkflow` 定义工作流
3. **创建实例**: 使用 `createWorkflow` 创建可执行的工作流实例
4. **执行工作流**: 调用 `run` 方法并传入初始 context
5. **钩子使用**: 使用 before/after hook 监控执行

## 运行示例

```bash
# 安装依赖
pnpm install

# 构建 SDK
pnpm --filter @agent-ils/workflow-sdk build

# 运行测试
pnpm --filter @agent-ils/workflow-sdk test

# 运行特定测试
pnpm --filter @agent-ils/workflow-sdk test:core
pnpm --filter @agent-ils/workflow-sdk test:react
pnpm --filter @agent-ils/workflow-sdk test:vue
```
