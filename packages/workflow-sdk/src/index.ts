// Core exports
export * from './core'

// Framework-specific exports (avoid name conflicts)
export {
    useWorkflow as useReactWorkflow,
    type UseWorkflowOptions as UseReactWorkflowOptions,
    type UseWorkflowReturn as UseReactWorkflowReturn,
} from './react'

export {
    useWorkflow as useVueWorkflow,
    type UseWorkflowOptions as UseVueWorkflowOptions,
    type UseWorkflowReturn as UseVueWorkflowReturn,
} from './vue'
