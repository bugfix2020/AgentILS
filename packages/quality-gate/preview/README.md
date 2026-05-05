# Preview Recordings

This folder contains the GIF recordings embedded in the package README, plus the
machinery used to (re)generate them.

| File          | Purpose                                                               |
| ------------- | --------------------------------------------------------------------- |
| `dry-run.gif` | Embedded in README — `agentils-precommit-gate --dry-run` (all green). |
| `error.gif`   | Embedded in README — failure path (`--dry-run-fail`).                 |
| `dry-run.yml` | terminalizer frame log captured by `record.mjs dry-run`.              |
| `error.yml`   | terminalizer frame log captured by `record.mjs error`.                |
| `record.mjs`  | Custom node-pty recorder; bypasses `terminalizer record` CLI.         |

## Re-recording

```sh
# 1. Build the precommit binary
pnpm --filter @agent-ils/quality-gate build

# 2. Capture both frame logs
node packages/quality-gate/preview/record.mjs dry-run
node packages/quality-gate/preview/record.mjs error

# 3. Render to GIF (uses terminalizer's electron renderer)
npx terminalizer render packages/quality-gate/preview/dry-run -o packages/quality-gate/preview/dry-run.gif
npx terminalizer render packages/quality-gate/preview/error   -o packages/quality-gate/preview/error.gif
```

`record.mjs` calls `node-pty.spawn` directly with absolute paths because
`terminalizer record --config` injects every YAML field as a CLI flag default,
which collides with the precommit binary's own `--dry-run` argument.
