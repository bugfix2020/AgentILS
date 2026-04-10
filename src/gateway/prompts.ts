import { z } from 'zod'
import type { AgentGateServerRuntime } from './context.js'

export function registerGatewayPrompts(runtime: AgentGateServerRuntime): void {
  const { server } = runtime

  server.registerPrompt(
    'agentgate_start_run',
    {
      description: 'Start a disciplined AgentILS run from the current context.',
      argsSchema: {
        goal: z.string().describe('The user goal for this run'),
      },
    },
    async ({ goal }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Start a new AgentILS task for the following goal: ${goal}. First classify the mode, then collect only the minimum blocking details, then persist task state.`,
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'agentgate_new_task_request',
    {
      description: 'Request a new task and surface the current conversation state before acting.',
      argsSchema: {
        goal: z.string().describe('The goal for the new task'),
        title: z.string().optional().describe('Optional task title'),
      },
    },
    async ({ goal, title }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Request a new AgentILS task${title ? ` titled "${title}"` : ''} for the following goal: ${goal}. Use new_task_request, then inspect conversation_get, control_mode_get, and task_summary_get before proceeding.`,
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'agentgate_conversation_snapshot',
    {
      description: 'Inspect the current conversation and task snapshot before changing state.',
      argsSchema: {
        runId: z.string().optional().describe('Optional run to inspect'),
      },
    },
    async ({ runId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Inspect the current AgentILS conversation${runId ? ` for run ${runId}` : ''}. Read conversation_get first, then summarize the active task, current mode, and any blocking summary facts before making a change.`,
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'agentgate_control_mode',
    {
      description: 'Inspect the current control mode and override state for a run.',
      argsSchema: {
        runId: z.string().optional().describe('Optional run to inspect'),
      },
    },
    async ({ runId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Read the current control mode${runId ? ` for run ${runId}` : ''} with control_mode_get. Report whether the task is in normal, alternate, or direct mode, and whether an override is active.`,
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'agentgate_task_summary',
    {
      description: 'Inspect the latest task summary before resuming or starting a related task.',
      argsSchema: {
        runId: z.string().optional().describe('Optional run to inspect'),
      },
    },
    async ({ runId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Read the latest task summary${runId ? ` for run ${runId}` : ''} with task_summary_get. Use the summary document as the authoritative inherited state, and do not reuse the full transcript unless it is explicitly required.`,
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'agentgate_resume_run',
    {
      description: 'Resume a run from its handoff packet.',
      argsSchema: {
        runId: z.string().describe('The run to resume'),
      },
    },
    async ({ runId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Resume run ${runId}. Read the handoff packet and taskCard first, then continue from the recorded currentStep without re-discovering the whole task.`,
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'agentgate_verify_run',
    {
      description: 'Verify result and handoff before allowing completion.',
      argsSchema: {
        runId: z.string().describe('The run to verify'),
      },
    },
    async ({ runId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Verify run ${runId}. Confirm result quality and handoff completeness. Do not treat natural-language confidence as done; use explicit verification output.`,
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'agentgate_prepare_handoff',
    {
      description: 'Prepare a structured handoff packet for another agent or a later session.',
      argsSchema: {
        runId: z.string().describe('The run to hand off'),
      },
    },
    async ({ runId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Prepare a handoff packet for run ${runId}. Include completed steps, pending steps, touched files, constraints, risks, verification status, and the single best next action.`,
          },
        },
      ],
    }),
  )
}
