import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, ConfigProvider, Tag, theme, Typography } from 'antd'
import { Bubble, Prompts, Sender, Suggestion, Welcome, XProvider } from '@ant-design/x'
import type { PromptProps } from '@ant-design/x/es/prompts'
import type { SuggestionItem } from '@ant-design/x/es/suggestion'
import {
    type InteractionImage,
    type PromptFileView,
    type ReplyTemplate,
    type ToolView,
    type WebviewError,
    type WebviewViewModel,
    type WorkspaceFileContentView,
} from './protocol'
import { createProtocolBridge } from './protocol-bridge'
import './App.css'

const HEARTBEAT_MS = 10_000
const IMAGE_MIME_PREFIX = 'image/'

type SuggestionInfo = { query: string }
type CommandKind = 'template' | 'prompt' | 'tool' | 'attach' | 'clear-report'
type CommandValue = `${CommandKind}:${string}`

export function App(): React.ReactElement {
    const bridge = useMemo(() => createProtocolBridge(), [])
    const [viewModel, setViewModel] = useState<WebviewViewModel | null>(null)
    const [focusedId, setFocusedId] = useState<string | null>(null)
    const [draft, setDraft] = useState('')
    const [reportContent, setReportContent] = useState('')
    const [images, setImages] = useState<InteractionImage[]>([])
    const [promptFiles, setPromptFiles] = useState<PromptFileView[]>([])
    const [tools, setTools] = useState<ToolView[]>([])
    const [uiError, setUiError] = useState<string | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const heartbeatRef = useRef<number | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        const dispose = bridge.onMessage((message) => {
            if (message.type === 'render') {
                setViewModel(message.payload)
                bridge.rendered(message.payload.version)
                return
            }
            if (message.type === 'prompt_files_result') {
                setPromptFiles(message.payload.items)
                return
            }
            if (message.type === 'tools_result') {
                setTools(message.payload.items)
                return
            }
            if (message.type === 'workspace_file_result') {
                const payload = message.payload
                if (isWorkspaceFileContent(payload)) {
                    setReportContent((current) =>
                        appendBlock(current, formatAttachmentReport(payload.path, payload.content)),
                    )
                    setUiError(null)
                } else {
                    setUiError(payload.message)
                }
                return
            }
            if (message.type === 'show_error') {
                setUiError(message.payload.message)
                return
            }
            if (message.type === 'focus_interaction') setFocusedId(message.payload.interactionId)
        })
        bridge.ready()

        return dispose
    }, [bridge])

    const pending = viewModel?.interactions.items ?? []
    const requestedActiveId = focusedId ?? viewModel?.interactions.activeId ?? null
    const active = pending.find((item) => item.id === requestedActiveId) ?? pending[0] ?? null
    const activeId = active?.id ?? null

    useEffect(() => {
        if (!activeId) return
        heartbeatRef.current = window.setInterval(() => {
            void bridge.heartbeat(activeId)
        }, HEARTBEAT_MS)
        return () => {
            if (heartbeatRef.current !== null) window.clearInterval(heartbeatRef.current)
        }
    }, [activeId, bridge])

    const replyTemplates = useMemo(
        () =>
            templatesFor(viewModel?.templates.global ?? [], viewModel?.templates.byTool[active?.toolName ?? ''] ?? []),
        [active?.toolName, viewModel?.templates.byTool, viewModel?.templates.global],
    )

    useEffect(() => {
        setDraft('')
        setReportContent('')
        setImages([])
        setUiError(null)
    }, [activeId])

    useEffect(() => {
        if (!activeId) return
        if (viewModel?.capabilities.promptList) bridge.requestPromptFiles()
        if (viewModel?.capabilities.toolList) bridge.requestTools()
    }, [activeId, bridge, viewModel?.capabilities.promptList, viewModel?.capabilities.toolList])

    async function handleSubmit(message?: string): Promise<void> {
        const text = (message ?? draft).trim()
        const report = reportContent.trim()
        if (!text && images.length === 0 && !report) return
        if (!active) {
            setDraft('')
            return
        }
        bridge.submitInteractionResult({
            interactionId: active.id,
            text,
            images: images.length > 0 ? images : undefined,
            reportContent: report || null,
        })
        setDraft('')
        setReportContent('')
        setImages([])
    }

    function applyTemplate(templateName: string, sourceDraft = draft): void {
        const template = replyTemplates.find((item) => item.name === templateName)
        if (!template) return
        const input = removeActiveMention(sourceDraft) || active?.question || ''
        setDraft(template.template.replaceAll('{{INPUT_CONTENT}}', input))
    }

    function addToolReference(toolName: string, sourceDraft = draft): void {
        const tool = tools.find((item) => item.value === toolName)
        if (!tool) return
        const label = tool.label || tool.displayName || tool.value
        setDraft(appendInline(removeActiveMention(sourceDraft), `#${label}`))
    }

    function addWorkspaceFile(path: string): void {
        const trimmed = path.trim()
        if (!trimmed) return
        setUiError(null)
        bridge.readWorkspaceFile(trimmed)
    }

    async function handleFiles(files: FileList | File[]): Promise<void> {
        const nextImages: InteractionImage[] = []
        const nextReports: string[] = []
        for (const file of Array.from(files)) {
            if (file.type.startsWith(IMAGE_MIME_PREFIX)) {
                nextImages.push({
                    filename: file.name,
                    mimeType: file.type,
                    data: await readFileAsDataUrl(file),
                })
                continue
            }
            if (viewModel?.capabilities.appendAttachmentContent !== false) {
                nextReports.push(formatAttachmentReport(file.name, await readFileAsText(file)))
            }
        }
        if (nextImages.length > 0) setImages((current) => [...current, ...nextImages])
        if (nextReports.length > 0) setReportContent((current) => appendBlock(current, ...nextReports))
    }

    function removeImage(index: number): void {
        setImages((current) => current.filter((_, currentIndex) => currentIndex !== index))
    }

    function handleSuggestionSelect(value: string): void {
        const [kind, payload] = splitCommandValue(value as CommandValue)
        if (kind === 'template') {
            applyTemplate(payload)
            return
        }
        if (kind === 'prompt') {
            setDraft((current) => removeActiveMention(current))
            addWorkspaceFile(payload)
            return
        }
        if (kind === 'tool') {
            addToolReference(payload)
            return
        }
        if (kind === 'attach') {
            setDraft((current) => removeActiveMention(current))
            fileInputRef.current?.click()
            return
        }
        if (kind === 'clear-report') {
            setDraft((current) => removeActiveMention(current))
            setReportContent('')
            setImages([])
        }
    }

    const bubbleItems: React.ComponentProps<typeof Bubble.List>['items'] = useMemo(() => {
        if (!active) return []
        return [
            ...(active.context
                ? [{ key: `${active.id}-context`, role: 'context', content: active.context, header: 'Context' }]
                : []),
            {
                key: `${active.id}-question`,
                role: 'assistant',
                content: active.question,
                header: active.toolName,
                footer: formatTimestamp(active.createdAt),
            },
        ]
    }, [active])

    const bubbleRoles: React.ComponentProps<typeof Bubble.List>['roles'] = useMemo(
        () => ({
            assistant: {
                placement: 'start' as const,
                variant: 'filled' as const,
                shape: 'corner' as const,
                classNames: { content: 'agentils-bubble-content' },
                styles: { content: { maxWidth: 760 } },
            },
            context: {
                placement: 'start' as const,
                variant: 'borderless' as const,
                shape: 'corner' as const,
                classNames: { content: 'agentils-context-content' },
                styles: { content: { maxWidth: 760 } },
            },
        }),
        [],
    )

    const commandItems = useMemo(
        () => createCommandItems(replyTemplates, promptFiles, tools, Boolean(reportContent || images.length)),
        [images.length, promptFiles, replyTemplates, reportContent, tools],
    )

    const quickPrompts: PromptProps[] = useMemo(
        () => createQuickPrompts(replyTemplates, promptFiles, tools),
        [promptFiles, replyTemplates, tools],
    )

    const connectionColor =
        viewModel?.connection.status === 'ready'
            ? 'success'
            : viewModel?.connection.status === 'offline'
              ? 'error'
              : 'warning'

    const attachmentCount = images.length + (reportContent ? 1 : 0)

    return (
        <ConfigProvider
            theme={{
                algorithm: theme.defaultAlgorithm,
                token: {
                    colorPrimary: '#4f8cff',
                    borderRadius: 10,
                    colorBgLayout: '#f7f8fb',
                    colorBgContainer: '#ffffff',
                    colorText: '#1f2430',
                    colorTextSecondary: '#5f6777',
                },
            }}
        >
            <XProvider>
                <div
                    className={`agentils-shell${isDragging ? ' agentils-shell-dragging' : ''}`}
                    onDragOver={(event) => {
                        event.preventDefault()
                        setIsDragging(true)
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(event) => {
                        event.preventDefault()
                        setIsDragging(false)
                        void handleFiles(event.dataTransfer.files)
                    }}
                    onPaste={(event) => {
                        if (event.clipboardData.files.length > 0) void handleFiles(event.clipboardData.files)
                    }}
                >
                    <div className="agentils-status-float">
                        <Tag color={pending.length > 0 ? 'processing' : 'default'}>{pending.length} pending</Tag>
                        {viewModel?.connection.status && (
                            <Tag color={connectionColor}>{viewModel.connection.status}</Tag>
                        )}
                        {active?.toolName && <Tag color="blue">{active.toolName}</Tag>}
                    </div>

                    <main className="agentils-chat">
                        <section className="agentils-chat-list">
                            {!active ? (
                                <div className="agentils-placeholder">
                                    <Welcome
                                        variant="borderless"
                                        icon={<div className="agentils-logo-mark">AI</div>}
                                        title="AgentILS"
                                        description="Human clarification workspace"
                                    />
                                    <div className="agentils-welcome-prompts">
                                        <Prompts
                                            items={createWelcomePrompts(viewModel?.connection.status ?? 'connecting')}
                                            onItemClick={(info) =>
                                                setDraft(String(info.data.description ?? info.data.label ?? ''))
                                            }
                                            styles={{
                                                item: { border: 'none' },
                                                subItem: { background: 'rgba(255, 255, 255, 0.72)' },
                                            }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <Bubble.List
                                    className="agentils-bubbles"
                                    items={bubbleItems}
                                    roles={bubbleRoles}
                                    autoScroll
                                />
                            )}
                        </section>

                        <section className="agentils-sender-zone">
                            {quickPrompts.length > 0 && (
                                <Prompts
                                    className="agentils-sender-prompts"
                                    items={quickPrompts}
                                    wrap
                                    onItemClick={(info) => {
                                        const value = String(info.data.key)
                                        if (value.startsWith('template:'))
                                            applyTemplate(value.slice('template:'.length))
                                        if (value.startsWith('prompt:')) addWorkspaceFile(value.slice('prompt:'.length))
                                        if (value.startsWith('tool:')) addToolReference(value.slice('tool:'.length))
                                    }}
                                    styles={{ item: { padding: '7px 13px' } }}
                                />
                            )}

                            {uiError && (
                                <Alert
                                    className="agentils-error"
                                    type="warning"
                                    showIcon
                                    message={uiError}
                                    closable
                                    onClose={() => setUiError(null)}
                                />
                            )}

                            {attachmentCount > 0 && (
                                <div className="agentils-attachment-strip">
                                    {images.map((image, index) => (
                                        <Tag
                                            key={`${image.filename ?? 'image'}-${index}`}
                                            closable
                                            onClose={() => removeImage(index)}
                                        >
                                            {image.filename ?? `image-${index + 1}`}
                                        </Tag>
                                    ))}
                                    {reportContent && (
                                        <Tag closable onClose={() => setReportContent('')}>
                                            workspace context
                                        </Tag>
                                    )}
                                </div>
                            )}

                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                className="agentils-file-input"
                                onChange={(event) => {
                                    if (event.target.files) void handleFiles(event.target.files)
                                    event.currentTarget.value = ''
                                }}
                            />

                            <Suggestion<SuggestionInfo>
                                items={(info) => filterCommandItems(commandItems, info?.query ?? '')}
                                onSelect={handleSuggestionSelect}
                            >
                                {({ onTrigger, onKeyDown }) => (
                                    <Sender
                                        className="agentils-sender"
                                        value={draft}
                                        disabled={!active}
                                        autoSize={{ minRows: 2, maxRows: 6 }}
                                        prefix={
                                            <Button
                                                type="text"
                                                size="small"
                                                className="agentils-attach-button"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={!active}
                                            >
                                                +
                                            </Button>
                                        }
                                        onChange={(value) => {
                                            setDraft(value)
                                            const query = getActiveMentionQuery(value)
                                            onTrigger(query === null ? false : { query })
                                        }}
                                        onKeyDown={onKeyDown}
                                        onSubmit={(message) => void handleSubmit(message)}
                                        onCancel={() => active && bridge.cancelInteraction(active.id)}
                                        onPasteFile={(_firstFile, files) => void handleFiles(files)}
                                        placeholder={active?.placeholder ?? '向我提问吧'}
                                    />
                                )}
                            </Suggestion>

                            {active && (
                                <div className="agentils-sender-footer">
                                    <Typography.Text type="secondary">@ for instructions</Typography.Text>
                                    <Button
                                        type="link"
                                        size="small"
                                        danger
                                        onClick={() => bridge.cancelInteraction(active.id)}
                                    >
                                        Cancel request
                                    </Button>
                                </div>
                            )}
                        </section>
                    </main>
                </div>
            </XProvider>
        </ConfigProvider>
    )
}

function templatesFor(globalTemplates: ReplyTemplate[], toolTemplates: ReplyTemplate[]): ReplyTemplate[] {
    const byName = new Map<string, ReplyTemplate>()
    for (const template of globalTemplates) byName.set(template.name, template)
    for (const template of toolTemplates) byName.set(template.name, template)
    return Array.from(byName.values())
}

function isWorkspaceFileContent(value: WorkspaceFileContentView | WebviewError): value is WorkspaceFileContentView {
    return 'content' in value && 'path' in value
}

function appendBlock(current: string, ...blocks: string[]): string {
    return [current, ...blocks]
        .map((block) => block.trim())
        .filter(Boolean)
        .join('\n\n')
}

function appendInline(current: string, value: string): string {
    const trimmedCurrent = current.trimEnd()
    return trimmedCurrent ? `${trimmedCurrent} ${value}` : value
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`))
        reader.readAsDataURL(file)
    })
}

function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`))
        reader.readAsText(file)
    })
}

