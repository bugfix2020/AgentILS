# AgentILS Logger

<p align="center">
  <a href="https://www.npmjs.com/package/@agent-ils/logger"><img alt="npm" src="https://img.shields.io/npm/v/@agent-ils/logger?label=npm&color=CB3837"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white">
  <img alt="JSONL" src="https://img.shields.io/badge/logs-JSONL-7C3AED">
  <img alt="API" src="https://img.shields.io/badge/API-write%20%2B%20read-111827">
</p>

<p align="center">
  English | <a href="https://github.com/bugfix2020/AgentILS/blob/main/packages/logger/README.zh-CN.md">简体中文</a>
</p>

`@agent-ils/logger` is a local JSONL logger for AI-assisted debugging. It writes runtime events from your frontend, backend, WebView, MCP server, or scripts into local JSONL files, and lets a human or an LLM agent read those raw records back by tail count or time range.

It does only two things: write logs and read logs. It does not summarize, does not run automatic root-cause analysis, and does not compress logs into a digest. The JSONL files are the source of truth.

It is designed for both humans and LLM agents: humans run one command to start the collector and read tail logs, and agents recognize this package as the standard AgentILS log collector instead of guessing failures from chat history.

> This README is written for humans. If you want an LLM agent to set up, write, or read logs for you, point it at [`LLM_USAGE.md`](./LLM_USAGE.md) instead — that file is shorter, has no badges or language switcher, and saves your context tokens.

## Usage

Start the local log collector. It listens on a local HTTP endpoint and writes JSONL files into `.agent-ils/logger/logs` of the target project.

pnpm:

```sh
pnpm dlx @agent-ils/logger
```

npm:

```sh
npx @agent-ils/logger
```

yarn:

```sh
yarn dlx @agent-ils/logger
```

bun:

```sh
bunx @agent-ils/logger
```

For a project that is not the current directory, pass `--cwd`:

```sh
npx @agent-ils/logger --cwd packages/my-app
```

After it starts, the default endpoint is:

```text
http://127.0.0.1:12138
```

The default log directory is:

```text
.agent-ils/logger/logs
```

Read the latest 50 records:

```sh
npx @agent-ils/logger read --tail 50
```

Read everything since a point in time:

```sh
npx @agent-ils/logger read --from 2026-04-30T10:00:00Z --format json
```

Read a fixed time window:

```sh
npx @agent-ils/logger read --from 2026-04-30T10:00:00Z --to 2026-04-30T10:10:00Z --format json
```

`--from` and `--to` also accept relative values like `10m`, `2h`, `1d`:

```sh
npx @agent-ils/logger read --from 10m --format json
```

Before the package is published, test the built CLI from this repository:

```sh
pnpm --filter @agent-ils/logger build
node packages/logger/dist/cli.js read --tail 50
```

`npx`, `pnpm dlx`, `yarn dlx`, and `bunx` run a small Node wrapper first. The
wrapper must resolve a native `agent-ils-logger` binary from the system or
`~/.agent-ils/bin`; it intentionally ignores package-manager shims under
`node_modules/.bin` to avoid recursively spawning itself.

## Common Commands

Start the local log collector explicitly:

```sh
npx @agent-ils/logger serve
```

Start with a custom port and log directory:

```sh
npx @agent-ils/logger serve --port 12138 --log-dir .agent-ils/logger/logs
```

Print machine-readable startup info:

```sh
npx @agent-ils/logger serve --json
```

Read tail records:

```sh
npx @agent-ils/logger read --tail 80 --format json
```

Filter records by stable fields:

```sh
npx @agent-ils/logger read --tail 80 --source frontend --level warn --event api.slow --format json
```

Read by time range:

```sh
npx @agent-ils/logger read --from 2026-04-30T10:00:00Z --to 2026-04-30T10:10:00Z --format json
```

When the `read` subcommand is omitted but a read flag is present, the CLI runs `read` automatically:

```sh
npx @agent-ils/logger --tail 80 --format json
```

## Agent / LLM Usage

If you want an LLM agent to install, run, write to, or read from this package on your behalf, do not paste this README. Paste [`LLM_USAGE.md`](./LLM_USAGE.md) instead — it is the LLM-facing single-page guide and is much smaller in tokens.

If your agent runtime supports skills (Claude Code, Copilot, Cursor, AgentILS, etc.), this package also ships a recall skill at:

```text
node_modules/@agent-ils/logger/dist/templates/llm/agent-ils-logger.skill.md
```

To install the skill, you can ask your LLM:

```text
Please read node_modules/@agent-ils/logger/dist/templates/llm/agent-ils-logger.skill.md
(or fetch it from npm / GitHub if not installed yet) and copy it into the
skill / instruction directory of the agent runtime you are currently running on
(Codex, Claude Code, Copilot, Cursor, AgentILS, etc.). You know which runtime
you are; consult its official docs if you are unsure of the exact directory.
Ask me before guessing.
```

