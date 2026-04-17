import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { ConversationService } from '../../src/control-plane/conversation-service.js'
import { AgentGateOrchestrator } from '../../src/orchestrator/orchestrator.js'
import { AgentGateMemoryStore } from '../../src/store/memory-store.js'
import { defaultConfig } from '../../src/config/defaults.js'
import { createAgentGateRequestContext } from '../../src/gateway/context.js'
import { registerGatewayTools } from '../../src/gateway/tools.js'

type ToolHandler = (input: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>
  isError?: boolean
}>

interface FakeServerRuntime {
  server: {
    registerTool: (name: string, meta: unknown, handler: ToolHandler) => void
    server: {
      elicitInput: (params: Record<string, unknown>) => Promise<Record<string, unknown>>
    }
  }
  tools: Map<string, ToolHandler>
  elicitCalls: Array<Record<string, unknown>>
  store: AgentGateMemoryStore
  orchestrator: AgentGateOrchestrator
}

function parseTextResult(response: Awaited<ReturnType<ToolHandler>>) {
  const text = response.content[0]?.text ?? ''
  const jsonStart = text.indexOf('\n')
  assert.notEqual(jsonStart, -1, 'Expected text result to contain a JSON payload.')
  return JSON.parse(text.slice(jsonStart + 1))
}

function createFakeGatewayRuntime(
  elicitResponder: (params: Record<string, unknown>) => Promise<Record<string, unknown>>,
): FakeServerRuntime {
  const tools = new Map<string, ToolHandler>()
  const elicitCalls: Array<Record<string, unknown>> = []
  const store = new AgentGateMemoryStore(join(tmpdir(), `agentils-test-${randomUUID()}.json`))
  const orchestrator = new AgentGateOrchestrator(store)

  const server = {
    registerTool(name: string, _meta: unknown, handler: ToolHandler) {
      tools.set(name, handler)
    },
    server: {
      async elicitInput(params: Record<string, unknown>) {
        elicitCalls.push(params)
        return elicitResponder(params)
      },
    },
  }

  registerGatewayTools({
    server: server as never,
    store,
    orchestrator,
    config: defaultConfig,
  })

  return {
    server,
    tools,
    elicitCalls,
    store,
    orchestrator,
  }
}

test('createAgentGateRequestContext forwards interaction through elicitUser', async () => {
  const calls: Array<Record<string, unknown>> = []
  const optionsCalls: Array<Record<string, unknown> | undefined> = []
  const ctx = createAgentGateRequestContext(
    {
      server: {
        server: {
          async elicitInput(params: Record<string, unknown>, options?: Record<string, unknown>) {
            calls.push(params)
            optionsCalls.push(options)
            return {
              action: 'accept',
              content: { status: 'continue' },
            }
          },
        },
      } as never,
    },
    {
      runId: 'run_1',
      conversationId: 'conversation_1',
      taskId: 'task_1',
      traceId: 'trace_fixed',
      now: () => '2026-04-14T00:00:00.000Z',
    },
  )

  const result = await ctx.elicitUser({
    mode: 'form',
    message: 'Need input',
  })

  assert.equal(ctx.runId, 'run_1')
  assert.equal(ctx.conversationId, 'conversation_1')
  assert.equal(ctx.taskId, 'task_1')
  assert.equal(ctx.traceId, 'trace_fixed')
  assert.equal(ctx.now(), '2026-04-14T00:00:00.000Z')
  assert.deepEqual(calls, [{ mode: 'form', message: 'Need input' }])
  assert.equal(optionsCalls.length, 1)
  assert.equal(optionsCalls[0]?.timeout, 2_147_483_647)
  assert.deepEqual(result, {
    action: 'accept',
    content: { status: 'continue' },
  })
})

test('createAgentGateRequestContext rejects interaction when disabled', async () => {
  const ctx = createAgentGateRequestContext(
    {
      server: {
        server: {
          async elicitInput() {
            throw new Error('should not be called')
          },
        },
      } as never,
    },
    {
      interactionAllowed: false,
    },
  )

  await assert.rejects(
    () =>
      ctx.elicitUser({
        mode: 'form',
      }),
    /User interaction is not allowed/,
  )
})