function formatAttachmentReport(fileName: string, content: string): string {
    return `--- ${fileName} ---\n${content}`
}

function formatTimestamp(timestamp: number): string {
    if (!timestamp) return ''
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(timestamp)
}

function getActiveMentionQuery(value: string): string | null {
    return value.match(/(?:^|\s)@([^\s@]*)$/)?.[1] ?? null
}

function removeActiveMention(value: string): string {
    return value.replace(/(?:^|\s)@([^\s@]*)$/, '').trimEnd()
}

function commandValue(kind: CommandKind, payload: string): CommandValue {
    return `${kind}:${payload}` as CommandValue
}

function splitCommandValue(value: CommandValue): [CommandKind, string] {
    const index = value.indexOf(':')
    return [value.slice(0, index) as CommandKind, value.slice(index + 1)]
}

function createCommandItems(
    replyTemplates: ReplyTemplate[],
    promptFiles: PromptFileView[],
    tools: ToolView[],
    hasContext: boolean,
): SuggestionItem[] {
    return [
        ...replyTemplates.map((item) => ({
            label: <CommandLabel title={item.name} description="Reply template" />,
            value: commandValue('template', item.name),
        })),
        ...promptFiles.map((item) => ({
            label: <CommandLabel title={item.label} description={`${item.source} prompt`} />,
            value: commandValue('prompt', item.value),
        })),
        ...tools.map((item) => ({
            label: (
                <CommandLabel
                    title={item.displayName ?? item.label}
                    description={item.description ?? 'Tool reference'}
                />
            ),
            value: commandValue('tool', item.value),
        })),
        {
            label: <CommandLabel title="Attach file" description="Add image or text context" />,
            value: commandValue('attach', 'file'),
        },
        ...(hasContext
            ? [
                  {
                      label: <CommandLabel title="Clear context" description="Remove attachments" />,
                      value: commandValue('clear-report', 'all'),
                  },
              ]
            : []),
    ]
}

