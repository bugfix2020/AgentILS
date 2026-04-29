export type ToolName =
    | 'request_user_clarification'
    | 'request_contact_user'
    | 'request_user_feedback'
    | 'request_dynamic_action'

export interface InteractionImage {
    filename?: string
    mimeType?: string
    data: string
}

export interface ReplyTemplate {
    name: string
    template: string
}

export interface ConnectionView {
    status: 'connecting' | 'ready' | 'degraded' | 'offline'
    baseUrl?: string
    error?: string
}

export interface ControlModeHistoryItem {
    mode: 'normal' | 'alternate' | 'direct'
    reason?: string
    timestamp?: number
}

export interface TaskView {
    id?: string
    title?: string
    stage: 'collect' | 'plan' | 'execute' | 'test' | 'summarize'
    controlMode: 'normal' | 'alternate' | 'direct'
    controlModeHistory: ControlModeHistoryItem[]
}

export interface StageContentView {
    collect: Record<string, unknown>
    plan: { conflicts: unknown[] } & Record<string, unknown>
    execute: Record<string, unknown>
    test: Record<string, unknown>
    summarize: Record<string, unknown>
}

export interface InteractionView {
    id: string
    toolName: ToolName
    question: string
    context?: string
    placeholder?: string
    status: 'pending' | 'submitted' | 'cancelled' | 'expired'
    createdAt: number
    attachments?: unknown[]
    schema?: Record<string, unknown>
}

export interface InteractionQueueView {
    activeId?: string
    items: InteractionView[]
}

export interface TemplateView {
    global: ReplyTemplate[]
    byTool: Record<string, ReplyTemplate[]>
}

export interface WebviewCapabilities {
    images: boolean
    fileRead: boolean
    appendAttachmentContent: boolean
    promptList: boolean
    toolList: boolean
}

export interface WebviewError {
    message: string
    detail?: string
}

export interface PromptFileView {
    label: string
    value: string
    description?: string
    source: 'workspace' | 'user'
}

export interface ToolView {
    label: string
    value: string
    displayName?: string
    description?: string
}

export interface WorkspaceFileContentView {
    path: string
    content: string
    range?: { start: number; end: number }
}

export interface WebviewViewModel {
    version: number
    connection: ConnectionView
    task?: TaskView
    content: StageContentView
    interactions: InteractionQueueView
    templates: TemplateView
    capabilities: WebviewCapabilities
    errors: WebviewError[]
}

export interface SubmitInteractionResultPayload {
    interactionId: string
    text: string
    images?: InteractionImage[]
    reportContent?: string | null
}

export type HostToWebviewMessage =
    | { type: 'render'; payload: WebviewViewModel }
    | { type: 'set_busy'; payload: { busy: boolean; label?: string } }
    | { type: 'show_error'; payload: WebviewError }
    | { type: 'focus_interaction'; payload: { interactionId: string } }
    | { type: 'prompt_files_result'; payload: { query?: string; items: PromptFileView[] } }
    | { type: 'tools_result'; payload: { query?: string; items: ToolView[] } }
    | { type: 'workspace_file_result'; payload: WorkspaceFileContentView | WebviewError }
    | { type: 'ui_closed'; payload?: Record<string, never> }

export type WebviewToHostMessage =
    | { type: 'ready' }
    | { type: 'rendered'; payload: { version: number } }
    | { type: 'submit_interaction_result'; payload: SubmitInteractionResultPayload }
    | { type: 'cancel_interaction'; payload: { interactionId: string } }
    | { type: 'heartbeat'; payload: { interactionId: string } }
    | { type: 'request_prompt_files'; payload: { query?: string } }
    | { type: 'request_tools'; payload: { query?: string } }
    | { type: 'read_workspace_file'; payload: { path: string; range?: { start: number; end: number } } }
    | { type: 'client_error'; payload: { message: string; stack?: string } }
