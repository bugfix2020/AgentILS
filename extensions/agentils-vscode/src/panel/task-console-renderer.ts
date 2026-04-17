import type { AgentILSPanelState, AgentILSControlMode, AgentILSPendingInteraction } from '../model'
import type { TaskConsoleComposerMode } from './task-console-protocol'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderControlModeBadge(mode: AgentILSControlMode): string {
  if (mode === 'alternate') {
    return `<span class="badge badge-mode-alternate" title="Alternate Law — 备用法则">⚠ ${escapeHtml(mode)} — 已接受 override 风险</span>`
  }
  if (mode === 'direct') {
    return `<span class="badge badge-mode-direct" title="Direct Law — 直接法则">⛔ ${escapeHtml(mode)} — 控制平面不再介入</span>`
  }
  // normal
  return `<span class="badge badge-mode-normal" title="Normal Law — 正常法则">✓ ${escapeHtml(mode)}</span>`
}

function renderRiskBadge(riskLevel: string): string {
  const level = riskLevel as 'low' | 'medium' | 'high'
  return `<span class="badge badge-risk-${escapeHtml(level)}">Risk: ${escapeHtml(level)}</span>`
}

function renderList(title: string, values: string[]) {
  if (values.length === 0) {
    return `<section class="card"><h3>${escapeHtml(title)}</h3><p class="muted">None</p></section>`
  }

  return `
    <section class="card">
      <h3>${escapeHtml(title)}</h3>
      <ul>
        ${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}
      </ul>
    </section>
  `
}