test('approval_request uses elicitation and advances accepted runs into execute', async () => {
  const runtime = createFakeGatewayRuntime(async () => ({
    action: 'accept',
    content: {
      action: 'accept',
      status: 'continue',
      msg: 'Proceed',
    },
  }))
  const handler = runtime.tools.get('approval_request')
  assert.ok(handler, 'approval_request should be registered')

  const run = runtime.orchestrator.startRun({
    title: 'Add request context',
    goal: 'Wrap elicitation with request-scoped context',
    scope: ['src/gateway'],
  })

  const response = await handler({
    runId: run.runId,
    summary: 'Need approval to continue',
    riskLevel: 'medium',
    toolName: 'edit_file',
    targets: ['src/gateway/tools.ts'],
  })

  const parsed = parseTextResult(response)
  const updatedRun = runtime.store.requireRun(run.runId)
  const updatedTaskCard = runtime.store.requireTaskCard(run.runId)

  assert.equal(runtime.elicitCalls.length, 1)
  assert.match(String(runtime.elicitCalls[0]?.message), /Need approval to continue/)
  assert.deepEqual(parsed, {
    action: 'accept',
    payload: {
      status: 'continue',
      msg: 'Proceed',
    },
  })
  assert.equal(updatedRun.currentStep, 'execute')
  assert.equal(updatedRun.currentStatus, 'active')
  assert.equal(updatedRun.controlMode, 'alternate')
  assert.equal(updatedTaskCard.overrideState?.confirmed, true)
  assert.equal(updatedTaskCard.overrideState?.mode, 'normal')
})

test('ui_task_start_gate uses elicitation and starts the task from returned payload', async () => {
  const runtime = createFakeGatewayRuntime(async () => ({
    action: 'accept',
    content: {
      title: 'Welcome onboarding',
      goal: 'Guide the user through the onboarding flow in the AgentILS panel',
      controlMode: 'normal',
    },
  }))
  const handler = runtime.tools.get('ui_task_start_gate')
  assert.ok(handler, 'ui_task_start_gate should be registered')

  const response = await handler({
    title: 'Draft onboarding task',
    goal: 'Initial draft',
    controlMode: 'normal',
  })

  const parsed = parseTextResult(response)

  assert.equal(runtime.elicitCalls.length, 1)
  assert.equal(runtime.elicitCalls[0]?.mode, 'form')
  assert.equal(runtime.elicitCalls[0]?._meta?.agentilsInteractionKind, 'startTask')
  assert.equal(parsed.activeTask?.title, 'Welcome onboarding')
  assert.equal(parsed.activeTask?.goal, 'Guide the user through the onboarding flow in the AgentILS panel')
  assert.equal(parsed.activeTask?.controlMode, 'normal')
  assert.equal(parsed.conversation.state, 'active_task')
})

test('approval_request promotes high-risk accepted approvals into direct mode', async () => {
  const runtime = createFakeGatewayRuntime(async () => ({
    action: 'accept',
    content: {
      action: 'accept',
      status: 'continue',
      msg: 'Proceed under hard override',
    },
  }))
  const handler = runtime.tools.get('approval_request')
  assert.ok(handler, 'approval_request should be registered')

  const run = runtime.orchestrator.startRun({
    title: 'High-risk approval',
    goal: 'Ensure hard overrides jump to direct mode',
    scope: ['src/orchestrator/control-mode-orchestrator.ts'],
  })

  await handler({
    runId: run.runId,
    summary: 'Need approval for high-risk action',
    riskLevel: 'high',
    toolName: 'edit_file',
    targets: ['src/orchestrator/control-mode-orchestrator.ts'],
  })

  const updatedRun = runtime.store.requireRun(run.runId)
  const updatedTaskCard = runtime.store.requireTaskCard(run.runId)

  assert.equal(updatedRun.controlMode, 'direct')
  assert.equal(updatedTaskCard.overrideState?.level, 'hard')
  assert.equal(updatedTaskCard.overrideState?.confirmed, true)
})

