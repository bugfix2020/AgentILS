import {
  AppstoreAddOutlined,
  CloudUploadOutlined,
  CommentOutlined,
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  HeartOutlined,
  PaperClipOutlined,
  ProductOutlined,
  QuestionCircleOutlined,
  ScheduleOutlined,
  ShareAltOutlined,
  SmileOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import type { ActionsFeedbackProps, BubbleListProps, ThoughtChainItemProps } from '@ant-design/x'
import {
  Actions,
  Attachments,
  Bubble,
  Conversations,
  Prompts,
  Sender,
  Suggestion,
  Think,
  ThoughtChain,
  Welcome,
  XProvider,
} from '@ant-design/x'
import type { ComponentProps } from '@ant-design/x-markdown'
import XMarkdown from '@ant-design/x-markdown'
import type { DefaultMessageInfo } from '@ant-design/x-sdk'
import {
  DeepSeekChatProvider,
  SSEFields,
  useXChat,
  useXConversations,
  XModelMessage,
  XModelParams,
  XModelResponse,
  XRequest,
} from '@ant-design/x-sdk'
import { Avatar, Button, Flex, type GetProp, message, Pagination, Space } from 'antd'
import { createStyles } from 'antd-style'
import dayjs from 'dayjs'
import React, { useRef, useState } from 'react'
import '@ant-design/x-markdown/themes/light.css'
import { BubbleListRef } from '@ant-design/x/es/bubble'

// ==================== Local Locale Mock ====================
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

// ==================== Style ====================
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
    chatPrompt: css`
      .ant-prompts-label {
        color: #000000e0 !important;
      }
      .ant-prompts-desc {
        color: #000000a6 !important;
        width: 100%;
      }
      .ant-prompts-icon {
        color: #000000a6 !important;
      }
    `,
    chatList: css`
      flex: 1;
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
    sender: css`
      width: 100%;
      max-width: 840px;
    `,
    senderPrompt: css`
      width: 100%;
      max-width: 840px;
      margin: 0 auto;
      color: ${token.colorText};
    `,
  }
})

// ==================== Static Config ====================
const HISTORY_MESSAGES: { [key: string]: DefaultMessageInfo<ChatMessage>[] } = {
  'default-1': [
    { message: { role: 'user', content: '重构一下这部分 Auth 逻辑' }, status: 'success' },
    {
      message: {
        role: 'assistant',
        content: '<think>\n检测到需要重构 Auth 逻辑，由于目前使用旧版方案，应当升级为 JWT。\n</think>\n已提取 3 处需重构项。\n\n根据计划，我们需要修改 `auth.ts`。由于修改影响面较广，这里需要您先确认计划是否符合预期：',
        extraInfo: { requiresConfirm: true },
      },
      status: 'success',
    },
  ],
  'default-2': [
    { message: { role: 'user', content: locale.newAgiHybridInterface }, status: 'success' },
    { message: { role: 'assistant', content: locale.aiMessage_1 }, status: 'success' },
  ],
}

const DEFAULT_CONVERSATIONS_ITEMS = [
  { key: 'default-1', label: '重构 Auth 服务', group: locale.today },
  { key: 'default-2', label: '集成 Stripe 支付', group: locale.yesterday },
]

const HOT_TOPICS = {
  key: '1',
  label: locale.hotTopics,
  children: [
    {
      key: '1-1',
      description: '继续执行当前推荐的操作',
      icon: <span style={{ color: '#5b7cfa', fontWeight: 700 }}>1</span>,
    },
    {
      key: '1-2',
      description: '放弃当前任务，重新规划',
      icon: <span style={{ color: '#ff6565', fontWeight: 700 }}>2</span>,
    },
  ],
}

const SENDER_PROMPTS: GetProp<typeof Prompts, 'items'> = [
  { key: '1', description: locale.components, icon: <ProductOutlined /> },
  { key: '2', description: locale.richGuide, icon: <FileSearchOutlined /> },
]

const THOUGHT_CHAIN_CONFIG = {
  loading: { title: locale.modelIsRunning, status: 'loading' },
  updating: { title: locale.modelIsRunning, status: 'loading' },
  success: { title: locale.modelExecutionCompleted, status: 'success' },
  error: { title: locale.executionFailed, status: 'error' },
  abort: { title: locale.aborted, status: 'abort' },
}

// ==================== Type ====================
interface ChatMessage extends XModelMessage {
  extraInfo?: {
    feedback?: ActionsFeedbackProps['value']
    requiresConfirm?: boolean
  }
}

// ==================== Context ====================
const ChatContext = React.createContext<{
  onReload?: ReturnType<typeof useXChat>['onReload']
  setMessage?: ReturnType<typeof useXChat<ChatMessage>>['setMessage']
}>({})

// ==================== Sub Component ====================
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

  // 渲染确认交互按钮，满足“最后在需要用户确认的时候是在聊天窗口中渲染确认按钮”的要求
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
        <Button onClick={() => message.info('用户已拒绝，正在转为对话模式重新规划')}>
          沟通调整 (Discuss)
        </Button>
      </Space>
    )
  }

  const Items = [
    { key: 'copy', actionRender: <Actions.Copy text={content} /> },
    {
      key: 'feedback',
      actionRender: (
        <Actions.Feedback
          styles={{ liked: { color: '#5b7cfa' } }}
          value={extraInfo?.feedback || 'default'}
          key="feedback"
          onChange={(val) => {
            if (id) {
              context?.setMessage?.(id, () => ({ extraInfo: { ...extraInfo, feedback: val } }))
              message.success(`${id}: ${val}`)
            }
          }}
        />
      ),
    },
  ]
  return <div style={{ display: 'flex', marginTop: 12 }}>{id && <Actions items={Items} />}</div>
}

// ==================== Chat Provider ====================
// 使用虚拟的 provider 阻断对外部的真实 HTTP 请求以免报错，只为了 UI 展示
const providerCaches = new Map<string, DeepSeekChatProvider>()
const providerFactory = (conversationKey: string) => {
  if (!providerCaches.get(conversationKey)) {
    providerCaches.set(
      conversationKey,
      new DeepSeekChatProvider({
        request: XRequest<XModelParams, Partial<Record<SSEFields, XModelResponse>>>(
          'https://api.x.ant.design/api/big_model_glm-4.5-flash',
          { manual: true, params: { stream: true, model: 'glm-4.5-flash' } },
        ),
      })
    )
  }
  return providerCaches.get(conversationKey)
}

const historyMessageFactory = (conversationKey: string): DefaultMessageInfo<ChatMessage>[] => {
  return HISTORY_MESSAGES[conversationKey] || []
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
      <Footer content={content} status={status} extraInfo={extraInfo as ChatMessage['extraInfo']} id={key as string} />
    ),
    contentRender: (content: any, { status }) => {
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

export function App() {
  const { styles } = useStyle()
  
  // ==================== State ====================
  const { conversations, activeConversationKey, setActiveConversationKey, addConversation, setConversations } =
    useXConversations({
      defaultConversations: DEFAULT_CONVERSATIONS_ITEMS,
      defaultActiveConversationKey: DEFAULT_CONVERSATIONS_ITEMS[0].key,
    })
  const [messageApi, contextHolder] = message.useMessage()
  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<GetProp<typeof Attachments, 'items'>>([])
  const [inputValue, setInputValue] = useState('')
  const listRef = useRef<BubbleListRef>(null)

  // ==================== Runtime ====================
  const { onRequest, messages, isRequesting, abort, onReload, setMessage } = useXChat<ChatMessage>({
    provider: providerFactory(activeConversationKey),
    conversationKey: activeConversationKey,
    defaultMessages: historyMessageFactory(activeConversationKey),
    requestPlaceholder: () => ({ content: locale.noData, role: 'assistant' }),
    requestFallback: (_, { error }) => {
      return { content: error?.name === 'AbortError' ? locale.requestAborted : locale.requestFailed, role: 'assistant' }
    },
  })

  // ==================== Event ====================
  const onSubmit = (val: string) => {
    if (!val) return
    // 对于 Mock，直接注入假响应
    onRequest({ messages: [{ role: 'user', content: val }] })
    listRef.current?.scrollTo({ top: 'bottom' })
    setActiveConversationKey(activeConversationKey)
  }

  // ==================== Nodes ====================
  const chatSide = (
    <div className={styles.side}>
      <div className={styles.logo}>
        <div style={{
          width: 24, height: 24, background: 'linear-gradient(135deg, #8eb0ff 0%, #5b7cfa 100%)',
          borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
        }}>
          ILS
        </div>
        <span>AgentILS</span>
      </div>
      <Conversations
        creation={{
          onClick: () => {
            const now = dayjs().valueOf().toString()
            addConversation({ key: now, label: `${locale.newConversation} ${conversations.length + 1}`, group: locale.today })
            setActiveConversationKey(now)
          },
        }}
        items={conversations.map(({ key, label, ...other }) => ({
          key,
          label: key === activeConversationKey ? `[${locale.curConversation}] ${label}` : label,
          ...other,
        }))}
        className={styles.conversations}
        activeKey={activeConversationKey}
        onActiveChange={setActiveConversationKey}
        groupable
        styles={{ item: { padding: '0 8px' } }}
        menu={(conversation) => ({
          items: [
            { label: locale.rename, key: 'rename', icon: <EditOutlined /> },
            {
              label: locale.delete, key: 'delete', icon: <DeleteOutlined />, danger: true,
              onClick: () => {
                const newList = conversations.filter((item) => item.key !== conversation.key)
                setConversations(newList)
                if (conversation.key === activeConversationKey) setActiveConversationKey(newList?.[0]?.key || '')
              },
            },
          ],
        })}
      />
      <div className={styles.sideFooter}>
        <Avatar size={24} style={{ background: '#5b7cfa' }}>U</Avatar>
        <Button type="text" icon={<QuestionCircleOutlined />} />
      </div>
    </div>
  )

  const chatList = (
    <div className={styles.chatList}>
      {messages?.length ? (
        <Bubble.List
          ref={listRef}
          items={messages?.map((i) => ({
            ...i.message,
            key: i.id,
            status: i.status,
            loading: i.status === 'loading',
            extraInfo: i.extraInfo,
          }))}
          styles={{ root: { maxWidth: 940 } }}
          role={getRole()}
        />
      ) : (
        <Flex vertical style={{ maxWidth: 840 }} gap={16} align="center" className={styles.placeholder}>
          <Welcome
            style={{ width: '100%' }}
            variant="borderless"
            icon="https://mdn.alipayobjects.com/huamei_iwk9zp/afts/img/A*s5sNRo5LjfQAAAAAAAAAAAAADgCCAQ/fmt.webp"
            title={locale.welcome}
            description={locale.welcomeDescription}
            extra={<Space><Button icon={<ShareAltOutlined />} /><Button icon={<EllipsisOutlined />} /></Space>}
          />
          <Flex gap={16} justify="center" style={{ width: '100%' }}>
            <Prompts
              items={[HOT_TOPICS]}
              styles={{
                list: { height: '100%' },
                item: { flex: 1, backgroundImage: 'linear-gradient(123deg, #e5f4ff 0%, #efe7ff 100%)', borderRadius: 12, border: 'none' },
                subItem: { padding: 0, background: 'transparent' },
              }}
              onItemClick={(info) => onSubmit(info.data.description as string)}
              className={styles.chatPrompt}
            />
          </Flex>
        </Flex>
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
        placeholder={(type) => type === 'drop' ? { title: locale.dropFileHere } : { icon: <CloudUploadOutlined />, title: locale.uploadFiles, description: locale.clickOrDragFilesToUpload }}
      />
    </Sender.Header>
  )

  const chatSender = (
    <Flex vertical gap={12} align="center" style={{ margin: 8 }}>
      {!attachmentsOpen && (
        <Prompts
          items={SENDER_PROMPTS}
          onItemClick={(info) => onSubmit(info.data.description as string)}
          styles={{ item: { padding: '6px 12px' } }}
          className={styles.senderPrompt}
        />
      )}
      
      {/* 使用 Suggestion 提供 /newtask 等快速提示 */}
      <Suggestion
        items={[
          { label: '/newtask 开启新任务', value: '/newtask' },
          { label: '/exitConversation 结束本次会话', value: '/exitConversation' },
          { label: '/direct 进入直接交流模式', value: '/direct' }
        ]}
        onSelect={(value) => {
          setInputValue(value)
        }}
      >
        {({ onTrigger, onKeyDown }) => (
          <Sender
            value={inputValue}
            header={senderHeader}
            onSubmit={() => {
              onSubmit(inputValue)
              setInputValue('')
            }}
            onChange={(val) => {
              setInputValue(val)
              onTrigger(val)
            }}
            onKeyDown={onKeyDown}
            onCancel={abort}
            prefix={
              <Button
                type="text"
                icon={<PaperClipOutlined style={{ fontSize: 18 }} />}
                onClick={() => setAttachmentsOpen(!attachmentsOpen)}
              />
            }
            loading={isRequesting}
            className={styles.sender}
            allowSpeech
            placeholder={locale.askOrInputUseSkills}
          />
        )}
      </Suggestion>
    </Flex>
  )

  return (
    <XProvider locale={{}}>
      <ChatContext.Provider value={{ onReload, setMessage }}>
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
