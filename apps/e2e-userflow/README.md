# @agent-ils/e2e-userflow

End-to-end tests that exercise the **real user installation path**:

1. `agentils init --workspace <tmp>` (real CLI binary, real template files)
2. Inspect that `<tmp>/.vscode/mcp.json`, `<tmp>/.github/prompts/agentils.runTask.prompt.md`
   and the 24 derived agent/prompt templates were written.
3. Boot the real `@agent-ils/mcp` HTTP bridge.
4. Spawn the real `agentils-mcp --stdio` child process and exchange MCP messages over stdio.
5. Simulate the VS Code Language Model tool path:
    - extension calls `client.park({...})` (HTTP)
    - "user" submits via `POST /api/requests/:id/submit`
    - tool result equals submitted text
6. Validate the `agentils.runTask.prompt.md` asset references the renamed
   namespace (`agentils.*`, no leftover `humanClarification.*` / `hc.*`).

Run:

```pwsh
pnpm --filter @agent-ils/e2e-userflow test
```

Prereq: `pnpm --filter @agent-ils/mcp build && pnpm --filter @agent-ils/cli build`.