test('approval_request handles non-accept responses without applying override state', async () => {
  const runtime = createFakeGatewayRuntime(async () => ({
    action: 'cancel',
    content: null,
  }))
  const handler = runtime.tools.get('approval_request')
  assert.ok(handler, 'approval_request should be registered')

  const run = runtime.orchestrator.startRun({
    title: 'Cancel risky action',
    goal: 'Verify cancel path',
    scope: ['src/gateway'],
  })

  const response = await handler({
    runId: run.runId,
    summary: 'Stop here',
    riskLevel: 'high',
  })

  const parsed = parseTextResult(response)
  const updatedRun = runtime.store.requireRun(run.runId)
  const updatedTaskCard = runtime.store.requireTaskCard(run.runId)

  assert.equal(runtime.elicitCalls.length, 1)
  assert.deepEqual(parsed, {
    action: 'cancel',
  })
  assert.equal(updatedRun.currentStep, 'approval')
  assert.equal(updatedRun.currentStatus, 'awaiting_approval')
  assert.equal(updatedRun.controlMode, 'normal')
  assert.equal(updatedTaskCard.overrideState, null)
})

test('feedback_gate records done decisions and moves the run into verify', async () => {
  const runtime = createFakeGatewayRuntime(async () => ({
    action: 'accept',
    content: {
      status: 'done',
      msg: 'Ready for verify',
    },
  }))
  const handler = runtime.tools.get('feedback_gate')
  assert.ok(handler, 'feedback_gate should be registered')

  const run = runtime.orchestrator.startRun({
    title: 'Close loop',
    goal: 'Verify feedback done path',
    scope: ['src/gateway'],
  })

  const response = await handler({
    runId: run.runId,
    summary: 'Work is complete',
  })

  const parsed = parseTextResult(response)
  const updatedRun = runtime.store.requireRun(run.runId)

  assert.equal(runtime.elicitCalls.length, 1)
  assert.match(String(runtime.elicitCalls[0]?.message), /Work is complete/)
  assert.deepEqual(parsed, {
    status: 'done',
    msg: 'Ready for verify',
  })
  assert.equal(updatedRun.currentStep, 'verify')
  assert.equal(updatedRun.currentStatus, 'active')
  assert.equal(updatedRun.userConfirmedDone, true)
})

test('feedback_gate returns declined interaction results without mutating run state', async () => {
  const runtime = createFakeGatewayRuntime(async () => ({
    action: 'decline',
    content: null,
  }))
  const handler = runtime.tools.get('feedback_gate')
  assert.ok(handler, 'feedback_gate should be registered')

  const run = runtime.orchestrator.startRun({
    title: 'Declined feedback',
    goal: 'Verify non-accept feedback path',
    scope: ['src/gateway'],
  })

  const response = await handler({
    runId: run.runId,
    summary: 'No response',
  })

  const parsed = parseTextResult(response)
  const updatedRun = runtime.store.requireRun(run.runId)

  assert.equal(runtime.elicitCalls.length, 1)
  assert.deepEqual(parsed, {
    action: 'decline',
  })
  assert.equal(updatedRun.currentStep, 'collect')
  assert.equal(updatedRun.currentStatus, 'active')
  assert.equal(updatedRun.userConfirmedDone, false)
})

test('new_task_request reads conversation projection with the newly created runId', async () => {
  const runtime = createFakeGatewayRuntime(async () => ({
    action: 'accept',
    content: {},
  }))
  const handler = runtime.tools.get('new_task_request')
  assert.ok(handler, 'new_task_request should be registered')

  const calls: Array<string | null | undefined> = []
  const originalGetConversationRecord = runtime.store.getConversationRecord.bind(runtime.store)
  runtime.store.getConversationRecord = ((preferredRunId?: string | null) => {
    calls.push(preferredRunId)
    return originalGetConversationRecord(preferredRunId)
  }) as typeof runtime.store.getConversationRecord

  const response = await handler({
    title: 'Start task with explicit conversation projection',
    goal: 'Avoid implicit latest-run lookup in new_task_request',
    scope: ['src/gateway/tools.ts'],
  })

  const parsed = parseTextResult(response)

  assert.equal(calls.at(-1), parsed.run.runId)
  assert.equal(parsed.conversation.conversationId, parsed.run.conversationId)
})

