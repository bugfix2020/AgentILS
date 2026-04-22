import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import * as vscode from 'vscode'
import { extensionLogger } from './logger'
import { buildJsonToolResult } from './tool-result-builder'
import { AgentILSLoopWebviewHost } from './webview-host'
import { AgentILSRuntimeClient } from './runtime-client'
import type { RunTaskLoopInput, RunTaskLoopResult, StateSnapshot, TaskInteractionResult } from './types'

function ensureWorkspaceRoot() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    if (!workspaceFolder) {
        throw new Error('AgentILS requires an open workspace folder.')
    }
    return workspaceFolder.uri.fsPath
}

function installPromptPack(context: vscode.ExtensionContext, workspaceRoot: string) {
    const templatesRoot = join(context.extensionPath, '..', '..', 'packages', 'cli', 'templates', 'vscode')
    const files = [
        {
            source: join(templatesRoot, 'agents', 'agentils.loop.agent.md'),
            target: join(workspaceRoot, '.github', 'agents', 'agentils.loop.agent.md'),
        },
        {
            source: join(templatesRoot, 'prompts', 'runTask.prompt.md'),
            target: join(workspaceRoot, '.github', 'prompts', 'runTask.prompt.md'),
        },
    ]
    const legacyTargets = [
        join(workspaceRoot, '.github', 'agents', 'agentils.orchestrator.agent.md'),
        join(workspaceRoot, '.github', 'prompts', 'agentils.run-task.prompt.md'),
        join(workspaceRoot, '.github', 'prompts', 'agentils.run-code.prompt.md'),
        join(workspaceRoot, '.github', 'prompts', 'agentils.approval.prompt.md'),
        join(workspaceRoot, '.github', 'prompts', 'agentils.feedback.prompt.md'),
        join(workspaceRoot, '.github', 'prompts', 'startnewtask.prompt.md'),
    ]
    const changes: Array<{ kind: 'write' | 'skip'; path: string }> = []

    for (const target of legacyTargets) {
        if (existsSync(target)) {
            rmSync(target, { force: true })
            changes.push({ kind: 'write', path: target })
        }
    }

    for (const file of files) {
        const content = readFileSync(file.source, 'utf8')
        const current = existsSync(file.target) ? readFileSync(file.target, 'utf8') : null
        if (current === content) {
            changes.push({ kind: 'skip', path: file.target })
            continue
        }
        mkdirSync(dirname(file.target), { recursive: true })
        writeFileSync(file.target, content, 'utf8')
        changes.push({ kind: 'write', path: file.target })
    }

    const mcpJsonPath = join(workspaceRoot, '.vscode', 'mcp.json')
    const serverModulePath = join(context.extensionPath, '..', '..', 'packages', 'mcp', 'dist', 'index.js')
    const mcpJsonContent = `${JSON.stringify(
        {
            servers: {
                agentils: {
                    type: 'stdio',
                    command: 'node',
                    args: [serverModulePath],
                },
            },
        },
        null,
        2,
    )}\n`
    const currentMcpJson = existsSync(mcpJsonPath) ? readFileSync(mcpJsonPath, 'utf8') : null
    if (currentMcpJson !== mcpJsonContent) {
        mkdirSync(dirname(mcpJsonPath), { recursive: true })
        writeFileSync(mcpJsonPath, mcpJsonContent, 'utf8')
        changes.push({ kind: 'write', path: mcpJsonPath })
    } else {
        changes.push({ kind: 'skip', path: mcpJsonPath })
    }

    return changes
}

