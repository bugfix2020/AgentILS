import {
    BulbOutlined,
    CloudUploadOutlined,
    GlobalOutlined,
    PaperClipOutlined,
    QuestionCircleOutlined,
    WarningOutlined,
} from '@ant-design/icons'
import type { ActionsFeedbackProps, BubbleListProps, ThoughtChainItemProps } from '@ant-design/x'
import {
    Actions,
    Attachments,
    Bubble,
    Conversations,
    Prompts,
    Sender,
    Think,
    ThoughtChain,
    Welcome,
    XProvider,
} from '@ant-design/x'
import type { ComponentProps } from '@ant-design/x-markdown'
import XMarkdown from '@ant-design/x-markdown'
import { useXConversations, XModelMessage } from '@ant-design/x-sdk'
import { Avatar, Button, Card, Flex, type GetProp, message, Modal, Space, Tag } from 'antd'
import { createStyles } from 'antd-style'
import React, { useRef, useState } from 'react'
import '@ant-design/x-markdown/themes/light.css'
import { BubbleListRef } from '@ant-design/x/es/bubble'
import logoUrl from './assets/AgentILS_logo_C_light.svg'

const locale = {
    howToQuicklyInstallAndImportComponents: '如何快速执行重构？',
    curConversation: '当前',
    aiMessage_2: '您可以使用命令来重构现有的代码。',
    newAgiHybridInterface: 'AgentILS 代理反馈系统',
    aiMessage_1: '是的，等待用户确认执行操作。',
    whatIsAntDesignX: '当前上下文分析',
    today: '今天',
    yesterday: '昨天',
    hotTopics: '热门操作',
    whatComponentsAreInAntDesignX: '我能为您做些什么？',
    comeAndDiscoverNewDesignParadigm: '排查当前编辑器报错',
    designGuide: '使用指南',
    intention: '意图',
    aiUnderstandsUserNeedsAndProvidesSolutions: 'AI 理解您的代码约束',
    role: '角色',
    aiPublicPersonAndImage: '自动修正与执行',
    chat: '对话',
    howAICanExpressItselfWayUsersUnderstand: '展示任务执行报告',
    interface: '界面',
    aiBalances: '全交互确认台',
    upgrades: '重新规划',
    components: '修改目标',
    richGuide: '查看变更',
    installationIntroduction: '新建子任务',
    deepThinking: '分析依赖中',
    completeThinking: '前置分析完成',
    modelIsRunning: '工作流进行中',
    modelExecutionCompleted: '执行完成',
    executionFailed: '执行失败',
    aborted: '已终止',
    noData: '暂无数据',
    requestAborted: '操作被终止',
    requestFailed: '操作失败',
    retry: '重试',
    isMock: '此为离线开发演示',
    itIsNowANewConversation: '请先完成当前任务',
    newConversation: '新任务',
    rename: '重命名',
    delete: '删除',
    welcome: '嘿，我是 AgentILS',
    welcomeDescription: '基于 Ant Design X 的智能代理界面',
    uploadFile: '附件上下文',
    dropFileHere: '拖拽文件到这里',
    uploadFiles: '添加文件上下文',
    clickOrDragFilesToUpload: '点击或拖拽上传',
    askOrInputUseSkills: '输入任意需求，或使用 / 获取快速指令',
}