function renderPendingInteraction(interaction: AgentILSPendingInteraction | null) {
  if (!interaction) {
    return ''
  }

  if (interaction.kind === 'startTask') {
    const selectedControlMode = interaction.draftControlMode ?? 'normal'
    return `
      <section class="card pending-card pending-${interaction.kind}">
        <p class="eyebrow">Pending task start</p>
        <h3>${escapeHtml(interaction.title)}</h3>
        <p class="muted">${escapeHtml(interaction.description)}</p>
        <form class="composer-form" data-form="pending" data-kind="startTask" data-request-id="${escapeHtml(interaction.requestId)}">
          <label>
            <span>Task title</span>
            <input name="title" type="text" value="${escapeHtml(interaction.draftTitle ?? '')}" placeholder="What are you trying to do?" required />
          </label>
          <label>
            <span>Task goal</span>
            <textarea name="goal" rows="6" placeholder="Describe the desired outcome, constraints, or acceptance criteria." required>${escapeHtml(interaction.draftGoal ?? '')}</textarea>
          </label>
          <label>
            <span>Control mode</span>
            <select name="controlMode">
              <option value="normal" ${selectedControlMode === 'normal' ? 'selected' : ''}>normal</option>
              <option value="alternate" ${selectedControlMode === 'alternate' ? 'selected' : ''}>alternate</option>
              <option value="direct" ${selectedControlMode === 'direct' ? 'selected' : ''}>direct</option>
            </select>
          </label>
          <div class="composer-actions">
            <button type="submit">Start task</button>
            <button type="button" data-cancel-request-id="${escapeHtml(interaction.requestId)}">Cancel</button>
          </div>
        </form>
      </section>
    `
  }

  if (interaction.kind === 'clarification') {
    return `
      <section class="card pending-card pending-${interaction.kind}">
        <p class="eyebrow">Pending ${escapeHtml(interaction.kind)}</p>
        <h3>${escapeHtml(interaction.title)}</h3>
        <p class="muted">${escapeHtml(interaction.description)}</p>
        <form class="composer-form" data-form="pending" data-kind="clarification" data-request-id="${escapeHtml(interaction.requestId)}">
          <label>
            <span>Response</span>
            <textarea name="content" rows="6" placeholder="${escapeHtml(interaction.placeholder ?? 'Provide the missing detail')}" ${interaction.required ? 'required' : ''}></textarea>
          </label>
          <div class="composer-actions">
            <button type="submit">Submit clarification</button>
            <button type="button" data-cancel-request-id="${escapeHtml(interaction.requestId)}">Cancel</button>
          </div>
        </form>
      </section>
    `
  }

  if (interaction.kind === 'feedback') {
    const options = interaction.options ?? [
      { label: 'Continue', value: 'continue' },
      { label: 'Done', value: 'done' },
      { label: 'Revise', value: 'revise' },
    ]
    return `
      <section class="card pending-card pending-${interaction.kind}">
        <p class="eyebrow">Pending ${escapeHtml(interaction.kind)}</p>
        <h3>${escapeHtml(interaction.title)}</h3>
        <p class="muted">${escapeHtml(interaction.description)}</p>
        <form class="composer-form" data-form="pending" data-kind="feedback" data-request-id="${escapeHtml(interaction.requestId)}">
          <label>
            <span>Status</span>
            <select name="status">
              ${options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>Message</span>
            <textarea name="message" rows="4" placeholder="${escapeHtml(interaction.placeholder ?? 'Add optional feedback notes')}"></textarea>
          </label>
          <div class="composer-actions">
            <button type="submit">Submit feedback</button>
            <button type="button" data-cancel-request-id="${escapeHtml(interaction.requestId)}">Cancel</button>
          </div>
        </form>
      </section>
    `
  }

  const approvalOptions = interaction.options ?? [
    { label: 'Accept', value: 'accept' },
    { label: 'Decline', value: 'decline' },
    { label: 'Cancel', value: 'cancel' },
  ]

  const isAlternate = interaction.controlMode === 'alternate'
  const risks = interaction.risks ?? []

  return `
    <div class="modal-overlay" data-request-id="${escapeHtml(interaction.requestId)}">
      <div class="modal-card ${isAlternate ? 'modal-alternate' : ''}">
        <h2>执行审批</h2>
        <p class="modal-summary">${escapeHtml(interaction.description)}</p>
        <div class="badges" style="margin-bottom:12px">
          ${renderRiskBadge(interaction.riskLevel ?? 'unknown')}
        </div>
        ${(interaction.targets ?? []).length > 0 ? `
        <section class="modal-detail">
          <h3>影响范围</h3>
          <ul style="margin:0 0 12px;padding-left:18px">
            ${(interaction.targets ?? []).map((t) => `<li>${escapeHtml(t)}</li>`).join('')}
          </ul>
        </section>` : ''}
        ${isAlternate && risks.length > 0 ? `
        <section class="modal-risks">
          <h3>⚠️ 当前处于备用法则（alternate），以下风险未完全验证：</h3>
          <ul style="margin:0 0 8px;padding-left:18px">
            ${risks.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}
          </ul>
          <p class="modal-hint">建议：执行后务必进行人工验证</p>
        </section>` : ''}
        <div class="modal-actions">
          <button class="${isAlternate ? 'btn-warning' : 'btn-primary'}" data-action="submitApprovalConfirm" data-request-id="${escapeHtml(interaction.requestId)}">${isAlternate ? '我已知晓风险，确认执行' : '确认执行'}</button>
          <button class="btn-secondary" data-action="submitApprovalDecline" data-request-id="${escapeHtml(interaction.requestId)}">返回修改</button>
        </div>
      </div>
    </div>
  `
}

