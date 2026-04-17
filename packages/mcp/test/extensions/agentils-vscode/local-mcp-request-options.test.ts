import assert from 'node:assert/strict'
import test from 'node:test'

test('blocking local MCP tools opt into the long interaction timeout', async () => {
  const { AGENTILS_INTERACTION_TIMEOUT_MSEC, getLocalToolRequestOptions } = await import(
    '../../../../extensions/agentils-vscode/src/runtime-client/request-options.ts'
  )

  assert.deepEqual(getLocalToolRequestOptions('ui_task_start_gate'), {
    timeout: AGENTILS_INTERACTION_TIMEOUT_MSEC,
  })
  assert.deepEqual(getLocalToolRequestOptions('approval_request'), {
    timeout: AGENTILS_INTERACTION_TIMEOUT_MSEC,
  })
  assert.deepEqual(getLocalToolRequestOptions('feedback_gate'), {
    timeout: AGENTILS_INTERACTION_TIMEOUT_MSEC,
  })
})

test('non-blocking local MCP tools keep the SDK default timeout', async () => {
  const { getLocalToolRequestOptions } = await import(
    '../../../../extensions/agentils-vscode/src/runtime-client/request-options.ts'
  )

  assert.equal(getLocalToolRequestOptions('ui_runtime_snapshot_get'), undefined)
  assert.equal(getLocalToolRequestOptions('ui_task_continue'), undefined)
})