const useStyle = createStyles(({ token, css }) => {
    return {
        layout: css`
            width: 100%;
            height: 100vh;
            display: flex;
            background: ${token.colorBgContainer};
            font-family: ${token.fontFamily}, sans-serif;
        `,
        side: css`
            background: ${token.colorBgLayout}80;
            width: 280px;
            height: 100%;
            display: flex;
            flex-direction: column;
            padding: 0 12px;
            box-sizing: border-box;
        `,
        logo: css`
            display: flex;
            align-items: center;
            justify-content: start;
            padding: 0 24px;
            box-sizing: border-box;
            gap: 8px;
            margin: 24px 0;
            span {
                font-weight: bold;
                color: ${token.colorText};
                font-size: 16px;
            }
        `,
        conversations: css`
            overflow-y: auto;
            margin-top: 12px;
            padding: 0;
            flex: 1;
            .ant-conversations-list {
                padding-inline-start: 0;
            }
        `,
        sideFooter: css`
            border-top: 1px solid ${token.colorBorderSecondary};
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        `,
        chat: css`
            height: 100%;
            width: calc(100% - 280px);
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            .ant-bubble-content-updating {
                background-image: linear-gradient(90deg, #5b7cfa 0%, #af3cb8 31%, #53b6ff 89%);
                background-size: 100% 2px;
                background-repeat: no-repeat;
                background-position: bottom;
            }
        `,
        chatList: css`
            flex: 1;
            position: relative;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            padding: 20px 0;
        `,
        placeholder: css`
            width: 100%;
            padding: ${token.paddingLG}px;
            box-sizing: border-box;
        `,
        welcomeMarquee: css`
            position: relative;
            width: 100%;
            overflow: hidden;
            border-radius: 24px;
            background: ${token.colorBgContainer};
            box-shadow: 0 16px 40px rgba(16, 24, 40, 0.08);

            &::before {
                content: '';
                position: absolute;
                width: 160%;
                height: 320%;
                left: -30%;
                top: -110%;
                background: conic-gradient(from 0deg, #7c8cff, #57c7ff, #ff965d, #ff5da8, #7c8cff);
                animation: borderSpin 4s linear infinite;
                pointer-events: none;
            }

            &::after {
                content: '';
                position: absolute;
                inset: 1px;
                border-radius: 23px;
                background: ${token.colorBgContainer};
                box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.04);
            }

            > * {
                position: relative;
                z-index: 1;
            }

            @keyframes borderSpin {
                to {
                    transform: rotate(1turn);
                }
            }
        `,
        welcomeStaticBorder: css`
            position: relative;
            width: 100%;
            overflow: hidden;
            border-radius: 24px;
            background: ${token.colorBgContainer};
            box-shadow: 0 16px 40px rgba(16, 24, 40, 0.08);

            &::before {
                content: '';
                position: absolute;
                inset: 0;
                padding: 1px;
                border-radius: 24px;
                background: linear-gradient(120deg, #7c8cff 0%, #57c7ff 35%, #ff965d 68%, #ff5da8 100%);
                pointer-events: none;
            }

            &::after {
                content: '';
                position: absolute;
                inset: 1px;
                border-radius: 23px;
                background: ${token.colorBgContainer};
                box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.04);
            }

            > * {
                position: relative;
                z-index: 1;
            }
        `,
        dynamicWelcome: css`
            position: absolute;
            left: 50%;
            max-width: calc(100% - 48px);
            z-index: 3;
            transition:
                top 960ms cubic-bezier(0.22, 1, 0.36, 1),
                transform 960ms cubic-bezier(0.22, 1, 0.36, 1),
                opacity 240ms ease;
        `,

        dynamicWelcomeCentered: css`
            top: 50%;
            transform: translate(-50%, -50%);
        `,

        dynamicWelcomeDocked: css`
            top: 24px;
            transform: translate(-50%, 0);
        `,

        dynamicWelcomeStatus: css`
            max-width: min(940px, calc(100% - 48px));
        `,

        dynamicWelcomeCard: css`
            display: inline-block;
            width: auto;
            max-width: 100%;
            overflow: hidden;
            transition: width 960ms cubic-bezier(0.22, 1, 0.36, 1);
        `,

        dynamicWelcomeCardEmpty: css`
            max-width: min(560px, calc(100vw - 72px));
        `,

        dynamicWelcomeCardStatus: css`
            max-width: min(940px, calc(100vw - 72px));
        `,

        welcomeMeasure: css`
            position: absolute;
            left: -9999px;
            top: 0;
            visibility: hidden;
            pointer-events: none;
            z-index: -1;
        `,
        sender: css`
            width: 100%;
            max-width: 840px;
        `,
        suggestionWrapper: css`
            width: 100%;
            padding: 8px 20px 16px;
            box-sizing: border-box;
        `,
        senderPrompt: css`
            width: 100%;
            max-width: 840px;
            margin: 0 auto;
            color: ${token.colorText};

            .ant-prompts-title {
                color: rgba(0, 0, 0, 0.45);
            }

            .ant-prompts-label {
                color: rgba(0, 0, 0, 0.88) !important;
            }

            .ant-prompts-desc {
                color: rgba(0, 0, 0, 0.55) !important;
            }
        `,
    }
})