test('run_start reads conversation projection with the newly created runId', async () => {
  const runtime = createFakeGatewayRuntime(async () => ({
    action: 'accept',
    content: {},
  }))
  const handler = runtime.tools.get('run_start')
  assert.ok(handler, 'run_start should be registered')

  const calls: Array<string | null | undefined> = []
  const originalGetConversationRecord = runtime.store.getConversationRecord.bind(runtime.store)
  runtime.store.getConversationRecord = ((preferredRunId?: string | null) => {
    calls.push(preferredRunId)
    return originalGetConversationRecord(preferredRunId)
  }) as typeof runtime.store.getConversationRecord

  const response = await handler({
    title: 'Run start with explicit conversation projection',
    goal: 'Avoid implicit latest-run lookup in run_start',
    scope: ['src/gateway/tools.ts'],
  })

  const parsed = parseTextResult(response)

  assert.equal(calls.at(-1), parsed.run.runId)
  assert.equal(parsed.conversation.conversationId, parsed.run.conversationId)
})

test('approval_request delegates pending approval state setup to orchestrator with request context', async () => {
  const runtime = createFakeGatewayRuntime(async () => ({
    action: 'cancel',
    content: null,
  }))
  const handler = runtime.tools.get('approval_request')
  assert.ok(handler, 'approval_request should be registered')

  const run = runtime.orchestrator.startRun({
    title: 'Delegate approval setup',
    goal: 'Ensure gateway does not write approval state directly',
    scope: ['src/gateway/tools.ts'],
  })

  const beginApprovalCalls: Array<{
    ctx: { runId?: string; conversationId?: string; taskId?: string }
    input: { runId: string; summary: string; riskLevel: string; toolName?: string; targets?: string[] }
  }> = []
  const originalBeginApproval = runtime.orchestrator.beginApprovalRequest.bind(runtime.orchestrator)
  runtime.orchestrator.beginApprovalRequest = ((ctx, input) => {
    beginApprovalCalls.push({
      ctx: {
        runId: ctx.runId,
        conversationId: ctx.conversationId,
        taskId: ctx.taskId,
      },
      input: {
        runId: input.runId,
        summary: input.summary,
        riskLevel: input.riskLevel,
        toolName: input.toolName,
        targets: input.targets,
      },
    })
    return originalBeginApproval(ctx, input)
  }) as typeof runtime.orchestrator.beginApprovalRequest

  await handler({
    runId: run.runId,
    summary: 'Approval boundary moved into orchestrator',
    riskLevel: 'high',
    toolName: 'edit_file',
    targets: ['src/gateway/tools.ts'],
  })

  assert.equal(beginApprovalCalls.length, 1)
  assert.deepEqual(beginApprovalCalls[0], {
    ctx: {
      runId: run.runId,
      conversationId: run.conversationId,
      taskId: run.taskId,
    },
    input: {
      runId: run.runId,
      summary: 'Approval boundary moved into orchestrator',
      riskLevel: 'high',
      toolName: 'edit_file',
      targets: ['src/gateway/tools.ts'],
    },
  })
})

