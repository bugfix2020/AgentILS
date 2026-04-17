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
