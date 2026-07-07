# @agent-ils/logger — LLM Usage Guide

This file is written for LLM agents (Codex, Claude Code, Copilot, Cursor, AgentILS, etc.). It contains everything an agent needs to install, run, write to, and read from `@agent-ils/logger` in a target project. It strips out the human-facing chrome (badges, language switcher, narrative) to keep your context budget small.

If you are a human, read `README.md` instead.

## What This Package Does

- Spawns a local HTTP collector that writes JSONL log records into `.agent-ils/logger/logs` of the target project.
- Provides a Browser SDK and a Node SDK that POST records to that collector.
- Provides a CLI to read records back by `--tail`, `--from`, `--to`, `--source`, `--level`, `--event`, in `text|json|jsonl` format.
- Default endpoint: `http://127.0.0.1:12138`.
- Default log directory: `.agent-ils/logger/logs`.
- Successful writes return or store `filePath`, `relativePath`, `line`, `location`, and `relativeLocation` so agents can cite exact log lines.
- It does NOT summarize, NOT diagnose, NOT compress logs. JSONL is the single source of truth.

## Decision Table

When the user says…

| User intent                                    | Run this                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| "Install / set up runtime logging"             | `npx @agent-ils/logger` (start collector)                                                 |
| "Start the collector" / "give me an endpoint"  | `npx @agent-ils/logger serve --json`                                                      |
| "Read the latest logs"                         | `npx @agent-ils/logger read --tail 80 --format json`                                      |
| "Read logs since 10 minutes ago"               | `npx @agent-ils/logger read --from 10m --format json`                                     |
| "Read logs in this time window"                | `npx @agent-ils/logger read --from <ISO> --to <ISO> --format json`                        |
| "Only read frontend warnings for event X"      | `npx @agent-ils/logger read --source frontend --level warn --event <event> --format json` |
| "Why is endpoint X returning empty / failing?" | `read --tail 80 --format json`, then narrow with `--from / --to`, follow `traceId`        |
| "Add logging to my frontend"                   | Use Browser SDK (see below)                                                               |
| "I want the logger to auto-start"              | Use Browser SDK with `open: true`; spawns collector automatically in Node                 |
| "Add logging to my Node / MCP / extension"     | Use Node SDK (see below)                                                                  |
| "I cannot install the SDK; just send raw HTTP" | Use the curl example below                                                                |

Pass `--cwd <dir>` to any command when the target project is not the current directory.

## Step 1: Start the Collector

Detect the package manager from lockfiles, then run the equivalent. All forms are interchangeable:

```sh
pnpm dlx @agent-ils/logger
npx @agent-ils/logger
yarn dlx @agent-ils/logger
bunx @agent-ils/logger
```

These package-manager commands first run the package's Node wrapper. The wrapper
must resolve a native `agent-ils-logger` binary and must not execute a
`node_modules/.bin/agent-ils-logger` shim, because that shim points back to the
wrapper itself.

Health check (use this before deciding the collector is broken):

```sh
curl http://127.0.0.1:12138/api/health
```

The response must be JSON with `ok: true` and `name: "agentils-logger"`. A
plain 2xx from another service on port 12138 is not collector readiness.

If the port is already in use, do not change the port silently. Ask the user, or pass `--port <n>` explicitly and tell them.

## Step 2: Write Logs (pick one)

### Browser

```ts
import { createBrowserLogger } from '@agent-ils/logger/browser'

const logger = createBrowserLogger({
    endpoint: 'http://127.0.0.1:12138',
    source: 'frontend',
    defaultFields: { app: '<app-name>' },
    enabled: import.meta.env.DEV,
    overrideKey: 'optional-secret-key',
    open: true, // auto-start collector in Node; start health probing immediately
})

const trace = { traceId: 'user-list-001' }
const result = await logger.info('api.response', { url: '/api/users', status: 200, empty: true }, trace)
if (result.record) {
    console.log(result.record.relativeLocation ?? result.record.location)
}
await logger.group('load users', { screen: 'users' }, trace)
await logger.info('api.request', { url: '/api/users' }, trace)
await logger.info('api.response', { url: '/api/users', status: 200 }, trace)
await logger.groupEnd(undefined, trace)
```

`logger.child(fields)` returns a child logger with merged default fields. Levels: `debug | info | warn | error`.
Successful writes return the written `record`; use `record.relativeLocation`
for concise LLM-facing `path:line`, or `record.location` for an absolute
`path:line`. If the result is `{ ok: true, status: 204 }`, no JSONL line was
written; start/wait for the collector before claiming a log location.

`logger.group(label, fields?)` writes `group.start`; `logger.groupEnd()` writes
`group.end`. Records inside the group carry `group`, `groupPath`, and
`groupDepth` in `fields`.

**overrideKey**: when `overrideKey` is set and matches `window.$agentILS.logger.overrideKey`, logs are force-enabled even with `enabled: false`. No-ops when `window` is unavailable (SSR / Node).

**Trace IDs**: Browser top-level `traceId` comes from the logger option or the
per-call override config (third argument). Node `createHttpLogger()` uses its
`traceId` option, with single-call `fields.traceId` as an override.
`defaultFields.traceId` and `child({ traceId })` are stored under `fields`, not
the top-level `traceId`.

**Collector readiness**: background `setInterval` probes `GET /api/health` every 10 s, independent of `log()` calls. When unready, `log()` returns `{ ok: true, status: 204 }` immediately (zero fetch, no CONNECTION_REFUSED). Pass `open: true` to start probing and auto-spawn the collector in Node at construction time. Self-heals on delivery failure via `markUnready()` + continued probing. The first probe is asynchronous, so do not expect `record` from the first browser log unless `/api/health` already passes.

