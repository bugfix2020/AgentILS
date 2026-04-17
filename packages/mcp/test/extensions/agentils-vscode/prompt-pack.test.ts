import assert from 'node:assert/strict'
import test from 'node:test'
import { join } from 'node:path'

const extensionRootPath = join(process.cwd(), 'extensions', 'agentils-vscode')

test('AgentILS prompt pack includes the startnewtask compatibility prompt', async () => {
  const { loadAgentILSPromptPack } = await import('../../../../extensions/agentils-vscode/src/prompt-pack/template-loader.ts')
  const templates = loadAgentILSPromptPack(extensionRootPath)
  const startNewTaskPrompt = templates.find((template) => template.name === 'startnewtask.prompt.md')

  assert.ok(startNewTaskPrompt, 'expected startnewtask.prompt.md to be installed with the prompt pack')
  assert.match(startNewTaskPrompt.content, /^name:\s*startnewtask$/m)
  assert.match(startNewTaskPrompt.content, /agentils_start_conversation/)
})

test('AgentILS prompt pack includes the run-code entry prompt bound to the orchestrator agent', async () => {
  const { loadAgentILSPromptPack } = await import('../../../../extensions/agentils-vscode/src/prompt-pack/template-loader.ts')
  const templates = loadAgentILSPromptPack(extensionRootPath)
  const runCodePrompt = templates.find((template) => template.name === 'agentils.run-code.prompt.md')

  assert.ok(runCodePrompt, 'expected agentils.run-code.prompt.md to be installed with the prompt pack')
  assert.match(runCodePrompt.content, /^name:\s*agentils\.run-code$/m)
  assert.match(runCodePrompt.content, /^agent:\s*agentils\.orchestrator$/m)
})

test('AgentILS prompt pack keeps only the orchestrator agent for the VS Code phase-one flow', async () => {
  const { loadAgentILSPromptPack } = await import('../../../../extensions/agentils-vscode/src/prompt-pack/template-loader.ts')
  const templates = loadAgentILSPromptPack(extensionRootPath)
  const templateNames = templates.map((template) => template.name)
  const feedbackPrompt = templates.find((template) => template.name === 'agentils.feedback.prompt.md')

  assert.deepEqual(
    templateNames.filter((name) => name.endsWith('.agent.md')),
    ['agentils.orchestrator.agent.md'],
  )
  assert.ok(feedbackPrompt, 'expected agentils.feedback.prompt.md to be installed with the prompt pack')
  assert.match(feedbackPrompt.content, /^agent:\s*agentils\.orchestrator$/m)
})
