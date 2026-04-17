import assert from 'node:assert/strict'
import test from 'node:test'
import { parseArgs, removeManagedBlock, replaceManagedBlock, workflowFileNameFromPrompt } from '../src/index.ts'

test('parseArgs expands all targets and resolves workspace', () => {
  const parsed = parseArgs(['inject', 'all', '--workspace', '/tmp/agentils'])

  assert.equal(parsed.command, 'inject')
  assert.deepEqual(parsed.targets, ['vscode', 'cursor', 'codex', 'antigravity'])
  assert.equal(parsed.workspaceRoot, '/tmp/agentils')
})

test('parseArgs accepts uninstall commands', () => {
  const parsed = parseArgs(['uninstall', 'vscode', '--workspace', '/tmp/agentils'])

  assert.equal(parsed.command, 'uninstall')
  assert.deepEqual(parsed.targets, ['vscode'])
  assert.equal(parsed.workspaceRoot, '/tmp/agentils')
})

test('replaceManagedBlock appends a managed block when missing', () => {
  const next = replaceManagedBlock('existing = true\n', '# BEGIN AgentILS managed block\nfoo = "bar"\n# END AgentILS managed block\n')

  assert.match(next, /existing = true/)
  assert.match(next, /foo = "bar"/)
})

test('removeManagedBlock removes the managed block and preserves surrounding content', () => {
  const current = [
    'existing = true',
    '',
    '# BEGIN AgentILS managed block',
    'foo = "bar"',
    '# END AgentILS managed block',
    '',
    'after = true',
    '',
  ].join('\n')

  const next = removeManagedBlock(current)

  assert.equal(next, 'existing = true\n\nafter = true\n')
})

test('workflowFileNameFromPrompt strips the prompt suffix', () => {
  assert.equal(workflowFileNameFromPrompt('start-run.prompt.md'), 'start-run.md')
  assert.equal(workflowFileNameFromPrompt('custom.md'), 'custom.md')
})
