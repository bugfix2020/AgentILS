import { randomUUID } from 'node:crypto'
import { mcpLogger } from '../logger.js'
import { createTask } from '../types/task.js'
import type {
  AgentILSTask,
  LoopDirective,
  RunTaskLoopInput,
  RunTaskLoopResult,
  StateSnapshot,
  TaskInteraction,
  TaskInteractionAction,
  TaskInteractionResult,
} from '../types/index.js'
import { AgentGateMemoryStore } from '../store/memory-store.js'
import type { ResourceNotifier } from '../gateway/context.js'

const noopNotifier: ResourceNotifier = {
  notify: () => {},
  notifyTask: () => {},
}

function nowIso() {
  return new Date().toISOString()
}

function summarizeIntent(input: string) {
  return input.trim().replace(/\s+/g, ' ')
}

function isSyntheticInteractionMessage(message?: string) {
  return typeof message === 'string' && message.startsWith('__webview_')
}

function buildPlanSummary(task: AgentILSTask) {
  const basis = task.collectedInputs.join(' ').trim() || task.goal
  return `Plan for: ${basis}`
}

function detectRisks(task: AgentILSTask): string[] {
  const haystack = [task.goal, ...task.collectedInputs].join(' ').toLowerCase()
  const risks: string[] = []
  if (/(delete|remove|reset|drop|force)/.test(haystack)) {
    risks.push('Potentially destructive change detected')
  }
  if (/(prod|production|database)/.test(haystack)) {
    risks.push('Touches a sensitive environment')
  }
  return risks
}

function createInteraction(params: {
  kind: TaskInteraction['kind']
  title: string
  description: string
  actions?: TaskInteractionAction[]
  inputHint?: string
  reopenCount?: number
}): TaskInteraction {
  return {
    interactionKey: `interaction_${randomUUID()}`,
    requestId: `request_${randomUUID()}`,
    kind: params.kind,
    title: params.title,
    description: params.description,
    actions: params.actions ?? [],
    inputHint: params.inputHint,
    reopenCount: params.reopenCount ?? 0,
  }
}

type PendingResolver = (result: TaskInteractionResult) => void

export class AgentGateOrchestrator {
  private notifiers = new Set<ResourceNotifier>()
  // Phase 5: tool-side Promise suspension. When runTaskLoop returns
  // await_webview, the caller (gateway tool handler) parks here until the
  // webview / extension submits a resolution via resolveInteraction(taskId).
  private pendingResolvers = new Map<string, PendingResolver>()

  constructor(private readonly store: AgentGateMemoryStore) {}

