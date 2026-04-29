import assert from 'node:assert/strict'
import test from 'node:test'
import { installVsCodeAssets, loadVsCodePromptPack, parseArgs, uninstallVsCodeAssets } from '../src/index.ts'

test('parseArgs accepts install vscode', () => {
  const parsed = parseArgs(['install', 'vscode', '--workspace', '/tmp/agentils', '--scope', 'both'])
  assert.equal(parsed.command, 'install')
  assert.equal(parsed.target, 'vscode')
  assert.equal(parsed.workspaceRoot, '/tmp/agentils')
  assert.equal(parsed.scope, 'both')
})

test('loadVsCodePromptPack returns V1 prompt + agent + stage envelope contract', () => {
  const pack = loadVsCodePromptPack()
  assert.deepEqual(
    pack.map((entry) => entry.relativePath),
    [
      '.github/agents/agentils.loop.agent.md',
      '.github/prompts/runtask.prompt.md',
      '.github/prompts/runTask.prompt.md',
      '.github/instructions/agentils-stage-envelope-contract.instructions.md',
    ],
  )
})

test('install/uninstall vscode assets report the new file set', () => {
  const installed = installVsCodeAssets({
    workspaceRoot: '/tmp/agentils',
    dryRun: true,
  })
  const removed = uninstallVsCodeAssets({
    workspaceRoot: '/tmp/agentils',
    dryRun: true,
  })

  assert.ok(installed.some((change) => change.path.endsWith('.github/agents/agentils.loop.agent.md')))
  assert.ok(installed.some((change) => change.path.endsWith('.github/prompts/runtask.prompt.md')))
  assert.ok(installed.some((change) => change.path.endsWith('.github/prompts/runTask.prompt.md')))
  assert.ok(
    installed.some((change) =>
      change.path.endsWith('.github/instructions/agentils-stage-envelope-contract.instructions.md'),
    ),
  )
  assert.ok(installed.some((change) => change.path.endsWith('.vscode/mcp.json')))
  assert.ok(removed.some((change) => change.path.endsWith('.github/agents/agentils.loop.agent.md')))
  assert.ok(removed.some((change) => change.path.endsWith('.github/prompts/runtask.prompt.md')))
  assert.ok(removed.some((change) => change.path.endsWith('.github/prompts/runTask.prompt.md')))
  assert.ok(
    removed.some((change) =>
      change.path.endsWith('.github/instructions/agentils-stage-envelope-contract.instructions.md'),
    ),
  )
})

test('mcp.json template configures HTTP transport (Plan C: single source of truth)', async () => {
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const workspace = mkdtempSync(join(tmpdir(), 'agentils-cli-mcpjson-'))
  try {
    installVsCodeAssets({ workspaceRoot: workspace, dryRun: false })
    const mcpJson = JSON.parse(readFileSync(join(workspace, '.vscode', 'mcp.json'), 'utf8'))
    assert.equal(mcpJson.servers.agentils.type, 'http')
    assert.match(mcpJson.servers.agentils.url, /^http:\/\/[\d.]+:\d+\/mcp$/)
    assert.equal(mcpJson.servers.agentils.command, undefined)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
})

test('agent and prompt templates reference MCP tool names (no extension lm tools)', () => {
  const pack = loadVsCodePromptPack()
  for (const file of pack) {
    if (!file.relativePath.endsWith('.md')) continue
    assert.doesNotMatch(file.content, /bugfix2020\.agentils-vscode/, `${file.relativePath} still references VS Code lm tools`)
    assert.match(file.content, /agentils\/(state_get|run_task_loop|\*)/, `${file.relativePath} should reference MCP tool ids in <server>/<tool> form`)
  }
})