This intentionally lets the LLM (which knows its own runtime) decide the install path, instead of this package shipping a brittle IDE-to-directory table.

## CLI Options

```text
Usage:
  agent-ils-logger serve [options]
  agent-ils-logger read  [options]

Options for serve:
  --cwd <dir>            project root, defaults to cwd
  --host <host>          collector host, defaults to 127.0.0.1
  --port <port>          collector port, defaults to 12138
  --log-dir <dir>        JSONL log directory, defaults to .agent-ils/logger/logs
  --file-prefix <name>   default JSONL file name prefix, defaults to agent-ils
  --json                 print machine-readable startup info
  --silent               reduce startup output

Options for read:
  --cwd <dir>            project root, defaults to cwd
  --log-dir <dir>        JSONL log directory to scan, defaults to .agent-ils/logger/logs
  --tail <n>             read the tail n records, defaults to 50
  --from <time>          start time: ISO timestamp, epoch ms, or relative like 10m / 2h / 1d
  --to <time>            end time; omit to read up to the latest record
  --source <source>      filter by source field
  --level <level>        filter by level field, case-insensitive
  --event <event>        filter by event field
  --format <format>      text, json, or jsonl; defaults to text
```

## Log Record Shape

Each JSONL record stays human-readable, searchable, and directly quotable by an AI. A typical record:

```json
{
    "ts": "2026-04-30T10:00:00.000Z",
    "seq": 1,
    "pid": 12345,
    "source": "frontend",
    "namespace": "frontend",
    "level": "info",
    "event": "api.response",
    "message": "GET /api/users returned 200",
    "fields": {
        "url": "/api/users",
        "status": 200,
        "empty": true
    },
    "traceId": "user-list-001",
    "fileName": "frontend-2026-04-30.jsonl",
    "filePath": "/Users/me/project/.agent-ils/logger/logs/frontend-2026-04-30.jsonl",
    "relativePath": "./.agent-ils/logger/logs/frontend-2026-04-30.jsonl",
    "line": 34,
    "location": "/Users/me/project/.agent-ils/logger/logs/frontend-2026-04-30.jsonl:34",
    "relativeLocation": "./.agent-ils/logger/logs/frontend-2026-04-30.jsonl:34"
}
```

On successful writes, the HTTP response includes the written record. Use
`record.location` when a tool needs an absolute `path:line`, and
`record.relativeLocation` when showing a concise project-local location to a
human or LLM. Reads also include these fields; old JSONL records that do not
store them are backfilled from the file path and physical line number while
reading.

Recommended fields:

- `source`: log origin, such as `frontend`, `backend`, `webview`, `mcp`
- `event`: stable event name, such as `api.request`, `api.response`, `ui.click`
- `traceId`: chains one user action, request, or tool call
- `url` / `method` / `status`: most useful fields for endpoint debugging
- `params` / `body` / `empty`: check whether request inputs and response payloads match expectations
- `costMs`: investigate slow requests or timeouts
- `error`: error name, message, and stack when needed

## Browser SDK

`@agent-ils/logger/browser` is the browser-safe writer. It posts logs to the local collector via `fetch`.

```ts
import { createBrowserLogger } from '@agent-ils/logger/browser'

const logger = createBrowserLogger({
    endpoint: 'http://127.0.0.1:12138',
    source: 'frontend',
    defaultFields: { app: 'agentils-webview' },
})

await logger.debug('state.transition', { from: 'idle', to: 'loading' })
const result = await logger.info('api.response', { url: '/api/users', status: 200 }, { traceId: 'user-list-001' })
if (result.record) console.log(result.record.relativeLocation ?? result.record.location)
await logger.warn('api.slow', { url: '/api/users', costMs: 3500 })
await logger.error('api.error', { url: '/api/users', message: 'timeout' })
```

Group related records with `group` / `groupEnd`, similar to `console.group`:

```ts
const trace = { traceId: 'user-list-001' }
await logger.group('load users', { screen: 'users' }, trace)
await logger.info('api.request', { url: '/api/users' }, trace)
await logger.info('api.response', { url: '/api/users', status: 200 }, trace)
await logger.groupEnd(undefined, trace)
```

Grouped records carry `group`, `groupPath`, and `groupDepth` in `fields`.
`group()` writes a `group.start` record and `groupEnd()` writes a `group.end`
record.

Reuse context fields with `child`:

```ts
const taskLogger = logger.child({ page: 'users' })

await taskLogger.info('ui.click', { button: 'refresh' })
await taskLogger.info('api.request', { url: '/api/users' })
```

Common options:

