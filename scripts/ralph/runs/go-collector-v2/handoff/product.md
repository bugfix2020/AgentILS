# US-003 Product Handoff: Node Thin-Shell Passthrough Invoker Marking

> Target: `feat/logger-go-collector` branch, `packages/logger/src/cli.ts`
> Scope: 1-line env injection in the spawn call
> Depends on: US-001 (Go binary reads AGENT_ILS_INVOKER env var)

---

## 1. The Single Change

**File:** `packages/logger/src/cli.ts`  
**Line:** 192-195 (the spawn call in `main()`)

### Current code

```ts
const child = spawn(binaryPath, process.argv.slice(2), {
    stdio: 'inherit',
    env: process.env,
})
```

### New code

```ts
const child = spawn(binaryPath, process.argv.slice(2), {
    stdio: 'inherit',
    env: { ...process.env, AGENT_ILS_INVOKER: 'npx' },
})
```

That is the entire change. The spread `...process.env` preserves all existing environment variables and appends `AGENT_ILS_INVOKER='npx'`.

---

## 2. What NOT to Change

| File                                        | Reason                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/logger/src/browser.ts`            | SDK layer -- no modifications per AC                                                     |
| `packages/logger/src/index.ts`              | SDK layer -- no modifications per AC                                                     |
| `packages/logger/src/query.ts`              | SDK layer -- no modifications per AC                                                     |
| Any file under `packages/logger-collector/` | Go binary already reads `AGENT_ILS_INVOKER` from env (implemented in US-001 `detect.go`) |

---

## 3. Why This Works

US-001 implemented invoker detection in `packages/logger-collector/internal/banner/detect.go`:

1. If `os.Getenv("AGENT_ILS_INVOKER") == "npx"` -> npx mode
2. Else if `os.Args[0]` contains `"go-build"` -> gorun mode
3. Else -> binary mode

By injecting `AGENT_ILS_INVOKER='npx'` in the Node thin shell's spawn call, the Go child process will always detect npx mode when launched via `npx @agent-ils/logger`. This controls the banner info panel's install hint line and the `--help` usage prefix.

---

## 4. Acceptance Criteria Mapping

| #   | AC                                                                         | Implementation                                   |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | `cli.ts` spawn injects `env: { ...process.env, AGENT_ILS_INVOKER: 'npx' }` | Single line change at line 194                   |
| 2   | SDK layer (browser.ts, index.ts, query.ts) not modified                    | No changes to those files                        |
| 3   | `pnpm --filter @agent-ils/logger build` passes                             | No type errors; spread + string literal is valid |

---

## 5. Verification

After the change:

```bash
pnpm --filter @agent-ils/logger build
```

Must succeed with zero errors.