function renderComposer(state: AgentILSPanelState, composerMode: TaskConsoleComposerMode) {
  const task = state.snapshot.activeTask
  const activeLabelMap: Record<TaskConsoleComposerMode, string> = {
    newTask: 'New task',
    continueTask: 'Continue task',
    markTaskDone: 'Mark task done',
    acceptOverride: 'Accept override',
  }

  const isTaskComposerDisabled = !task

  const taskSwitchButtons = `
    <div class="composer-switches">
      <button data-action="newTask" class="${composerMode === 'newTask' ? 'is-active' : ''}">New task</button>
      <button data-action="continueTask" ${task ? '' : 'disabled'} class="${composerMode === 'continueTask' ? 'is-active' : ''}">Continue</button>
      <button data-action="markTaskDone" ${task ? '' : 'disabled'} class="${composerMode === 'markTaskDone' ? 'is-active' : ''}">Mark done</button>
      <button data-action="acceptOverride" ${task ? '' : 'disabled'} class="${composerMode === 'acceptOverride' ? 'is-active' : ''}">Accept override</button>
    </div>
  `

  let form = ''
  if (composerMode === 'newTask') {
    form = `
      <form class="composer-form" data-form="newTask">
        <label>
          <span>Task title</span>
          <input name="title" type="text" placeholder="What are you trying to do?" required />
        </label>
        <label>
          <span>Task goal</span>
          <textarea name="goal" rows="6" placeholder="Describe the desired outcome, constraints, or acceptance criteria." required></textarea>
        </label>
        <div class="composer-actions">
          <button type="submit">Start task</button>
        </div>
      </form>
    `
  } else if (composerMode === 'continueTask') {
    form = `
      <form class="composer-form" data-form="continueTask">
        <label>
          <span>Continuation note</span>
          <textarea name="note" rows="6" placeholder="Add context for the next execution step." ${isTaskComposerDisabled ? 'disabled' : ''}></textarea>
        </label>
        <div class="composer-actions">
          <button type="submit" ${isTaskComposerDisabled ? 'disabled' : ''}>Continue task</button>
        </div>
      </form>
    `
  } else if (composerMode === 'markTaskDone') {
    form = `
      <form class="composer-form" data-form="markTaskDone">
        <label>
          <span>Completion summary</span>
          <textarea name="summary" rows="6" placeholder="Summarize what was completed and any important handoff context." ${isTaskComposerDisabled ? 'disabled' : ''}></textarea>
        </label>
        <div class="composer-actions">
          <button type="submit" ${isTaskComposerDisabled ? 'disabled' : ''}>Mark task done</button>
        </div>
      </form>
    `
  } else {
    form = `
      <form class="composer-form" data-form="acceptOverride">
        <label>
          <span>Risk acknowledgement</span>
          <textarea name="acknowledgement" rows="6" placeholder="Describe why you accept the risk and want to continue." ${isTaskComposerDisabled ? 'disabled' : ''} required></textarea>
        </label>
        <div class="composer-actions">
          <button type="submit" ${isTaskComposerDisabled ? 'disabled' : ''}>Accept override</button>
        </div>
      </form>
    `
  }

  return `
    <section class="card composer-card">
      <h3>${escapeHtml(activeLabelMap[composerMode])}</h3>
      <p class="muted">Commands remain available for debug, but pending interaction now takes priority.</p>
      ${taskSwitchButtons}
      ${form}
    </section>
  `
}