- `endpoint`: local collector address
- `source`: log origin for this writer
- `defaultFields`: fields attached to every record
- `traceId`: default top-level trace id. For browser per-call trace ids, pass `{ traceId }` as the third argument; `defaultFields.traceId` stays inside `fields`
- `filePrefix`: JSONL file name prefix
- `fileName`: explicit JSONL file name
- `enabled`: turn delivery off without removing call sites
- `overrideKey`: when set and matching `window.$agentILS.logger.overrideKey`, force-enable logging even if `enabled: false`. Safe in SSR — no-ops when `window` is unavailable
- `timeoutMs`: per-request timeout
- `onDeliveryError`: callback when delivery fails
- `open`: when `true`, start health probing immediately at construction time and auto-spawn the collector binary in Node environments (zero-config startup)

**Write result**: a successful browser write returns `{ ok: true, status: 200, record }`. If delivery is disabled or the collector is not ready yet, it returns `{ ok: true, status: 204 }`; no JSONL line was written and `record` is absent. On delivery failure it returns `{ ok: false, error }`.

**Collector readiness check**: the browser SDK runs a background `setInterval` probe (`GET /api/health` every 10 s) independent of `log()` calls. Readiness requires a JSON response with `{ "ok": true, "name": "agentils-logger" }`; another service returning 2xx on the same port is treated as unready. When the collector is unready, `log()` returns `{ ok: true, status: 204 }` immediately with zero `/api/logs` fetch calls, so there are no CONNECTION_REFUSED or wrong-service 404 errors. On delivery failure, readiness is reset and the background probe continues, so the logger self-heals automatically. Pass `open: true` to start probing (and auto-spawn the collector in Node) at construction time. Because the first health probe is asynchronous, start the collector or check the `/api/health` JSON body before expecting a `record` from the first browser log.

**Environment behavior**: the Browser SDK does not read `AGENTILS_DEBUG`, `AGENTILS_LOG_URL`, or `AGENTILS_LOG_DIR`; pass `enabled`, `endpoint`, and `open` explicitly. `createLogger()` and `createChannelLogger()` use `AGENTILS_DEBUG` for `debug` / `info` filtering (`warn` / `error` always write). `createHttpLogger()` defaults its endpoint from `AGENTILS_LOG_URL` and only honors `AGENTILS_DEBUG` when `respectDebugEnv: true`. `AGENTILS_LOG_DIR` only changes the Node `defaultLogDir()` / `startHttpLogServer()` default; the native Go CLI uses `--cwd` and `--log-dir`.

**Log directory `.gitignore`**: the collector automatically creates a `.gitignore` with `*` in the log directory so log files are never accidentally committed.

## Node Writer API

The package root entry exposes Node-side helpers, useful from a Node process, an MCP server, or a VS Code extension host:

```ts
import { createHttpLogger, createLogger } from '@agent-ils/logger'

const stderrLogger = createLogger('mcp')
stderrLogger.warn('tool failed', { toolName: 'request_user_clarification' })

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

For Node HTTP logs, the `traceId` option sets the default top-level trace id;
`fields.traceId` on a single call overrides it. `defaultFields.traceId` remains
inside `fields`.

`createHttpLogger()` is fire-and-forget: its methods return `void` and do not
expose the collector response. Use the Browser SDK or raw HTTP API when the
caller needs the write result immediately, or read the JSONL records back with
`@agent-ils/logger/query`.

## HTTP Write API

If you do not want to use the SDK, post JSON directly:

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

`POST /api/logs` accepts a single payload or an array of payloads.

A single payload returns:

```json
{
    "ok": true,
    "record": {
        "event": "api.response",
        "filePath": "/Users/me/project/.agent-ils/logger/logs/frontend-2026-04-30.jsonl",
        "relativePath": "./.agent-ils/logger/logs/frontend-2026-04-30.jsonl",
        "line": 34,
        "location": "/Users/me/project/.agent-ils/logger/logs/frontend-2026-04-30.jsonl:34",
        "relativeLocation": "./.agent-ils/logger/logs/frontend-2026-04-30.jsonl:34"
    }
}
```

An array payload returns `{ "ok": true, "records": [...] }`.

Health check:

```sh
curl http://127.0.0.1:12138/api/health
```

A valid collector health response looks like:

```json
{ "ok": true, "name": "agentils-logger", "logDir": "/abs/project/.agent-ils/logger/logs" }
```

## Read API

To reuse the read logic in your own UI, script, or Ink panel, import from `@agent-ils/logger/query`:

```ts
import { formatLogRecords, readLogRecords } from '@agent-ils/logger/query'

const records = await readLogRecords({
    tail: 80,
    from: '2026-04-30T10:00:00Z',
})

console.log(formatLogRecords(records, 'json'))
```

The read parameters mirror the CLI: `tail`, `from`, `to`, `format`. The
programmatic formatter also supports `markdown`; the Go CLI supports
`text`, `json`, and `jsonl`.

## What It Does Not Do

`@agent-ils/logger` intentionally avoids the following:

- No automatic digest
- No automatic root-cause analysis
- No log database
- No complex query language
- No conclusions on behalf of a human or an AI

It is an observation tool, not a judgement tool.
