import * as vscode from 'vscode'
import type { AgentILSRuntimeSnapshot } from './model'
import type { AgentILSTaskServiceClient } from './task-service-client'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
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

function renderSnapshot(snapshot: AgentILSRuntimeSnapshot) {
  const task = snapshot.activeTask
  const conversation = snapshot.conversation
  const summary = snapshot.latestSummary
  const taskCount = snapshot.taskHistory.length
  const mode = task?.controlMode ?? 'normal'
  const phase = task?.phase ?? 'await_next_task'
  const status = task?.status ?? 'idle'

  return `
    <section class="hero">
      <div>
        <p class="eyebrow">AgentILS Task Console</p>
        <h1>${task ? escapeHtml(task.title) : 'No active task'}</h1>
        <p class="muted">${task ? escapeHtml(task.goal) : 'Start a new task to begin a fresh conversation loop.'}</p>
      </div>
      <div class="badges">
        <span class="badge badge-mode">${escapeHtml(mode)}</span>
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
          <p class="muted">No active task. Use <strong>New task</strong> to start one.</p>
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
  `
}

export class TaskConsolePanel implements vscode.Disposable {
  private static currentPanel: TaskConsolePanel | null = null

  static createOrShow(
    extensionUri: vscode.Uri,
    client: AgentILSTaskServiceClient,
    onDispose?: () => void,
  ) {
    if (TaskConsolePanel.currentPanel) {
      TaskConsolePanel.currentPanel.panel.reveal(vscode.ViewColumn.Active)
      return TaskConsolePanel.currentPanel
    }

    const panel = vscode.window.createWebviewPanel(
      'agentilsTaskConsole',
      'AgentILS Task Console',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    )

    TaskConsolePanel.currentPanel = new TaskConsolePanel(panel, extensionUri, client, onDispose)
    return TaskConsolePanel.currentPanel
  }

  private disposables: vscode.Disposable[] = []

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly client: AgentILSTaskServiceClient,
    private readonly onDispose?: () => void,
  ) {
    this.panel.webview.html = this.getHtml(this.client.snapshot())

    this.disposables.push(
      this.panel.onDidDispose(() => this.dispose()),
      this.client.onDidChange((snapshot) => {
        this.panel.webview.html = this.getHtml(snapshot)
      }),
      this.panel.webview.onDidReceiveMessage(async (message) => {
        await this.handleMessage(message)
      }),
    )
  }

  dispose() {
    TaskConsolePanel.currentPanel = null
    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop()
      disposable?.dispose()
    }
    this.onDispose?.()
  }

  private async handleMessage(message: unknown) {
    if (!message || typeof message !== 'object') {
      return
    }

    const payload = message as { action?: string }
    switch (payload.action) {
      case 'newTask':
        await vscode.commands.executeCommand('agentils.newTask')
        return
      case 'continueTask':
        await vscode.commands.executeCommand('agentils.continueTask')
        return
      case 'markTaskDone':
        await vscode.commands.executeCommand('agentils.markTaskDone')
        return
      case 'acceptOverride':
        await vscode.commands.executeCommand('agentils.acceptOverride')
        return
      case 'openSummary':
        await vscode.commands.executeCommand('agentils.openSummary')
        return
      default:
        return
    }
  }

  private getHtml(snapshot: AgentILSRuntimeSnapshot) {
    const nonce = `${Date.now()}${Math.random().toString(36).slice(2)}`
    const content = renderSnapshot(snapshot)

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
      --bg: #151922;
      --panel: #1d2330;
      --panel-2: #242a39;
      --text: #e8ecf4;
      --muted: #97a3b7;
      --accent: #7cc4ff;
      --accent-2: #8be28b;
      --warn: #ffbf69;
      --border: #31394d;
    }
    body {
      margin: 0;
      padding: 20px;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(124, 196, 255, 0.14), transparent 32%),
        radial-gradient(circle at top right, rgba(139, 226, 139, 0.12), transparent 28%),
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
      background: linear-gradient(145deg, rgba(36, 42, 57, 0.98), rgba(29, 35, 48, 0.98));
      border: 1px solid var(--border);
      border-radius: 16px;
    }
    .card {
      padding: 16px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 14px;
    }
    .eyebrow {
      margin: 0 0 8px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 11px;
      color: var(--muted);
    }
    h1, h3, p {
      margin-top: 0;
    }
    h1 {
      font-size: 28px;
      margin-bottom: 6px;
    }
    h3 {
      font-size: 16px;
      margin-bottom: 12px;
    }
    .muted {
      color: var(--muted);
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-start;
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
    .badge-mode {
      color: var(--accent);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 14px;
    }
    button {
      appearance: none;
      border: 1px solid var(--border);
      background: var(--panel-2);
      color: var(--text);
      padding: 8px 12px;
      border-radius: 10px;
      cursor: pointer;
      font: inherit;
    }
    button:hover {
      border-color: var(--accent);
    }
    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    ul {
      margin: 0;
      padding-left: 18px;
    }
    li + li {
      margin-top: 6px;
    }
    strong {
      color: #ffffff;
    }
  </style>
</head>
<body>
  ${content}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) {
        return;
      }
      const action = target.dataset.action;
      if (!action) {
        return;
      }
      vscode.postMessage({ action });
    });
  </script>
</body>
</html>`
  }
}
