# @agent-ils/logger — LLM Usage Guide

This file is written for LLM agents (Codex, Claude Code, Copilot, Cursor, AgentILS, etc.). It contains everything an agent needs to install, run, write to, and read from `@agent-ils/logger` in a target project. It strips out the human-facing chrome (badges, language switcher, narrative) to keep your context budget small.

If you are a human, read `README.md` instead.

## What This Package Does

- Spawns a local HTTP collector that writes JSONL log records into `.agent-ils/logger/logs` of the target project.
- Provides a Browser SDK and a Node SDK that POST records to that collector.
- Provides a CLI to read records back by `--tail`, `--from`, `--to`, in `text|json|jsonl|markdown` format.
- Default endpoint: `http://127.0.0.1:12138`.
- Default log directory: `.agent-ils/logger/logs`.
- It does NOT summarize, NOT diagnose, NOT compress logs. JSONL is the single source of truth.

## Decision Table

When the user says…

| User intent                                    | Run this                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| "Install / set up runtime logging"             | `npx @agent-ils/logger` (start collector)                                          |
| "Start the collector" / "give me an endpoint"  | `npx @agent-ils/logger serve --json`                                               |
| "Read the latest logs"                         | `npx @agent-ils/logger read --tail 80 --format json`                               |
| "Read logs since 10 minutes ago"               | `npx @agent-ils/logger read --from 10m --format json`                              |
| "Read logs in this time window"                | `npx @agent-ils/logger read --from <ISO> --to <ISO> --format json`                 |
| "Why is endpoint X returning empty / failing?" | `read --tail 80 --format json`, then narrow with `--from / --to`, follow `traceId` |
| "Add logging to my frontend"                   | Use Browser SDK (see below)                                                        |
| "Add logging to my Node / MCP / extension"     | Use Node SDK (see below)                                                           |
| "I cannot install the SDK; just send raw HTTP" | Use the curl example below                                                         |

Pass `--cwd <dir>` to any command when the target project is not the current directory.

## Step 1: Start the Collector

Detect the package manager from lockfiles, then run the equivalent. All forms are interchangeable:

```sh
pnpm dlx @agent-ils/logger
npx @agent-ils/logger
yarn dlx @agent-ils/logger
bunx @agent-ils/logger
```

Health check (use this before deciding the collector is broken):

```sh
curl http://127.0.0.1:12138/api/health
```

If the port is already in use, do not change the port silently. Ask the user, or pass `--port <n>` explicitly and tell them.

## Step 2: Write Logs (pick one)

### Browser

```ts
import { createBrowserLogger } from '@agent-ils/logger/browser'

const logger = createBrowserLogger({
    endpoint: 'http://127.0.0.1:12138',
    source: 'frontend',
    defaultFields: { app: '<app-name>' },
})

await logger.info('api.response', { url: '/api/users', status: 200, empty: true }, { traceId: 'user-list-001' })
```

`logger.child(fields)` returns a child logger with merged default fields. Levels: `debug | info | warn | error`.

### Node / MCP / Extension Host

```ts
import { createHttpLogger } from '@agent-ils/logger'

const httpLogger = createHttpLogger({
    source: 'mcp',
    endpoint: 'http://127.0.0.1:12138',
})

httpLogger.info('run_task_loop.next', { action: 'await_webview' })
```

### Raw HTTP (no SDK)

```sh
curl -X POST http://127.0.0.1:12138/api/logs \
  -H 'content-type: application/json' \
  -d '{
    "source": "frontend",
    "level": "info",
    "event": "api.response",
    "message": "GET /api/users returned 200",
    "fields": { "url": "/api/users", "status": 200, "empty": true },
    "traceId": "user-list-001",
    "filePrefix": "frontend"
  }'
```

`POST /api/logs` accepts a single payload or an array. `filePrefix` becomes `<prefix>-YYYY-MM-DD.jsonl` in the log directory.

## Step 3: Read Logs

```sh
npx @agent-ils/logger read --tail 80 --format json
npx @agent-ils/logger read --from 10m --format json
npx @agent-ils/logger read --from 2026-04-30T10:00:00Z --to 2026-04-30T10:10:00Z --format json
```

`--from` / `--to` accept ISO timestamps, epoch ms, or relative values like `10m`, `2h`, `1d`.

Programmatic read:

```ts
import { formatLogRecords, readLogRecords } from '@agent-ils/logger/query'

const records = await readLogRecords({ tail: 80, from: '10m' })
console.log(formatLogRecords(records, 'json'))
```

## Recommended Field Conventions

When writing logs, prefer these field names so future reads are self-explanatory:

- `source`: `frontend | backend | webview | mcp | script`
- `event`: stable name like `api.request`, `api.response`, `ui.click`, `tool.call`
- `traceId`: chains one user action, request, or tool call across writers
- `url` / `method` / `status`
- `params` / `body` / `empty`
- `costMs`
- `error`: `{ name, message, stack? }`

## Diagnostic Workflow

1. Read the latest 50–100 records first; do not guess.
2. If you find a related record, narrow with `--from / --to` around its `ts`.
3. If records carry a `traceId`, pull all records with the same `traceId`.
4. Cite real fields in your conclusion (`source`, `event`, `traceId`, `url`, `status`, `fields`).
5. Never claim a root cause that is not visible in the JSONL.

## Safety Rules

- Do not change the default endpoint or log directory unless the user asks. Mention any change explicitly.
- Do not delete files under `.agent-ils/logger/logs` without explicit user confirmation.
- Do not rotate, compress, or move log files; this package intentionally leaves that to the user.
- If `curl /api/health` fails, start the collector before retrying reads, instead of inventing data.
- Do not summarize logs in place of returning real records when the user asked for raw logs.

## Installing the Skill File for Yourself

If you are a skill-aware agent (Claude Code, Copilot, Cursor, AgentILS, etc.), this package ships a skill template at:

```text
node_modules/@agent-ils/logger/dist/templates/llm/agent-ils-logger.skill.md
```

You know which agent runtime you are. Look up the skill / instruction directory convention for that runtime (consult its official docs if needed) and copy the file there. Do not invent a path; if you are uncertain, ask the user where their skill directory lives.

After installing the skill, future user prompts about "runtime logs", "jsonl logs", "frontend / backend / webview / mcp debugging" should auto-recall this package without the user having to mention it.