test('conversation_end returns conversation_done from orchestrator and store projections after explicit end', async () => {
  const runtime = createFakeGatewayRuntime(async () => ({
    action: 'accept',
    content: {},
  }))
  const handler = runtime.tools.get('conversation_end')
  assert.ok(handler, 'conversation_end should be registered')

  const run = runtime.orchestrator.startRun({
    title: 'End conversation',
    goal: 'Ensure conversation_done has one truth source',
    scope: ['src/orchestrator/conversation-orchestrator.ts'],
  })

  runtime.store.transitionRun(run.runId, 'done', 'completed')
  runtime.store.updateRun(run.runId, {
    userConfirmedDone: true,
    verifyPassed: true,
  })

  const response = await handler({
    runId: run.runId,
  })

  const parsed = parseTextResult(response)

  assert.equal(parsed.conversation.state, 'conversation_done')
  assert.equal(runtime.orchestrator.getConversationRecord(run.runId).state, 'conversation_done')
  assert.equal(runtime.store.getConversationRecord().state, 'conversation_done')
})

test('verify_run delegates request context to orchestrator', async () => {
  const runtime = createFakeGatewayRuntime(async () => ({
    action: 'accept',
    content: {},
  }))
  const handler = runtime.tools.get('verify_run')
  assert.ok(handler, 'verify_run should be registered')

  const run = runtime.orchestrator.startRun({
    title: 'Verify with request context',
    goal: 'Ensure verify path receives request-scoped context',
    scope: ['src/orchestrator/verification-orchestrator.ts'],
  })

  runtime.store.addTaskStep(run.runId, {
    name: 'Implement verification',
    status: 'done',
  })
  runtime.store.patchHandoff(run.runId, {
    completedSteps: ['Implement verification'],
    pendingSteps: [],
    nextRecommendedAction: 'Archive summary',
  })
  runtime.store.transitionRun(run.runId, 'verify', 'active')

  const verifyCalls: Array<{
    ctx: { runId?: string; conversationId?: string; taskId?: string; traceId: string }
    input: { runId: string; userConfirmedDone: boolean }
  }> = []
  const originalVerifyRun = runtime.orchestrator.verifyRun.bind(runtime.orchestrator)
  runtime.orchestrator.verifyRun = ((runId, userConfirmedDone, ctx) => {
    assert.ok(ctx, 'verify_run should pass a request context')
    verifyCalls.push({
      ctx: {
        runId: ctx.runId,
        conversationId: ctx.conversationId,
        taskId: ctx.taskId,
        traceId: ctx.traceId,
      },
      input: {
        runId,
        userConfirmedDone,
      },
    })
    return originalVerifyRun(runId, userConfirmedDone, ctx)
  }) as typeof runtime.orchestrator.verifyRun

  await handler({
    runId: run.runId,
    userConfirmedDone: true,
  })

  assert.equal(verifyCalls.length, 1)
  assert.equal(verifyCalls[0]?.input.runId, run.runId)
  assert.equal(verifyCalls[0]?.input.userConfirmedDone, true)
  assert.equal(verifyCalls[0]?.ctx.runId, run.runId)
  assert.equal(verifyCalls[0]?.ctx.conversationId, run.conversationId)
  assert.equal(verifyCalls[0]?.ctx.taskId, run.taskId)
  assert.match(verifyCalls[0]?.ctx.traceId ?? '', /^req_/)
})