const DEFAULT_CONVERSATIONS_ITEMS = [
    { key: 'default-1', label: '什么是 AgentILS?', group: locale.today, status: '进行中' },
    { key: 'default-2', label: '如何快速安装组件?', group: locale.today, status: '已完成' },
    { key: 'default-3', label: '全新的 AGI 混合界面', group: locale.yesterday, status: '已失败' },
    { key: 'default-4', label: '有哪些组件?', group: locale.yesterday, status: '已取消' },
]

const promptItems: GetProp<typeof Prompts, 'items'> = [
    {
        key: 'newtask',
        label: '/newtask',
        description: 'Create a new task or project session',
        icon: <BulbOutlined style={{ color: '#f5c84c' }} />,
    },
    {
        key: 'exitConversation',
        label: '/exitConversation',
        description: 'Clean up to exit current conversation context',
        icon: <GlobalOutlined style={{ color: '#7b61ff' }} />,
    },
    {
        key: 'direct',
        label: '/direct',
        description: 'Switch to direct conversation mode',
        icon: <WarningOutlined style={{ color: '#f06a5f' }} />,
    },
]

const THOUGHT_CHAIN_CONFIG = {
    loading: { title: locale.modelIsRunning, status: 'loading' },
    updating: { title: locale.modelIsRunning, status: 'loading' },
    success: { title: locale.modelExecutionCompleted, status: 'success' },
    error: { title: locale.executionFailed, status: 'error' },
    abort: { title: locale.aborted, status: 'abort' },
}

interface ChatMessage extends XModelMessage {
    extraInfo?: {
        feedback?: ActionsFeedbackProps['value']
        requiresConfirm?: boolean
    }
}

const ChatContext = React.createContext<{
    setMessage?: (id: string | number, updater: (message: MockMessageRecord) => Partial<MockMessageRecord>) => void
}>({})

interface MockMessageRecord {
    id: string
    message: ChatMessage
    status?: 'loading' | 'local' | 'updating' | 'success' | 'error' | 'abort'
    extraInfo?: ChatMessage['extraInfo']
}

const ThinkComponent = React.memo((props: ComponentProps) => {
    const [title, setTitle] = React.useState(`${locale.deepThinking}...`)
    const [loading, setLoading] = React.useState(true)
    React.useEffect(() => {
        if (props.streamStatus === 'done') {
            setTitle(locale.completeThinking)
            setLoading(false)
        }
    }, [props.streamStatus])
    return (
        <Think title={title} loading={loading}>
            {props.children}
        </Think>
    )
})

const Footer: React.FC<{
    id?: string | number
    content: string
    status?: string
    extraInfo?: ChatMessage['extraInfo']
}> = ({ id, content, extraInfo, status }) => {
    const context = React.useContext(ChatContext)

    if (status === 'updating' || status === 'loading') return null

    if (extraInfo?.requiresConfirm) {
        return (
            <Space style={{ marginTop: 12 }}>
                <Button
                    type="primary"
                    onClick={() => {
                        message.success('已批准执行！')
                        context?.setMessage?.(id!, () => ({ extraInfo: { ...extraInfo, requiresConfirm: false } }))
                    }}
                >
                    批准并执行 (Approve)
                </Button>
                <Button onClick={() => message.info('用户已拒绝，正在转为对话模式重新规划')}>沟通调整 (Discuss)</Button>
            </Space>
        )
    }

    const items = [
        { key: 'copy', actionRender: <Actions.Copy text={content} /> },
        {
            key: 'feedback',
            actionRender: (
                <Actions.Feedback
                    styles={{ liked: { color: '#5b7cfa' } }}
                    value={extraInfo?.feedback || 'default'}
                    key="feedback"
                    onChange={(val: ActionsFeedbackProps['value']) => {
                        if (id) {
                            context?.setMessage?.(id, () => ({ extraInfo: { ...extraInfo, feedback: val } }))
                            message.success(`${id}: ${val}`)
                        }
                    }}
                />
            ),
        },
    ]
    return <div style={{ display: 'flex', marginTop: 12 }}>{id && <Actions items={items} />}</div>
}

