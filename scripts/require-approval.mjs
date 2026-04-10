import {
  allow,
  block,
  getRunIdFromPayload,
  getTargetsFromPayload,
  getToolNameFromPayload,
  loadState,
  logHookEvent,
  parseJson,
  readStdin,
  resolveRun,
} from './hook-common.mjs'

const payload = parseJson(await readStdin(), {})
const state = loadState()
const toolName = getToolNameFromPayload(payload)
const targets = getTargetsFromPayload(payload)
const run = resolveRun(state, getRunIdFromPayload(payload))

const riskyToolPattern = /(delete|remove|drop|deploy|publish|write|edit|patch|migrate|exec|terminal)/i
const protectedTargets = ['.github/hooks', 'services/control-plane']

if (!toolName) {
  logHookEvent('approval.allow', payload, { reason: 'missing_tool_name' })
  allow()
}

if (!riskyToolPattern.test(toolName)) {
  logHookEvent('approval.allow', payload, { toolName, reason: 'non_risky_tool' })
  allow({ toolName })
}

if (!run) {
  block('High-risk action requires an active AgentILS run and explicit approval_request.', { toolName, targets })
}

const approval = run.activeApproval
const touchesProtectedTarget = targets.some((target) =>
  protectedTargets.some((protectedTarget) => target.includes(protectedTarget)),
)

if (!approval || !approval.approved || approval.action !== 'accept') {
  block('High-risk action is blocked until approval_request is accepted.', {
    runId: run.runId,
    toolName,
    details: { targets },
  })
}

if (approval.toolName && approval.toolName !== toolName) {
  block('The active approval is bound to a different tool. Request approval again for this action.', {
    runId: run.runId,
    toolName,
    details: { approvedToolName: approval.toolName, targets },
  })
}

if (approval.targets?.length > 0 && touchesProtectedTarget) {
  const missingTargetApproval = targets.some(
    (target) =>
      protectedTargets.some((protectedTarget) => target.includes(protectedTarget)) &&
      !approval.targets.some((approvedTarget) => target.includes(approvedTarget)),
  )

  if (missingTargetApproval) {
    block('Protected paths require explicit approval_request targets before execution.', {
      runId: run.runId,
      toolName,
      details: { approvedTargets: approval.targets, targets },
    })
  }
}

logHookEvent('approval.allow', payload, { runId: run.runId, toolName, targets })
allow({ runId: run.runId, toolName })