export function renderTaskConsoleHtml(state: AgentILSPanelState, composerMode: TaskConsoleComposerMode) {
  const task = state.snapshot.activeTask
  const conversation = state.snapshot.conversation
  const summary = state.snapshot.latestSummary
  const taskCount = state.snapshot.taskHistory.length
  const mode = task?.controlMode ?? 'normal'
  const phase = task?.phase ?? 'await_next_task'
  const status = task?.status ?? 'idle'
  const nonce = `${Date.now()}${Math.random().toString(36).slice(2)}`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AgentILS Task Console</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #121826;
      --panel: #1a2233;
      --panel-2: #202b41;
      --text: #edf2ff;
      --muted: #9fb1d1;
      --accent: #7ad7b4;
      --accent-2: #73b7ff;
      --border: #31415f;
    }
    body {
      margin: 0;
      padding: 20px;
      font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
      background:
        radial-gradient(circle at top left, rgba(122, 215, 180, 0.12), transparent 28%),
        radial-gradient(circle at top right, rgba(115, 183, 255, 0.14), transparent 32%),
        var(--bg);
      color: var(--text);
    }
    .hero, .grid {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      margin-bottom: 16px;
    }
    .hero {
      align-items: start;
      padding: 20px;
      background: linear-gradient(145deg, rgba(32, 43, 65, 0.98), rgba(26, 34, 51, 0.98));
      border: 1px solid var(--border);
      border-radius: 16px;
    }
    .card {
      padding: 16px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 14px;
    }
    .pending-card {
      margin-bottom: 16px;
      border-color: rgba(122, 215, 180, 0.55);
      box-shadow: 0 0 0 1px rgba(122, 215, 180, 0.2) inset;
    }
    .eyebrow {
      margin: 0 0 8px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 11px;
      color: var(--muted);
    }
    h1, h3, p { margin-top: 0; }
    h1 { font-size: 28px; margin-bottom: 6px; }
    h3 { font-size: 16px; margin-bottom: 12px; }
    .muted { color: var(--muted); white-space: pre-wrap; }
    .badges, .actions, .composer-switches, .composer-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.06);
      border: 1px solid var(--border);
      font-size: 12px;
    }
    /* Control mode colored badges */
    .badge-mode-normal  { border-color: #4ade80; color: #4ade80; }
    .badge-mode-alternate { border-color: #facc15; color: #facc15; }
    .badge-mode-direct  { border-color: #f97316; color: #f97316; }
    /* Risk level colored badges */
    .badge-risk-low    { border-color: #4ade80; color: #4ade80; }
    .badge-risk-medium { border-color: #facc15; color: #facc15; }
    .badge-risk-high   { border-color: #ef4444; color: #ef4444; }
    .badge-risk-unknown { border-color: var(--muted); color: var(--muted); }
    .composer-card { margin-top: 16px; }
    .composer-form {
      display: grid;
      gap: 12px;
    }
    .composer-form label {
      display: grid;
      gap: 6px;
    }
    .composer-form span {
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .composer-form input,
    .composer-form textarea,
    .composer-form select,
    button {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.04);
      color: var(--text);
      border-radius: 10px;
      padding: 10px 12px;
      font: inherit;
    }
    .composer-form textarea { resize: vertical; }
    .composer-form input:focus,
    .composer-form textarea:focus,
    .composer-form select:focus,
    button:focus {
      outline: none;
      border-color: var(--accent);
    }
    button {
      width: auto;
      cursor: pointer;
    }
    button.is-active {
      border-color: var(--accent);
      color: var(--accent);
    }
    ul {
      margin: 0;
      padding-left: 18px;
    }
    @media (max-width: 720px) {
      body { padding: 14px; }
      h1 { font-size: 22px; }
    }
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      max-width: 560px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    .modal-alternate {
      border-left: 4px solid #facc15;
    }
    .modal-summary { margin-bottom: 12px; }
    .modal-detail h3, .modal-risks h3 { font-size: 14px; margin-bottom: 8px; }
    .modal-risks {
      background: rgba(255, 200, 0, 0.08);
      border: 1px solid rgba(255, 200, 0, 0.3);
      border-radius: 8px;
      padding: 12px 16px;
      margin: 12px 0;
    }
    .modal-hint { font-size: 12px; color: #facc15; margin-top: 8px; margin-bottom: 0; }
    .modal-actions { display: flex; gap: 8px; margin-top: 16px; }
    .btn-primary {
      background: var(--accent);
      color: var(--bg);
      border: none;
      font-weight: bold;
    }
    .btn-warning {
      background: #facc15;
      color: #1a1a1a;
      border: none;
      font-weight: bold;
    }
    .btn-secondary {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted);
    }
  </style>
</head>
<body>
  ${renderPendingInteraction(state.pendingInteraction)}
  <section class="hero">
    <div>
      <p class="eyebrow">AgentILS Interaction Console</p>
      <h1>${task ? escapeHtml(task.title) : 'No active task'}</h1>
      <p class="muted">${task ? escapeHtml(task.goal) : 'Start a new task or let a Copilot tool open a pending interaction here.'}</p>
    </div>
    <div class="badges">
      ${renderControlModeBadge(mode)}
      <span class="badge">${escapeHtml(conversation.state)}</span>
      <span class="badge">${escapeHtml(phase)}</span>
      <span class="badge">${escapeHtml(status)}</span>
    </div>
  </section>

  <section class="grid">
    <section class="card">
      <h3>Conversation</h3>
      <p><strong>ID:</strong> ${escapeHtml(conversation.conversationId)}</p>
      <p><strong>Tasks:</strong> ${taskCount}</p>
      <p><strong>Active task:</strong> ${task ? escapeHtml(task.taskId) : 'None'}</p>
      <div class="actions">
        <button data-action="newTask">New task</button>
        <button data-action="continueTask" ${task ? '' : 'disabled'}>Continue task</button>
        <button data-action="markTaskDone" ${task ? '' : 'disabled'}>Mark task done</button>
        <button data-action="acceptOverride" ${task ? '' : 'disabled'}>Accept override</button>
        <button data-action="openSummary" ${summary ? '' : 'disabled'}>Open summary</button>
      </div>
    </section>

    ${task ? `
      <section class="card">
        <h3>Task</h3>
        <p><strong>Title:</strong> ${escapeHtml(task.title)}</p>
        <p><strong>Goal:</strong> ${escapeHtml(task.goal)}</p>
        <p><strong>Scope:</strong> ${escapeHtml(task.scope.length ? task.scope.join(', ') : 'None')}</p>
        <p><strong>Constraints:</strong> ${escapeHtml(task.constraints.length ? task.constraints.join(', ') : 'None')}</p>
        <p><strong>Risks:</strong> ${escapeHtml(task.risks.length ? task.risks.join(', ') : 'None')}</p>
        <p><strong>Override:</strong> ${task.overrideState.confirmed ? 'confirmed' : 'not confirmed'}</p>
        <p><strong>Updated:</strong> ${escapeHtml(task.updatedAt)}</p>
      </section>
    ` : `
      <section class="card">
        <h3>Task</h3>
        <p class="muted">No active task. Use New task to start one.</p>
      </section>
    `}
  </section>

  <section class="grid">
    ${renderList('Open questions', task?.openQuestions ?? [])}
    ${renderList('Assumptions', task?.assumptions ?? [])}
    ${renderList('User decisions needed', task?.decisionNeededFromUser ?? [])}
  </section>

  <section class="card">
    <h3>Summary</h3>
    <p class="muted">${summary ? `Latest summary: ${escapeHtml(summary.filePath)}` : 'No summary document has been generated yet.'}</p>
  </section>

  ${renderComposer(state, composerMode)}

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.querySelectorAll('button[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.action;
        const requestId = button.dataset.requestId;
        if (action === 'submitApprovalConfirm' && requestId) {
          vscode.postMessage({ action: 'submitApprovalConfirm', requestId });
        } else if (action === 'submitApprovalDecline' && requestId) {
          vscode.postMessage({ action: 'submitApprovalDecline', requestId });
        } else {
          vscode.postMessage({ action });
        }
      });
    });

    document.querySelectorAll('button[data-cancel-request-id]').forEach((button) => {
      button.addEventListener('click', () => {
        vscode.postMessage({
          action: 'cancelPendingInteraction',
          requestId: button.dataset.cancelRequestId,
        });
      });
    });

    document.querySelectorAll('form[data-form="newTask"]').forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(form);
        vscode.postMessage({
          action: 'submitNewTask',
          title: String(data.get('title') || ''),
          goal: String(data.get('goal') || ''),
        });
      });
    });

    document.querySelectorAll('form[data-form="continueTask"]').forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(form);
        vscode.postMessage({
          action: 'submitContinueTask',
          note: String(data.get('note') || ''),
        });
      });
    });

    document.querySelectorAll('form[data-form="markTaskDone"]').forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(form);
        vscode.postMessage({
          action: 'submitMarkTaskDone',
          summary: String(data.get('summary') || ''),
        });
      });
    });

    document.querySelectorAll('form[data-form="acceptOverride"]').forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(form);
        vscode.postMessage({
          action: 'submitAcceptOverride',
          acknowledgement: String(data.get('acknowledgement') || ''),
        });
      });
    });

    document.querySelectorAll('form[data-form="pending"]').forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const kind = form.dataset.kind;
        const requestId = form.dataset.requestId;
        const message = {
          action: 'submitPendingInteraction',
          requestId,
          content: String(data.get('content') || ''),
          status: String(data.get('status') || ''),
          responseAction: String(data.get('responseAction') || ''),
          message: String(data.get('message') || ''),
          title: String(data.get('title') || ''),
          goal: String(data.get('goal') || ''),
          controlMode: String(data.get('controlMode') || ''),
        };
        vscode.postMessage(message);
      });
    });
  </script>
</body>
</html>`
}