const getRole = (): BubbleListProps['role'] => ({
    assistant: {
        placement: 'start',
        header: (_, { status }) => {
            const config = THOUGHT_CHAIN_CONFIG[status as keyof typeof THOUGHT_CHAIN_CONFIG]
            return config ? (
                <ThoughtChain.Item
                    style={{ marginBottom: 8 }}
                    status={config.status as ThoughtChainItemProps['status']}
                    variant="solid"
                    icon={<GlobalOutlined />}
                    title={config.title}
                />
            ) : null
        },
        footer: (content, { status, key, extraInfo }) => (
            <Footer
                content={content}
                status={status}
                extraInfo={extraInfo as ChatMessage['extraInfo']}
                id={key as string}
            />
        ),
        contentRender: (content: string, { status }) => {
            const newContent = content.replace(/\n\n/g, '<br/><br/>')
            return (
                <XMarkdown
                    paragraphTag="div"
                    components={{ think: ThinkComponent }}
                    className="markdown-light"
                    streaming={{
                        hasNextChunk: status === 'updating',
                        enableAnimation: true,
                    }}
                >
                    {newContent}
                </XMarkdown>
            )
        },
    },
    user: { placement: 'end' },
})

function renderStatusTag(status?: string) {
    if (!status) return null

    const colorMap: Record<string, string> = {
        进行中: 'processing',
        已完成: 'success',
        已失败: 'error',
        已取消: 'default',
    }

    return <Tag color={colorMap[status] ?? 'default'}>{status}</Tag>
}