Readiness requires the health body to contain `ok: true` and
`name: "agentils-logger"`. If another process owns the port and returns a
generic 2xx health response, the Browser SDK must stay unready and return
`{ ok: true, status: 204 }` instead of POSTing to `/api/logs`.

**Environment variables**: Browser SDK does not read `AGENTILS_DEBUG`,
`AGENTILS_LOG_URL`, or `AGENTILS_LOG_DIR`; pass `enabled`, `endpoint`, and
`open` explicitly. Node `createHttpLogger()` reads `AGENTILS_LOG_URL` as its
default endpoint and only honors `AGENTILS_DEBUG` when `respectDebugEnv: true`.
`AGENTILS_LOG_DIR` affects Node `defaultLogDir()` / `startHttpLogServer()`;
the native CLI uses `--cwd` and `--log-dir`.

**`.gitignore` auto-creation**: the collector writes a `.gitignore` with `*` in the log directory automatically.

### Node / MCP / Extension Host

```ts
import { createHttpLogger } from '@agent-ils/logger'

const httpLogger = createHttpLogger({
    source: 'mcp',
    endpoint: 'http://127.0.0.1:12138',
    traceId: 'feedback-001',
    defaultFields: { component: 'mcp' },
})

httpLogger.group('feedback flow')
httpLogger.info('interaction.submitted', { toolName: 'request_user_feedback', textLen: 42 })
httpLogger.groupEnd()
```

`createHttpLogger()` is fire-and-forget. It does not return the collector
response or a `location`; read records back with the CLI/query API when you
need the final `path:line`.

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

`POST /api/logs` accepts a single payload or an array. `filePrefix` becomes `<prefix>-YYYY-MM-DD.jsonl` in the log directory. The success response contains `record` or `records`, each with `filePath`, `relativePath`, `line`, `location`, and `relativeLocation`.

Single-payload success shape:

```json
{
    "ok": true,
    "record": {
        "event": "api.response",
        "line": 34,
        "location": "/abs/project/.agent-ils/logger/logs/frontend-2026-04-30.jsonl:34",
        "relativeLocation": "./.agent-ils/logger/logs/frontend-2026-04-30.jsonl:34"
    }
}
```

## Step 3: Read Logs

```sh
npx @agent-ils/logger read --tail 80 --format json
npx @agent-ils/logger read --from 10m --format json
npx @agent-ils/logger read --from 2026-04-30T10:00:00Z --to 2026-04-30T10:10:00Z --format json
npx @agent-ils/logger read --source frontend --level warn --event api.slow --format json
```

`--from` / `--to` accept ISO timestamps, epoch ms, or relative values like `10m`, `2h`, `1d`.
CLI formats are `text`, `json`, and `jsonl`. Use `--format json` when another
LLM will inspect the output. Programmatic `formatLogRecords()` also supports
`markdown`.

Programmatic read:

```ts
import { formatLogRecords, readLogRecords } from '@agent-ils/logger/query'

const records = await readLogRecords({ tail: 80, from: '10m' })
console.log(formatLogRecords(records, 'json'))
```

Read records include `location` / `relativeLocation`. Older JSONL lines that
do not store those fields are backfilled from the file path and physical line
number during reads.

## Recommended Field Conventions

When writing logs, prefer these field names so future reads are self-explanatory:

- `source`: `frontend | backend | webview | mcp | script`
- `event`: stable name like `api.request`, `api.response`, `ui.click`, `tool.call`
- `traceId`: chains one user action, request, or tool call across writers; in Browser use the `traceId` option or per-call override for top-level `traceId`
- `url` / `method` / `status`
- `params` / `body` / `empty`
- `costMs`
- `error`: `{ name, message, stack? }`
- `group` / `groupPath` / `groupDepth`: set automatically by `logger.group()`

## Diagnostic Workflow

1. Read the latest 50–100 records first; do not guess.
2. If you find a related record, narrow with `--from / --to` around its `ts`.
3. If records carry a `traceId`, pull all records with the same `traceId`.
4. Cite real fields in your conclusion (`source`, `event`, `traceId`, `url`, `status`, `fields`).
5. Include `relativeLocation` or `location` when pointing to the exact log line.
6. Never claim a root cause that is not visible in the JSONL.

## Safety Rules

- Do not change the default endpoint or log directory unless the user asks. Mention any change explicitly.
- Do not delete files under `.agent-ils/logger/logs` without explicit user confirmation.
- Do not rotate, compress, or move log files; this package intentionally leaves that to the user.
- If `curl /api/health` fails or does not return `name: "agentils-logger"`, start the collector before retrying reads, instead of inventing data.
- If a browser write returns `status: 204`, no record was written; retry after collector readiness instead of citing a missing line.
- Do not summarize logs in place of returning real records when the user asked for raw logs.

## Installing the Skill File for Yourself

If you are a skill-aware agent (Claude Code, Copilot, Cursor, AgentILS, etc.), this package ships a skill template at:

```text
node_modules/@agent-ils/logger/dist/templates/llm/agent-ils-logger.skill.md
```

You know which agent runtime you are. Look up the skill / instruction directory convention for that runtime (consult its official docs if needed) and copy the file there. Do not invent a path; if you are uncertain, ask the user where their skill directory lives.

After installing the skill, future user prompts about "runtime logs", "jsonl logs", "frontend / backend / webview / mcp debugging" should auto-recall this package without the user having to mention it.