async function driveLoop(
    client: AgentILSRuntimeClient,
    panel: AgentILSLoopWebviewHost,
    input: RunTaskLoopInput,
): Promise<RunTaskLoopResult> {
    extensionLogger.log('extension', 'driveLoop:start', input)
    let result = await client.runTaskLoop(input)

    while (true) {
        extensionLogger.log('extension', 'driveLoop:iteration', {
            phase: result.task.phase,
            terminal: result.task.terminal,
            hasInteraction: Boolean(result.interaction),
            shouldRecallTool: result.next.shouldRecallTool,
            canRenderWebview: result.next.canRenderWebview,
        })

        if (result.next.shouldRecallTool) {
            result = await client.runTaskLoop({
                taskId: result.task.taskId,
            })
            extensionLogger.log('extension', 'driveLoop:recalled', { taskId: result.task.taskId })
            continue
        }

        if (result.interaction && result.next.canRenderWebview) {
            const response = await panel.collect(result)
            extensionLogger.log('extension', 'driveLoop:panel-response', response)
            const taskId = result.task.taskId
            if (response.closed) {
                result = await client.runTaskLoop({
                    taskId,
                    interactionResult: {
                        interactionKey: result.interaction.interactionKey,
                        closed: true,
                    },
                })
                extensionLogger.log('extension', 'driveLoop:closed-retry', { taskId })
                continue
            }

            if (response.message?.trim().startsWith('/')) {
                result = await client.runTaskLoop({
                    taskId,
                    userIntent: response.message.trim(),
                })
                extensionLogger.log('extension', 'driveLoop:user-intent', {
                    taskId,
                    userIntent: response.message.trim(),
                })
                continue
            }

            const interactionResult: TaskInteractionResult = {
                interactionKey: result.interaction.interactionKey,
                ...(response.actionId ? { actionId: response.actionId as TaskInteractionResult['actionId'] } : {}),
                ...(response.message?.trim() ? { message: response.message.trim() } : {}),
            }

            result = await client.runTaskLoop({
                taskId,
                interactionResult,
            })
            extensionLogger.log('extension', 'driveLoop:interaction-result', {
                taskId,
                interactionResult,
            })
            continue
        }

        extensionLogger.log('extension', 'driveLoop:finish', {
            phase: result.task.phase,
            terminal: result.task.terminal,
        })
        return result
    }
}

export async function activate(context: vscode.ExtensionContext) {
    extensionLogger.log('extension', 'activate:start', {
        extensionPath: context.extensionPath,
    })
    const workspaceRoot = ensureWorkspaceRoot()
    const runtimeClient = new AgentILSRuntimeClient(context, workspaceRoot)
    const loopPanel = new AgentILSLoopWebviewHost(context)

    context.subscriptions.push(runtimeClient, loopPanel)

    context.subscriptions.push(
        vscode.commands.registerCommand('agentils.installPromptPack', async () => {
            const changes = installPromptPack(context, workspaceRoot)
            extensionLogger.log('extension', 'installPromptPack', { changes })
            const summary = changes
                .slice(-4)
                .map((change: { kind: string; path: string }) => `${change.kind}: ${change.path}`)
                .join('\n')
            await vscode.window.showInformationMessage(summary || 'AgentILS prompt pack installed.')
        }),
    )

    context.subscriptions.push(
        vscode.commands.registerCommand('agentils.openPanel', async () => {
            extensionLogger.log('extension', 'openPanel')
            const snapshot = await runtimeClient.stateGet()
            loopPanel.showSnapshot(snapshot)
        }),
    )

    context.subscriptions.push(
        vscode.lm.registerTool<RunTaskLoopInput>('agentils_run_task_loop', {
            prepareInvocation() {
                return {
                    invocationMessage: 'Running AgentILS V1 task loop',
                }
            },
            async invoke(options) {
                extensionLogger.log('extension', 'tool:run_task_loop', options.input ?? {})
                const result = await driveLoop(runtimeClient, loopPanel, options.input ?? {})
                return buildJsonToolResult(result)
            },
        }),
        vscode.lm.registerTool<{ taskId?: string }>('agentils_state_get', {
            prepareInvocation() {
                return {
                    invocationMessage: 'Reading AgentILS V1 state',
                }
            },
            async invoke(options) {
                extensionLogger.log('extension', 'tool:state_get', options.input ?? {})
                const snapshot: StateSnapshot = await runtimeClient.stateGet(options.input?.taskId)
                return buildJsonToolResult(snapshot)
            },
        }),
    )
    extensionLogger.log('extension', 'activate:done', { workspaceRoot })
}

export function deactivate() {}