export function App() {
    const { styles } = useStyle()
    const { conversations, activeConversationKey, setActiveConversationKey } = useXConversations({
        defaultConversations: DEFAULT_CONVERSATIONS_ITEMS,
        defaultActiveConversationKey: DEFAULT_CONVERSATIONS_ITEMS[0].key,
    })
    const [, contextHolder] = message.useMessage()
    const [attachmentsOpen, setAttachmentsOpen] = useState(false)
    const [attachedFiles, setAttachedFiles] = useState<GetProp<typeof Attachments, 'items'>>([])
    const [inputValue, setInputValue] = useState('')
    const [mockMessages, setMockMessages] = useState<MockMessageRecord[]>([])
    const [welcomeMode, setWelcomeMode] = useState<'empty' | 'lifting' | 'status'>('empty')
    const [welcomeNode, setWelcomeNode] = useState<React.ReactNode>(null)
    const [welcomeCardWidth, setWelcomeCardWidth] = useState<number | undefined>(undefined)
    const [showBubbleList, setShowBubbleList] = useState(false)
    const listRef = useRef<BubbleListRef>(null)
    const welcomeCardRef = useRef<HTMLDivElement>(null)
    const welcomeMeasureRef = useRef<HTMLDivElement>(null)

    const updateMockMessage = (
        id: string | number,
        updater: (message: MockMessageRecord) => Partial<MockMessageRecord>,
    ) => {
        setMockMessages((currentMessages) =>
            currentMessages.map((item) => (item.id === id ? { ...item, ...updater(item) } : item)),
        )
    }

    const onSubmit = (val: string) => {
        if (!val) return

        const timestamp = Date.now()
        const nextMessages: MockMessageRecord[] = [
            {
                id: `user-${timestamp}`,
                message: { role: 'user', content: val },
            },
            {
                id: `assistant-${timestamp}`,
                message: {
                    role: 'assistant',
                    content: `已收到：${val}\n\n这里先展示本地 mock 对话，后续再接 MCP 推送的真实结果。`,
                },
                extraInfo: { feedback: 'default' },
            },
        ]

        setMockMessages((currentMessages) => [...currentMessages, ...nextMessages])
        listRef.current?.scrollTo({ top: 'bottom' })
        setActiveConversationKey(activeConversationKey)
    }

    const hasMessages = mockMessages.length > 0
    const welcomeAnimationDuration = 960

    const mockMcpState = {
        phase: showBubbleList ? 'execute' : 'plan',
        controlMode: activeConversationKey === 'default-4' ? 'direct' : 'normal',
        terminal: 'active',
        source: 'mock MCP state',
    }

    const createEmptyWelcomeNode = () => (
        <Welcome
            style={{ position: 'relative', zIndex: 1 }}
            variant="borderless"
            icon={<img src={logoUrl} draggable={false} alt="AgentILS logo" width={48} height={48} />}
            title="嘿，你好，我是 AgentILS"
            description="Dear pilot, welcome onboarding. you can ask me anything or input / to get started!"
        />
    )

    const createStatusWelcomeNode = () => (
        <Welcome
            style={{ position: 'relative', zIndex: 1 }}
            variant="borderless"
            icon={<img src={logoUrl} draggable={false} alt="AgentILS logo" width={44} height={44} />}
            title="Hello, I'm Ant Design X"
            description="Base on Ant Design, AGI product interface solution, create a better intelligent vision~"
            extra={
                <Space wrap size={[8, 8]}>
                    <Tag color="processing">phase: {mockMcpState.phase}</Tag>
                    <Tag color={mockMcpState.controlMode === 'direct' ? 'error' : 'blue'}>
                        mode: {mockMcpState.controlMode}
                    </Tag>
                    <Tag color="success">terminal: {mockMcpState.terminal}</Tag>
                    <Tag>{mockMcpState.source}</Tag>
                </Space>
            }
        />
    )

    React.useEffect(() => {
        setMockMessages([])
        setShowBubbleList(false)
        setWelcomeMode('empty')
        setWelcomeCardWidth(undefined)
        setWelcomeNode(createEmptyWelcomeNode())
    }, [activeConversationKey])

    React.useEffect(() => {
        if (!hasMessages) {
            setShowBubbleList(false)
            setWelcomeMode('empty')
            setWelcomeNode(createEmptyWelcomeNode())
            return undefined
        }

        setShowBubbleList(false)
        setWelcomeNode(createEmptyWelcomeNode())
        setWelcomeMode('lifting')

        const timer = window.setTimeout(() => {
            const currentWidth = welcomeCardRef.current?.getBoundingClientRect().width
            const targetWidth = welcomeMeasureRef.current?.getBoundingClientRect().width

            if (currentWidth && targetWidth) {
                setWelcomeCardWidth(currentWidth)
            }

            setWelcomeNode(createStatusWelcomeNode())
            setWelcomeMode('status')
            setShowBubbleList(true)

            if (currentWidth && targetWidth) {
                window.requestAnimationFrame(() => {
                    setWelcomeCardWidth(targetWidth)
                })
            } else {
                setWelcomeCardWidth(undefined)
            }
        }, welcomeAnimationDuration)

        return () => {
            window.clearTimeout(timer)
        }
    }, [hasMessages, welcomeAnimationDuration])

    React.useEffect(() => {
        if (welcomeMode !== 'status') {
            return
        }

        setWelcomeNode(createStatusWelcomeNode())
        setShowBubbleList(true)
    }, [mockMcpState.controlMode, mockMcpState.phase, mockMcpState.source, mockMcpState.terminal, welcomeMode])

    const isWelcomeDocked = welcomeMode === 'lifting' || welcomeMode === 'status'
    const isWelcomeStatus = welcomeMode === 'status'

    const chatSide = (
        <div className={styles.side}>
            <div className={styles.logo}>
                <img src={logoUrl} draggable={false} alt="AgentILS logo" width={32} height={32} />
                <span>AgentILS</span>
            </div>
            <Conversations
                items={conversations.map((item) => {
                    const { key, label, status, ...other } =
                        item as unknown as (typeof DEFAULT_CONVERSATIONS_ITEMS)[number]
                    return {
                        key,
                        label: (
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    width: '100%',
                                    gap: 8,
                                    minWidth: 0,
                                }}
                            >
                                <span
                                    style={{
                                        flex: 1,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {label}
                                </span>
                                <div style={{ flexShrink: 0 }}>{renderStatusTag(status)}</div>
                            </div>
                        ),
                        ...other,
                    }
                })}
                className={styles.conversations}
                activeKey={activeConversationKey}
                onActiveChange={setActiveConversationKey}
                groupable
                styles={{ item: { padding: '0 8px' } }}
            />
            <div className={styles.sideFooter}>
                <Avatar size={24} />
                <Button type="text" icon={<QuestionCircleOutlined />} />
            </div>
        </div>
    )

    const chatList = (
        <div className={styles.chatList}>
            <div
                className={[
                    styles.dynamicWelcome,
                    isWelcomeDocked ? styles.dynamicWelcomeDocked : styles.dynamicWelcomeCentered,
                    isWelcomeStatus ? styles.dynamicWelcomeStatus : '',
                ]
                    .filter(Boolean)
                    .join(' ')}
            >
                <div
                    ref={welcomeCardRef}
                    className={[
                        styles.dynamicWelcomeCard,
                        isWelcomeStatus ? styles.dynamicWelcomeCardStatus : styles.dynamicWelcomeCardEmpty,
                    ].join(' ')}
                    style={welcomeCardWidth ? { width: `${welcomeCardWidth}px` } : undefined}
                    onTransitionEnd={(event) => {
                        if (event.propertyName === 'width' && isWelcomeStatus) {
                            setWelcomeCardWidth(undefined)
                        }
                    }}
                >
                    <Card
                        className={isWelcomeStatus ? styles.welcomeStaticBorder : styles.welcomeMarquee}
                        bordered={false}
                    >
                        {welcomeNode}
                    </Card>
                </div>
            </div>

            <div className={styles.welcomeMeasure}>
                <div
                    ref={welcomeMeasureRef}
                    className={`${styles.dynamicWelcomeCard} ${styles.dynamicWelcomeCardStatus}`}
                >
                    <Card className={styles.welcomeStaticBorder} bordered={false}>
                        {createStatusWelcomeNode()}
                    </Card>
                </div>
            </div>

            {showBubbleList ? (
                <Flex vertical gap={16} align="center" style={{ width: '100%', maxWidth: 940, paddingTop: 176 }}>
                    <Bubble.List
                        ref={listRef}
                        items={mockMessages.map((item) => ({
                            ...item.message,
                            key: item.id,
                            status: item.status,
                            loading: item.status === 'loading',
                            extraInfo: item.extraInfo,
                        }))}
                        styles={{ root: { maxWidth: 940, width: '100%' } }}
                        role={getRole()}
                    />
                </Flex>
            ) : (
                <Flex
                    vertical
                    gap={16}
                    align="center"
                    className={styles.placeholder}
                    style={{ maxWidth: 840, margin: 'auto' }}
                />
            )}
        </div>
    )

    const senderHeader = (
        <Sender.Header
            title={locale.uploadFile}
            open={attachmentsOpen}
            onOpenChange={setAttachmentsOpen}
            styles={{ content: { padding: 0 } }}
        >
            <Attachments
                beforeUpload={() => false}
                items={attachedFiles}
                onChange={(info) => setAttachedFiles(info.fileList)}
                placeholder={(type) =>
                    type === 'drop'
                        ? { title: locale.dropFileHere }
                        : {
                              icon: <CloudUploadOutlined />,
                              title: locale.uploadFiles,
                              description: locale.clickOrDragFilesToUpload,
                          }
                }
            />
        </Sender.Header>
    )

    const chatSender = (
        <Flex
            vertical
            gap={12}
            align="center"
            className={styles.suggestionWrapper}
            style={{ margin: '0 auto', padding: '8px 0' }}
        >
            {!hasMessages && !attachmentsOpen && (
                <Prompts
                    fadeInLeft={true}
                    title="✨ Inspirational Sparks and Marvelous Tips"
                    items={promptItems}
                    onItemClick={(info) => {
                        Modal.confirm({
                            title: '确认触发指令',
                            content: `您确定要执行指令 ${info.data.label} 吗？`,
                            onOk() {
                                onSubmit(info.data.label as string)
                                setInputValue('')
                            },
                        })
                    }}
                    className={styles.senderPrompt}
                />
            )}

            <Sender
                value={inputValue}
                header={senderHeader}
                onSubmit={() => {
                    onSubmit(inputValue)
                    setInputValue('')
                }}
                onChange={setInputValue}
                prefix={
                    <Button
                        type="text"
                        icon={<PaperClipOutlined style={{ fontSize: 18 }} />}
                        onClick={() => setAttachmentsOpen(!attachmentsOpen)}
                    />
                }
                loading={false}
                className={styles.sender}
                allowSpeech
                placeholder={locale.askOrInputUseSkills}
            />
        </Flex>
    )

    return (
        <XProvider>
            <ChatContext.Provider value={{ setMessage: updateMockMessage }}>
                {contextHolder}
                <div className={styles.layout}>
                    {chatSide}
                    <div className={styles.chat}>
                        {chatList}
                        {chatSender}
                    </div>
                </div>
            </ChatContext.Provider>
        </XProvider>
    )
}
