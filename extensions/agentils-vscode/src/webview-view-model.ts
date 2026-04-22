import type { RunTaskLoopResult, StateSnapshot } from './types'
import type { WebviewViewModel } from './webview-protocol'

const DEFAULT_PLACEHOLDER = '继续输入补充说明，或使用 /newtask /exitConversation'
const DEFAULT_COMMANDS = ['/newtask', '/exitConversation']

export function buildWebviewViewModelFromSnapshot(snapshot: StateSnapshot): WebviewViewModel {
    const task = snapshot.task

    return {
        task: {
            taskId: task?.taskId ?? null,
            title: task?.title ?? task?.goal ?? 'No active task',
            phase: task?.phase ?? 'idle',
            controlMode: task?.controlMode ?? 'normal',
            terminal: task?.terminal ?? 'active',
        },
        tasks: snapshot.tasks.map((entry) => ({
            taskId: entry.taskId,
            title: entry.title,
            phase: entry.phase,
            controlMode: entry.controlMode,
            terminal: entry.terminal,
            archived: entry.taskId !== snapshot.session.activeTaskId,
        })),
        content: {
            summary:
                stringifyForUi(task?.summary) ||
                stringifyForUi(task?.planSummary) ||
                stringifyForUi(task?.goal) ||
                'Use /runTask to start or resume a loop.',
            planSummary: optionalString(task?.planSummary),
            risks: Array.isArray(task?.risks) ? task.risks.map((risk) => stringifyForUi(risk)) : [],
            executionResult: optionalString(task?.executionResult),
            testResult: optionalString(task?.testResult),
            finalSummary: optionalString(task?.summary),
        },
        interaction: {
            exists: false,
            actions: [],
        },
        session: {
            sessionId: snapshot.session.sessionId,
            status: snapshot.session.status,
        },
        timeline: snapshot.timeline.map((entry) => ({
            id: entry.id,
            role: entry.role,
            kind: entry.kind,
            content: stringifyForUi(entry.content),
            timestamp: entry.timestamp,
        })),
        composer: {
            placeholder: DEFAULT_PLACEHOLDER,
            suggestedCommands: DEFAULT_COMMANDS,
        },
    }
}

export function buildWebviewViewModelFromResult(result: RunTaskLoopResult): WebviewViewModel {
    const snapshotModel = buildWebviewViewModelFromSnapshot(result.snapshot)
    const interaction = result.interaction

    return {
        ...snapshotModel,
        task: {
            ...snapshotModel.task,
            taskId: result.task.taskId,
            phase: result.task.phase,
            controlMode: result.task.controlMode,
            terminal: result.task.terminal,
        },
        content: {
            ...snapshotModel.content,
            summary: stringifyForUi(result.output.summary),
            userVisibleMessage: optionalString(result.output.userVisibleMessage),
        },
        interaction: interaction
            ? {
                  exists: true,
                  kind: interaction.kind,
                  interactionKey: interaction.interactionKey,
                  requestId: interaction.requestId,
                  reopenCount: interaction.reopenCount,
                  title: interaction.title,
                  description: interaction.description,
                  actions: interaction.actions,
                  inputHint: interaction.inputHint,
              }
            : {
                  exists: false,
                  actions: [],
              },
        composer: {
            placeholder: interaction?.inputHint ?? DEFAULT_PLACEHOLDER,
            suggestedCommands: DEFAULT_COMMANDS,
        },
    }
}

function optionalString(value: unknown) {
    const normalized = stringifyForUi(value)
    return normalized ? normalized : null
}

function stringifyForUi(value: unknown): string {
    if (typeof value === 'string') {
        return value
    }

    if (value == null) {
        return ''
    }

    if (Array.isArray(value)) {
        return value
            .map((item) => stringifyForUi(item))
            .filter(Boolean)
            .join('\n')
    }

    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}
