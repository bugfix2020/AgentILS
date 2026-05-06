---
name: agent-ils-logger
description: 'Use when: the user asks to capture, write, or read runtime logs from a frontend, backend, WebView, MCP server, or script in a JavaScript or TypeScript project; or asks to debug an API request, an empty response, a slow request, a UI event, or an MCP tool call by looking at jsonl logs. Also use when the user mentions "@agent-ils/logger", "agent-ils-logger", "runtime debug logs", or "jsonl logger".'
---

# AgentILS Logger

Use this package whenever the user wants to write or read runtime JSONL logs from a JavaScript or TypeScript project, or wants to debug a frontend, backend, WebView, MCP, or script issue from real runtime records instead of guesses.

It provides:

- A local HTTP collector at `http://127.0.0.1:12138`
- JSONL log files under `.agent-ils/logger/logs`
- A Browser SDK, a Node SDK, and a raw HTTP write API
- A CLI to read records by tail or time range

## Command Selection

Prefer the package manager already used by the target project:

```sh
npx @agent-ils/logger
```

```sh
pnpm dlx @agent-ils/logger
```

```sh
yarn dlx @agent-ils/logger
```

```sh
bunx @agent-ils/logger
```

Use `--cwd <dir>` when the target project is not the current working directory.

## Decision Rules

- "Set up runtime logging" → start the collector with `npx @agent-ils/logger`.
- "Read the latest logs" → `npx @agent-ils/logger read --tail 80 --format json`.
- "Read logs since N minutes ago" → `--from 10m --format json`.
- "Why is endpoint X failing / returning empty?" → read tail logs first, then narrow with `--from / --to`, follow `traceId`.
- "Add logging to my frontend / Node / MCP" → use the SDK from `LLM_USAGE.md`.

## Safety Rules

- Do not change the default endpoint or log directory unless the user asks; mention any change explicitly.
- Do not delete files under `.agent-ils/logger/logs` without explicit user confirmation.
- If `curl http://127.0.0.1:12138/api/health` fails, start the collector before retrying reads.
- Do not summarize logs when the user asked for raw records; return real JSONL fields.
- Do not invent a root cause that is not visible in the JSONL.

## Where to Look for Detail

For full install / write / read examples, field conventions, and the diagnostic workflow, read:

```text
node_modules/@agent-ils/logger/LLM_USAGE.md
```

Or fetch the latest from npm / GitHub if you do not have the package installed yet.