function filterCommandItems(items: SuggestionItem[], query: string): SuggestionItem[] {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return items.slice(0, 8)
    return items.filter((item) => stringifyNode(item.label).toLowerCase().includes(normalized)).slice(0, 8)
}

function createQuickPrompts(
    replyTemplates: ReplyTemplate[],
    promptFiles: PromptFileView[],
    tools: ToolView[],
): PromptProps[] {
    const prompts: PromptProps[] = []
    for (const item of replyTemplates.slice(0, 2)) {
        prompts.push({ key: commandValue('template', item.name), description: item.name })
    }
    for (const item of promptFiles.slice(0, 1)) {
        prompts.push({ key: commandValue('prompt', item.value), description: item.label })
    }
    for (const item of tools.slice(0, 1)) {
        prompts.push({ key: commandValue('tool', item.value), description: item.displayName ?? item.label })
    }
    return prompts
}

function createWelcomePrompts(status: string): PromptProps[] {
    return [
        {
            key: 'status',
            label: 'Connection',
            children: [
                { key: 'status-1', description: status },
                { key: 'status-2', description: '等待代理请求' },
            ],
        },
        {
            key: 'guide',
            label: 'Actions',
            children: [
                { key: 'guide-1', description: '@ 插入指令' },
                { key: 'guide-2', description: '+ 添加附件' },
            ],
        },
    ]
}

function CommandLabel(props: { title: React.ReactNode; description: React.ReactNode }): React.ReactElement {
    return (
        <span className="agentils-command-label">
            <span className="agentils-command-title">{props.title}</span>
            <span className="agentils-command-desc">{props.description}</span>
        </span>
    )
}

function stringifyNode(node: React.ReactNode): string {
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(stringifyNode).join(' ')
    if (React.isValidElement<{ children?: React.ReactNode }>(node)) return stringifyNode(node.props.children)
    return ''
}
