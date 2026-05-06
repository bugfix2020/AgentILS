# AgentILS

> **A**gent **I**nstrument **L**anding **S**ystem — borrowing the aviation ILS metaphor: an LLM agent is a pilot, the IDE is the cockpit, and this monorepo is the runway-side beacon stack that keeps the agent's approach stable, observable, and abortable.

The aviation ILS feeds a pilot two perpendicular guidance signals (localizer + glide slope) plus a marker chain telling the cockpit "you are X km out, on path / off path". AgentILS does the analogous thing for an LLM agent driving a real codebase:

| Aviation ILS                  | AgentILS analogue                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| Localizer (lateral path)      | `packages/mcp` orchestrators — keep the agent on the planned task lane              |
| Glide slope (vertical path)   | `packages/quality-gate` ECAM panel — keeps each commit on the correct quality slope |
| Outer / Middle / Inner marker | `request_user_clarification` etc. — discrete "you are here, confirm" beacons        |
| Black box / FDR               | `packages/logger` — JSONL flight recorder for post-flight debugging                 |
| Tower comm                    | `packages/extensions/agentils-vscode` webview — pilot ↔ tower channel               |

If you have ever stared at a 30-minute-old LLM session and asked "where exactly did the agent depart from the plan?", you wanted an ILS.

## Hard Constraint

> **Chat never ends until the user explicitly closes it.**

A single LLM invocation must be able to host **multiple rounds** of clarification + tool calls. Anything that silently terminates the chat — finished tool, errored tool, "task done" guess — is a bug. Webview submissions feed back into the same invocation, never dispatch a new one.

## Repository Layout (real, as of `main`)

```
AgentILS/
├── apps/
│   ├── webview/            # Vite app rendering the AgentILS task console (real product surface)
│   ├── vscode-debug/       # Throwaway VS Code workspace for extension-host debugging
│   └── e2e-userflow/       # End-to-end user flow harness
├── packages/
│   ├── mcp/                # Control plane: state machine, orchestrators, MCP server (stdio/HTTP)
│   ├── extensions/agentils-vscode/  # VS Code extension: thin bridge to MCP, hosts the webview
│   ├── cli/                # `agentils` CLI: VS Code config injector for any IDE
│   ├── logger/             # @agent-ils/logger — local JSONL collector + reader (npm published)
│   ├── quality-gate/       # @agent-ils/quality-gate — ECAM-style pre-commit panel (npm published)
│   ├── mcp.back/           # Frozen previous-generation MCP — kept for reference, do not edit
│   └── cli.back/           # Frozen previous-generation CLI — kept for reference, do not edit
├── docs/
│   ├── instructions/       # Source of truth for per-area dev rules (Copilot/Codex/etc.)
│   ├── skills/             # Source of truth for agent-invokable skill cards
│   └── flowcharts/         # Mermaid + PNG topology diagrams
└── scripts/dev/            # Repo dev tooling (sync-agent-instructions, lint-staged wrappers)
```

The single source of truth for derived state lives inside `packages/mcp` (`memory-store`). Webview, extension, and CLI **do not** recompute it; they project from it (React-style unidirectional data flow).

## Published npm Packages

| Package                                            | Latest  | Purpose                                                      |
| -------------------------------------------------- | ------- | ------------------------------------------------------------ |
| [`@agent-ils/logger`](packages/logger)             | `0.0.2` | Local JSONL logger, browser/Node SDK + CLI for AI debug logs |
| [`@agent-ils/quality-gate`](packages/quality-gate) | `0.0.2` | A320-ECAM-style pre-commit pipeline + project initializer    |

## Quick Start (developer)

```sh
pnpm install

# Build everything once (extension host loads dist/ from each package)
pnpm -r --filter "./packages/*" --filter "./apps/webview" build

# Open the AgentILS extension host in a fresh VS Code window:
# uses the workspace task `open:agentils-extension-host` which builds + launches.
# (See .vscode/tasks or run via Command Palette → Tasks: Run Task)
```

In a Copilot Chat panel inside the launched extension host, type `@agentils` then `/runtask` to start a session. The webview becomes the primary input surface; chat messages stay minimal.

## Agent / LLM Workflow Rules

When you are an LLM working on this repo, read **in this order**:

1. This file.
2. `.github/copilot-instructions.md` (Copilot) **or** `AGENTS.md` (Codex / others) — both are auto-generated entry stubs that point at the same source.
3. The `*.instructions.md` files referenced from the entry stub (one per area: `mcp`, `cli`, `vscode-ext`, `quality-gate`, `logger`, `webview-source-of-truth`, `impl-debug`).
4. Skill cards under `.agents/skills/` or `.github/skills/` — invoke by description match (branch naming, instructions sync, npm publish, package readme/instruction sync).

**Never hand-edit** `.github/instructions/*`, `.github/skills/*`, `.agents/skills/*`, `.github/copilot-instructions.md`, or `AGENTS.md`. Edit the corresponding source under `docs/` and run:

```sh
pnpm run sync:instructions
```

## Pre-commit Pipeline

`.husky/pre-commit` runs `node packages/quality-gate/dist/precommit.js`, which discovers `agentils-gate.config.mjs` at the repo root and executes its three steps inside the ECAM TUI:

1. Sync agent instructions (`scripts/dev/sync-agent-instructions.mjs --stage`)
2. Generate flowchart PNGs (`pnpm run generate:flowcharts`)
3. Run `lint-staged` with progress (`scripts/dev/run-lint-staged-with-progress.mjs`)

A failing step blocks the commit. Do not bypass with `--no-verify` without discussion.

## License

MIT © liuyuxuan