  /**
   * Park the current caller until an interaction result for `taskId` arrives
   * (via resolveInteraction). Honors AbortSignal so the gateway tool can
   * cancel the wait when the MCP request is cancelled. Only one waiter per
   * taskId is supported; a second registration evicts the previous one (to
   * avoid resource leaks if the LLM somehow recalls the tool).
   */
  awaitInteraction(taskId: string, signal?: AbortSignal): Promise<TaskInteractionResult> {
    return new Promise<TaskInteractionResult>((resolve, reject) => {
      const previous = this.pendingResolvers.get(taskId)
      if (previous) {
        mcpLogger.info('orchestrator', 'awaitInteraction:replacing-existing', { taskId })
      }
      const cleanup = () => {
        this.pendingResolvers.delete(taskId)
        signal?.removeEventListener('abort', onAbort)
      }
      const onAbort = () => {
        cleanup()
        reject(new Error('aborted'))
      }
      if (signal?.aborted) {
        reject(new Error('aborted'))
        return
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.pendingResolvers.set(taskId, (result) => {
        cleanup()
        resolve(result)
      })
      mcpLogger.info('orchestrator', 'awaitInteraction:registered', { taskId })
    })
  }

  /**
   * Resolve a parked awaitInteraction. Returns true if a waiter was found.
   * Callers (e.g. submit_interaction_result tool) can decide what to do when
   * no waiter exists (typical: store-only update, no Promise to fulfill).
   */
  resolveInteraction(taskId: string, result: TaskInteractionResult): boolean {
    const resolver = this.pendingResolvers.get(taskId)
    if (!resolver) {
      mcpLogger.info('orchestrator', 'resolveInteraction:no-waiter', { taskId, interactionKey: result.interactionKey })
      return false
    }
    mcpLogger.info('orchestrator', 'resolveInteraction:fulfilling', {
      taskId,
      interactionKey: result.interactionKey,
      actionId: result.actionId,
    })
    resolver(result)
    return true
  }

  /** Test/debug helper: drop all pending resolvers (e.g. on shutdown). */
  clearPendingResolvers(): void {
    this.pendingResolvers.clear()
  }

  /**
   * Wire a resource-update notifier (Phase 4). Multiple notifiers may be
   * registered concurrently — one per connected MCP client transport — so
   * push notifications fan out to every subscribed client. Returns a
   * disposable that the caller MUST invoke when the transport closes,
   * otherwise notifications will be sent to a dead transport.
   */
  addNotifier(notifier: ResourceNotifier): { dispose: () => void } {
    this.notifiers.add(notifier)
    return { dispose: () => { this.notifiers.delete(notifier) } }
  }

  /**
   * Back-compat: existing call sites that only need a single notifier.
   * Replaces the entire notifier set with this one notifier.
   */
  setNotifier(notifier: ResourceNotifier): void {
    this.notifiers.clear()
    if (notifier) this.notifiers.add(notifier)
  }

  private fanout(fn: (n: ResourceNotifier) => void) {
    for (const n of this.notifiers) {
      try { fn(n) } catch { /* notifier failures must not break orchestration */ }
    }
  }

  stateGet(taskId?: string | null): StateSnapshot {
    mcpLogger.debug('orchestrator', 'stateGet', { taskId: taskId ?? null })
    return this.store.buildSnapshot(taskId)
  }

  runTaskLoop(input: RunTaskLoopInput): RunTaskLoopResult {
    mcpLogger.info('orchestrator', 'runTaskLoop:start', input)
    this.store.ensureSession(input.sessionId)
    this.store.reopenSession()

    let task = this.resolveTask(input)
    if (!task) {
      const initialIntent = input.userIntent?.trim() || 'New task'
      task = createTask({
        sessionId: this.store.getSession().sessionId,
        userIntent: initialIntent,
        now: nowIso(),
      })
      this.store.saveTask(task)
      this.store.setActiveTask(task.taskId)
      mcpLogger.info('orchestrator', 'runTaskLoop:task-created', {
        taskId: task.taskId,
        goal: task.goal,
      })
      this.store.appendTimeline({
        role: 'system',
        kind: 'status',
        content: { event: 'task_created', taskId: task.taskId },
      })
    }

    if (input.userIntent?.trim()) {
      task = this.handleUserIntent(task, input.userIntent.trim())
    }

    if (input.interactionResult) {
      task = this.handleInteractionResult(task, input.interactionResult)
    }

    if (task.terminal !== 'active') {
      const status = task.terminal === 'completed' ? 'done' : task.terminal
      mcpLogger.info('orchestrator', 'runTaskLoop:terminal', {
        taskId: task.taskId,
        terminal: task.terminal,
        status,
      })
      return this.finishResult(task, status)
    }

    const directive = input.directive ?? 'noop'
    task = this.applyDirective(task, directive)

    const snapshot = this.store.buildSnapshot(task.taskId)
    const nextAction = task.pendingInteraction
      ? 'await_webview'
      : task.terminal === 'active' && task.phase !== 'summarize'
        ? 'recall_tool'
        : 'return_control'
    mcpLogger.info('orchestrator', 'runTaskLoop:result', {
      taskId: task.taskId,
      phase: task.phase,
      terminal: task.terminal,
      hasInteraction: Boolean(task.pendingInteraction),
      nextAction,
      shouldRecallTool: nextAction === 'recall_tool',
    })
    // Phase 4: notify subscribed clients that this task's state changed.
    this.fanout((n) => n.notifyTask(task.taskId))
    return {
      status: 'continue',
      task: {
        taskId: task.taskId,
        phase: task.phase,
        controlMode: task.controlMode,
        terminal: task.terminal,
      },
      interaction: task.pendingInteraction,
      output: {
        summary: this.describeTask(task),
        userVisibleMessage: this.describeTask(task),
      },
      next: {
        action: nextAction,
        shouldRecallTool: nextAction === 'recall_tool',
        canRenderWebview: nextAction === 'await_webview',
      },
      snapshot,
    }
  }

  private resolveTask(input: RunTaskLoopInput): AgentILSTask | null {
    return this.store.getTask(input.taskId) ?? this.store.getActiveTask()
  }

  private handleUserIntent(task: AgentILSTask, userIntent: string): AgentILSTask {
    if (isSyntheticInteractionMessage(userIntent)) {
      mcpLogger.debug('orchestrator', 'handleUserIntent:ignored-synthetic', {
        taskId: task.taskId,
        userIntent,
      })
      return task
    }

    mcpLogger.info('orchestrator', 'handleUserIntent', {
      taskId: task.taskId,
      userIntent,
    })
    if (userIntent === '/exitConversation') {
      const next = this.store.transitionTask(task.taskId, {
        terminal: 'abandoned',
        pendingInteraction: null,
      })
      this.store.appendTimeline({
        role: 'user',
        kind: 'text',
        content: userIntent,
      })
      this.store.appendTimeline({
        role: 'system',
        kind: 'status',
        content: { event: 'conversation_exited', taskId: task.taskId },
      })
      this.store.closeSession()
      this.store.setActiveTask(null)
      return next
    }

    if (userIntent.startsWith('/newtask')) {
      const current = this.store.transitionTask(task.taskId, {
        terminal: 'abandoned',
        pendingInteraction: null,
      })
      this.store.appendTimeline({
        role: 'user',
        kind: 'text',
        content: userIntent,
      })
      const seed = userIntent.replace('/newtask', '').trim() || 'New task'
      const nextTask = createTask({
        sessionId: current.sessionId,
        userIntent: seed,
        now: nowIso(),
      })
      this.store.saveTask(nextTask)
      this.store.setActiveTask(nextTask.taskId)
      this.store.appendTimeline({
        role: 'system',
        kind: 'status',
        content: { event: 'task_restarted', taskId: nextTask.taskId },
      })
      return nextTask
    }

    this.store.appendTimeline({
      role: 'user',
      kind: 'text',
      content: userIntent,
    })

    return this.store.transitionTask(task.taskId, {
      collectedInputs: [...task.collectedInputs, userIntent],
    })
  }

  private handleInteractionResult(task: AgentILSTask, interactionResult: TaskInteractionResult): AgentILSTask {
    if (isSyntheticInteractionMessage(interactionResult.message)) {
      mcpLogger.debug('orchestrator', 'handleInteractionResult:ignored-synthetic', {
        taskId: task.taskId,
        interactionResult,
      })
      return task
    }

    mcpLogger.info('orchestrator', 'handleInteractionResult', {
      taskId: task.taskId,
      interactionResult,
    })
    const pending = task.pendingInteraction
    if (!pending) {
      return task
    }

    if (interactionResult.closed) {
      const reopened = this.store.bumpInteractionReopen(interactionResult) ?? task
      this.store.appendTimeline({
        role: 'system',
        kind: 'status',
        content: { event: 'ui_closed', interactionKey: interactionResult.interactionKey },
      })
      return reopened
    }

    if (interactionResult.interactionKey !== pending.interactionKey) {
      return task
    }

    this.store.appendTimeline({
      role: 'system',
      kind: 'interaction_resolved',
      content: interactionResult,
    })

    switch (pending.kind) {
      case 'plan_confirm':
        if (interactionResult.actionId === 'execute') {
          return this.store.transitionTask(task.taskId, { phase: 'execute', pendingInteraction: null })
        }
        return this.store.transitionTask(task.taskId, {
          phase: 'collect',
          pendingInteraction: null,
          collectedInputs: interactionResult.message
            ? [...task.collectedInputs, interactionResult.message]
            : task.collectedInputs,
        })
      case 'risk_confirm':
        if (interactionResult.actionId === 'switch_to_direct') {
          return this.store.transitionTask(task.taskId, {
            controlMode: 'direct',
            phase: 'execute',
            pendingInteraction: null,
          })
        }
        if (interactionResult.actionId === 'accept_risk') {
          return this.store.transitionTask(task.taskId, {
            controlMode: 'alternate',
            phase: 'execute',
            pendingInteraction: null,
          })
        }
        return this.store.transitionTask(task.taskId, {
          phase: 'plan',
          pendingInteraction: null,
        })
      case 'test_confirm':
        if (interactionResult.actionId === 'replan') {
          return this.store.transitionTask(task.taskId, {
            phase: 'plan',
            pendingInteraction: null,
          })
        }
        return this.store.transitionTask(task.taskId, {
          phase: 'summarize',
          pendingInteraction: null,
        })
      case 'finish_confirm':
        return this.store.transitionTask(task.taskId, {
          terminal: 'completed',
          pendingInteraction: null,
        })
      case 'clarification':
      default:
        return this.store.transitionTask(task.taskId, {
          phase: 'collect',
          pendingInteraction: null,
          collectedInputs: interactionResult.message
            ? [...task.collectedInputs, interactionResult.message]
            : task.collectedInputs,
        })
    }
  }

  private applyDirective(task: AgentILSTask, directive: LoopDirective): AgentILSTask {
    switch (directive) {
      case 'draft_plan':
        return this.moveToPlan(task)
      case 'request_clarification':
        return this.requestClarification(task)
      case 'execute':
        return this.enterExecution(task)
      case 'execution_succeeded':
        return this.finishExecution(task)
      case 'execution_failed':
        return this.store.transitionTask(task.taskId, {
          phase: 'plan',
          pendingInteraction: this.buildPlanConfirmInteraction(task),
        })
      case 'tests_passed':
        return this.finishTesting(task, true)
      case 'tests_failed':
        return this.finishTesting(task, false)
      case 'finish':
        return this.prepareFinish(task)
      case 'noop':
      default:
        return this.defaultProgress(task)
    }
  }

  private defaultProgress(task: AgentILSTask): AgentILSTask {
    switch (task.phase) {
      case 'collect':
        return this.moveToPlan(task)
      case 'plan':
        return task.pendingInteraction ? task : this.store.transitionTask(task.taskId, {
          pendingInteraction: this.buildPlanConfirmInteraction(task),
        })
      case 'execute':
        return this.enterExecution(task)
      case 'test':
        return this.finishTesting(task, true)
      case 'summarize':
        return this.prepareFinish(task)
      default:
        return task
    }
  }

  private moveToPlan(task: AgentILSTask): AgentILSTask {
    const planSummary = buildPlanSummary(task)
    const risks = detectRisks(task)
    const next = this.store.transitionTask(task.taskId, {
      phase: 'plan',
      planSummary,
      risks,
      pendingInteraction: this.buildPlanConfirmInteraction(task),
    })
    mcpLogger.info('orchestrator', 'moveToPlan', {
      taskId: task.taskId,
      risks,
      planSummary,
    })
    this.store.appendTimeline({
      role: 'assistant',
      kind: 'text',
      content: planSummary,
    })
    this.store.appendTimeline({
      role: 'system',
      kind: 'interaction_opened',
      content: next.pendingInteraction,
    })
    return next
  }

  private requestClarification(task: AgentILSTask): AgentILSTask {
    const interaction = createInteraction({
      kind: 'clarification',
      title: '需要更多信息',
      description: '请继续补充自然语言信息，或明确澄清当前需求。',
      inputHint: '继续描述需求或限制条件',
    })
    return this.store.transitionTask(task.taskId, {
      phase: 'collect',
      pendingInteraction: interaction,
    })
  }

  private buildPlanConfirmInteraction(task: AgentILSTask): TaskInteraction {
    return createInteraction({
      kind: 'plan_confirm',
      title: '方案已生成',
      description: task.planSummary ?? buildPlanSummary(task),
      actions: [
        { id: 'execute', label: '开始执行' },
        { id: 'continue_input', label: '继续补充' },
        { id: 'clarify', label: '澄清问题' },
      ],
      inputHint: '也可以直接输入新的补充说明',
    })
  }

  private enterExecution(task: AgentILSTask): AgentILSTask {
    if (task.risks.length > 0 && task.controlMode === 'normal') {
      const interaction = createInteraction({
        kind: 'risk_confirm',
        title: '检测到风险项',
        description: task.risks.join('；'),
        actions: [
          { id: 'accept_risk', label: '确认继续' },
          { id: 'switch_to_direct', label: '切到 direct' },
          { id: 'cancel', label: '回到 plan' },
        ],
      })
      const next = this.store.transitionTask(task.taskId, {
        phase: 'execute',
        pendingInteraction: interaction,
      })
      mcpLogger.info('orchestrator', 'enterExecution:risk-gate', {
        taskId: task.taskId,
        risks: task.risks,
      })
      this.store.appendTimeline({
        role: 'system',
        kind: 'interaction_opened',
        content: interaction,
      })
      return next
    }

    const executionResult = `Executed: ${task.planSummary ?? buildPlanSummary(task)}`
    mcpLogger.info('orchestrator', 'enterExecution:executed', {
      taskId: task.taskId,
      executionResult,
    })
    const next = this.store.transitionTask(task.taskId, {
      phase: 'test',
      executionResult,
      pendingInteraction: null,
    })
    this.store.appendTimeline({
      role: 'tool',
      kind: 'tool_result',
      content: executionResult,
    })
    return next
  }

  private finishExecution(task: AgentILSTask): AgentILSTask {
    return this.store.transitionTask(task.taskId, {
      phase: 'test',
      executionResult: task.executionResult ?? `Executed: ${task.planSummary ?? buildPlanSummary(task)}`,
      pendingInteraction: null,
    })
  }

  private finishTesting(task: AgentILSTask, passed: boolean): AgentILSTask {
    mcpLogger.info('orchestrator', 'finishTesting', {
      taskId: task.taskId,
      passed,
    })
    if (!passed) {
      const interaction = createInteraction({
        kind: 'test_confirm',
        title: '测试未通过',
        description: '当前测试未通过，选择重新规划或继续确认结果。',
        actions: [
          { id: 'replan', label: '回到 plan' },
          { id: 'accept_test', label: '接受当前结果' },
        ],
      })
      const next = this.store.transitionTask(task.taskId, {
        phase: 'test',
        testResult: 'Tests failed',
        pendingInteraction: interaction,
      })
      this.store.appendTimeline({
        role: 'system',
        kind: 'interaction_opened',
        content: interaction,
      })
      return next
    }

    return this.store.transitionTask(task.taskId, {
      phase: 'summarize',
      testResult: 'Tests passed',
      summary: task.summary ?? `Summary for ${task.title}`,
      pendingInteraction: this.buildFinishInteraction(task),
    })
  }

  private prepareFinish(task: AgentILSTask): AgentILSTask {
    mcpLogger.info('orchestrator', 'prepareFinish', {
      taskId: task.taskId,
    })
    return this.store.transitionTask(task.taskId, {
      phase: 'summarize',
      summary: task.summary ?? `Summary for ${task.title}`,
      pendingInteraction: task.pendingInteraction ?? this.buildFinishInteraction(task),
    })
  }

  private buildFinishInteraction(task: AgentILSTask): TaskInteraction {
    return createInteraction({
      kind: 'finish_confirm',
      title: '总结已生成',
      description: task.summary ?? `Summary for ${task.title}`,
      actions: [{ id: 'confirm_finish', label: '确认完成' }],
      inputHint: '或输入 /exitConversation 直接退出',
    })
  }

  private finishResult(task: AgentILSTask, status: RunTaskLoopResult['status']): RunTaskLoopResult {
    const snapshot = this.store.buildSnapshot(task.taskId)
    // Phase 4: terminal transitions are state changes too — push them.
    this.fanout((n) => n.notifyTask(task.taskId))
    return {
      status,
      reason: status === 'abandoned' ? 'conversation_exited' : undefined,
      task: {
        taskId: task.taskId,
        phase: task.phase,
        controlMode: task.controlMode,
        terminal: task.terminal,
      },
      interaction: null,
      output: {
        summary: this.describeTask(task),
        userVisibleMessage: this.describeTask(task),
      },
      next: {
        action: 'return_control',
        shouldRecallTool: false,
        canRenderWebview: false,
      },
      snapshot,
    }
  }

  private describeTask(task: AgentILSTask): string {
    if (task.terminal !== 'active') {
      return `${task.title} -> ${task.terminal}`
    }
    switch (task.phase) {
      case 'collect':
        return `Collecting intent for ${task.title}`
      case 'plan':
        return task.planSummary ?? buildPlanSummary(task)
      case 'execute':
        return task.executionResult ?? 'Executing current plan'
      case 'test':
        return task.testResult ?? 'Running tests'
      case 'summarize':
        return task.summary ?? 'Preparing summary'
      default:
        return task.title
    }
  }
}