test('verification orchestrator writes trace-aware verify events and summary timestamps from request context', () => {
  const runtime = createFakeGatewayRuntime(async () => ({
    action: 'accept',
    content: {},
  }))

  const run = runtime.orchestrator.startRun({
    title: 'Trace-aware verify',
    goal: 'Propagate request context through verification artifacts',
    scope: ['src/orchestrator/verification-orchestrator.ts'],
  })

  runtime.store.addTaskStep(run.runId, {
    name: 'Implement verification',
    status: 'done',
  })
  runtime.store.patchHandoff(run.runId, {
    completedSteps: ['Implement verification'],
    pendingSteps: [],
    nextRecommendedAction: 'Archive summary',
  })
  runtime.store.transitionRun(run.runId, 'verify', 'active')

  const result = runtime.orchestrator.verifyRun(
    run.runId,
    true,
    {
      runId: run.runId,
      conversationId: run.conversationId ?? undefined,
      taskId: run.taskId,
      traceId: 'trace_verify_fixed',
      now: () => '2026-04-14T08:00:00.000Z',
    },
  )

  const updatedRun = runtime.store.requireRun(run.runId)
  const verifyFinishedEvent = runtime.store
    .listRunEvents(run.runId)
    .find((event) => event.type === 'verify.finished')
  const runCompletedEvent = runtime.store
    .listRunEvents(run.runId)
    .find((event) => event.type === 'run.completed')
  const summaryDocument = runtime.store.readTaskSummary(run.taskId)

  assert.equal(result.verdict, 'pass')
  assert.equal(updatedRun.currentStatus, 'completed')
  assert.equal(verifyFinishedEvent?.detail.traceId, 'trace_verify_fixed')
  assert.equal(verifyFinishedEvent?.detail.recordedAt, '2026-04-14T08:00:00.000Z')
  assert.equal(runCompletedEvent?.detail.traceId, 'trace_verify_fixed')
  assert.equal(runCompletedEvent?.detail.recordedAt, '2026-04-14T08:00:00.000Z')
  assert.equal(summaryDocument?.frontmatter.createdAt, '2026-04-14T08:00:00.000Z')
  assert.equal(summaryDocument?.frontmatter.updatedAt, '2026-04-14T08:00:00.000Z')
})

test('conversation projections honor preferredRunId instead of always reading the latest run', () => {
  const runtime = createFakeGatewayRuntime(async () => ({
    action: 'accept',
    content: {},
  }))
  const conversationService = new ConversationService(runtime.store)

  const firstRun = runtime.orchestrator.startRun({
    title: 'Conversation A',
    goal: 'Keep first conversation addressable',
    scope: ['src/store/conversation-store.ts'],
    conversationId: 'conversation_a',
  })
  runtime.store.transitionRun(firstRun.runId, 'done', 'completed')
  runtime.store.updateRun(firstRun.runId, {
    userConfirmedDone: true,
    verifyPassed: true,
  })
  runtime.orchestrator.endConversation(firstRun.runId)

  const secondRun = runtime.orchestrator.startRun({
    title: 'Conversation B',
    goal: 'Become latest run without changing preferred lookup',
    scope: ['src/control-plane/conversation-service.ts'],
    conversationId: 'conversation_b',
  })
  runtime.store.transitionRun(secondRun.runId, 'execute', 'active')

  const storeConversation = runtime.store.getConversationRecord(firstRun.runId)
  const serviceConversation = conversationService.getConversationRecord(firstRun.runId)

  assert.equal(storeConversation.conversationId, 'conversation_a')
  assert.equal(storeConversation.state, 'conversation_done')
  assert.equal(runtime.store.conversationStore.isTaskActive(firstRun.runId), false)
  assert.equal(runtime.store.conversationStore.isTaskActive(secondRun.runId), true)
  assert.equal(serviceConversation.conversationId, 'conversation_a')
  assert.equal(serviceConversation.state, 'conversation_done')
})

test('ui_task_start and ui_runtime_snapshot_get flow through gateway tools backed by the runtime store', async () => {
  const runtime = createFakeGatewayRuntime(async () => ({
    action: 'accept',
    content: {
      status: 'continue',
      msg: '',
    },
  }))
  const startHandler = runtime.tools.get('ui_task_start')
  const snapshotHandler = runtime.tools.get('ui_runtime_snapshot_get')

  assert.ok(startHandler, 'ui_task_start should be registered')
  assert.ok(snapshotHandler, 'ui_runtime_snapshot_get should be registered')

  const startResponse = await startHandler({
    title: 'Gateway UI task start',
    goal: 'Start through MCP UI tool',
    controlMode: 'normal',
  })
  const started = parseTextResult(startResponse)

  assert.equal(started.activeTask?.title, 'Gateway UI task start')
  assert.equal(runtime.store.listRuns().length, 1)

  const snapshotResponse = await snapshotHandler({})
  const snapshot = parseTextResult(snapshotResponse)

  assert.equal(snapshot.activeTask?.title, 'Gateway UI task start')
  assert.equal(snapshot.conversation.state, 'active_task')
})
