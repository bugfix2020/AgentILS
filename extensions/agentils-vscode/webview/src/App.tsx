import { Sender, XProvider } from '@ant-design/x'
import { App as AntdApp, theme } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { postMessage } from './vscode-api'
import { logger } from './logger'
import type {
  AgentILSPanelState,
  TaskConsoleComposerMode,
  WebviewIncomingMessage,
} from './types'
import { HeaderBar } from './components/HeaderBar'
import { WelcomeScreen } from './components/WelcomeScreen'
import { Sidebar } from './components/Sidebar'
import { BubbleRenderer, toBubbleItems } from './components/Bubble'
import { buildTranscriptViewModel } from './viewModel'
import {
  getModeAlertMessage,
  getModeAlertType,
} from './utils'
import { Alert } from 'antd'

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

function createDefaultSession(): any {
  const now = new Date().toISOString()
  return {
    sessionId: `session_${Date.now()}`,
    status: 'active',
    conversationId: '',
    runId: null,
    messages: [],
    queuedUserMessageIds: [],
    pendingInteraction: null,
    createdAt: now,
    updatedAt: now,
  }
}

const initialState: AgentILSPanelState = {
  snapshot: {
    conversation: {
      conversationId: '',
      state: 'await_next_task',
      taskIds: [],
      activeTaskId: null,
      lastSummaryTaskId: null,
      createdAt: '',
      updatedAt: '',
    },
    activeTask: null,
    taskHistory: [],
    latestSummary: null,
    session: createDefaultSession(),
  },
  pendingInteraction: null,
  controlMode: 'normal',
  overrideActive: false,
}

// ---------------------------------------------------------------------------
// Bootstrap helper
// ---------------------------------------------------------------------------

function getBootstrapMessage(): WebviewIncomingMessage | null {
  const value = window.__AGENTILS_BOOTSTRAP__
  logger.debug('App', 'getBootstrapMessage_called', { bootstrapValue: value })
  if (!value || typeof value !== 'object') {
    logger.warn('App', 'no_bootstrap_value_found')
    return null
  }
  const message = value as Partial<WebviewIncomingMessage>
  const isValid = (message.type !== 'bootstrap' && message.type !== 'stateUpdate' && message.type !== 'sessionUpdate') || !message.payload || !message.composerMode
  if (isValid) {
    logger.warn('App', 'invalid_bootstrap_message', { message })
    return null
  }
  logger.info('App', 'bootstrap_message_valid', { type: message.type, hasSession: !!message.payload?.snapshot.session })
  return message as WebviewIncomingMessage
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App() {
  const bootstrap = getBootstrapMessage()
  const [state, setState] = useState<AgentILSPanelState>(bootstrap?.payload ?? initialState)
  const [, setComposerMode] = useState<TaskConsoleComposerMode>(bootstrap?.composerMode ?? 'newTask')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')

  const [updateCount, setUpdateCount] = useState(0)

  useEffect(() => {
    const handler = (event: MessageEvent<WebviewIncomingMessage>) => {
      if (!event.data || (event.data.type !== 'bootstrap' && event.data.type !== 'stateUpdate' && event.data.type !== 'sessionUpdate')) {
        logger.debug('App', 'message_ignored', { type: (event.data as any)?.type })
        return
      }
      logger.info('App', 'state_update_received', { type: event.data.type, hasSession: !!event.data.payload?.snapshot.session })
      console.log('[AgentILS WebView] stateUpdate received, messages:', event.data.payload?.snapshot?.session?.messages?.length ?? 0)
      setState(event.data.payload)
      setUpdateCount((c) => c + 1)
      setComposerMode(event.data.composerMode)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const transcriptItems = useMemo(() => buildTranscriptViewModel(state), [state])
  const bubbleItems = useMemo(() => toBubbleItems(transcriptItems), [transcriptItems])

  const task = state.snapshot.activeTask
  const session = state.snapshot.session
  const sessionActive = session?.status === 'active'

  // 日志记录：pending interaction 的触发条件
  useEffect(() => {
    if (state.pendingInteraction) {
      logger.info('App', 'pending_interaction_shown', {
        kind: state.pendingInteraction.kind,
        title: state.pendingInteraction.title,
        hasUserInput: (state.snapshot.session?.messages ?? []).length > 0,
        messageCount: (state.snapshot.session?.messages ?? []).length,
      })
    }
  }, [state.pendingInteraction])

  const topAlert = state.pendingInteraction
    ? { type: 'warning' as const, message: '当前有待处理的引导问题', description: `${state.pendingInteraction.title}：${state.pendingInteraction.description}` }
    : (state.controlMode === 'alternate' || state.controlMode === 'direct')
      ? { type: getModeAlertType(state.controlMode), message: '当前任务处于' + getModeAlertMessage(state.controlMode).split('，')[0], description: getModeAlertMessage(state.controlMode) }
      : null

  const handleSend = (text: string) => {
    if (!text.trim() || !sessionActive) {
      logger.warn('App', 'message_send_blocked', { reason: !text.trim() ? 'empty_input' : 'session_not_active' })
      return
    }
    logger.info('App', 'user_message_submitted', { content: text.substring(0, 100) })
    postMessage({ action: 'submitSessionMessage', content: text })
    setInputValue('')
  }

  return (
    <XProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#66d3a7',
          colorBgBase: '#09111f',
          colorBgContainer: '#111827',
          colorBorderSecondary: '#22304b',
          colorTextBase: '#f1f5ff',
          borderRadius: 12,
          fontSize: 14,
        },
      }}
    >
      <AntdApp>
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at top, #111a2d 0%, #09111f 55%, #060b13 100%)', overflow: 'hidden' }}>

          <HeaderBar
            taskTitle={task?.title}
            taskPhase={task?.phase}
            taskStatus={task?.status}
            controlMode={state.controlMode}
            sessionActive={sessionActive}
            onOpenSidebar={() => setSidebarOpen(true)}
          />

          {/* DEBUG: state update counter */}
          <div style={{ background: '#ff4444', color: 'white', padding: '2px 8px', fontSize: 11, textAlign: 'center' }}>
            Updates: {updateCount} | Messages: {session?.messages?.length ?? 0} | Bubbles: {bubbleItems.length} | Session: {session?.status ?? 'null'}
          </div>

          {topAlert ? (
            <div style={{ maxWidth: 860, margin: '0 auto', width: '100%', padding: '8px 20px 0', boxSizing: 'border-box' }}>
              <Alert type={topAlert.type} showIcon message={topAlert.message} description={topAlert.description} />
            </div>
          ) : null}

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', maxWidth: 860, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
            {bubbleItems.length === 0
              ? <WelcomeScreen onPromptClick={(text) => setInputValue(text)} />
              : <BubbleRenderer items={bubbleItems} />
            }
          </div>

          <div style={{ maxWidth: 860, margin: '0 auto', width: '100%', padding: '0 20px 16px', boxSizing: 'border-box', flexShrink: 0 }}>
            <Sender
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSend}
              onCancel={() => postMessage({ action: 'finishSession' })}
              disabled={!sessionActive}
              placeholder={sessionActive ? '继续输入你的指令、确认、补充信息或反馈……' : '当前会话已结束，无法继续输入'}
              autoSize={{ minRows: 2, maxRows: 8 }}
              footer={sessionActive ? '按 Enter 发送 · 消息追加到当前会话' : '会话结束后输入区已禁用，请重新开始新会话'}
            />
          </div>
        </div>

        <Sidebar state={state} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </AntdApp>
    </XProvider>
  )
}
