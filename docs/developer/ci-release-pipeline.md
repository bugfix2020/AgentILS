# CI / Release Pipeline Walkthrough

> English · [简体中文](ci-release-pipeline.zh-CN.md)
>
> **Audience:** maintainers and contributors who need to understand how AgentILS
> builds, tests, versions, and publishes packages.
> **Last updated:** 2026-05-06 (post PR #10 + OIDC release pipeline rollout)
>
> Authoritative source-of-truth for rule-level constraints lives in
> [`docs/instructions/agentils.instructions.md`](../instructions/agentils.instructions.md)
> (synced into `.github/instructions/`, `AGENTS.md`,
> `.github/copilot-instructions.md`). This document is the **narrative
> walkthrough** that complements those rules.

---

## TL;DR

Two GitHub Actions workflows, one job each, running on every push to `main` (and
PRs for CI):

| Workflow                                                               | When                      | Node                   | Job                                                                    |
| ---------------------------------------------------------------------- | ------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)           | every PR + push to `main` | 22 LTS                 | quality gate (build → typecheck → lint → sync check → changeset check) |
| [`.github/workflows/release.yml`](../../.github/workflows/release.yml) | push to `main` only       | 24 (npm 11.5+ bundled) | `changesets/action`: open Version PR or publish to npm via OIDC        |

Publishable packages: **`@agent-ils/quality-gate`**, **`@agent-ils/logger`**.
Everything else (`@agent-ils/mcp`, `@agent-ils/cli`, `agentils-vscode`,
`agentils-vscode-webview`) is `"private": true` and never reaches npm.

---

## Branch model: GitHub Flow (no `dev` branch)

- `main` is the only long-lived branch.
- Feature branches cut from `main`, PR back to `main`, **squash and merge**, then
  delete the feature branch.
- Naming follows the [`branch-name-standard` skill](../skills/).
- Rationale: PR #6 (2026-05) merged before later pushes landed and we lost work
  on a phantom `dev` branch — the `dev` model offered zero benefit for a 1–2
  contributor repo and added sync overhead. Documented in PR #9.

---

## `ci.yml` — Quality gate

Triggered on every PR and every push to `main`. **Required to be green to merge.**

```
checkout (actions/checkout@v6)
  ↓
install pnpm (pnpm/action-setup@v6)
  ↓
setup node 22 LTS (actions/setup-node@v6) + pnpm cache
  ↓
pnpm install --frozen-lockfile
  ↓
pnpm build                # MUST run before typecheck — workspace
                          # dependencies need .d.ts to type-resolve
  ↓
pnpm typecheck            # tsc --noEmit across all workspace packages
  ↓
pnpm lint                 # ESLint v9 flat config
  ↓
pnpm sync:instructions:check
                          # ensures .github/instructions/, AGENTS.md, etc.
                          # match docs/instructions/ — guards against
                          # someone hand-editing the generated mirrors
  ↓
.changeset presence check
                          # if the PR touched packages/quality-gate/* or
                          # packages/logger/* but didn't add a .changeset/*.md,
                          # CI fails. Other paths exempt.
  ↓
(test step is currently commented — TODO inside workflow points at a
 pre-existing mcp e2e test drift. Track in
 packages/mcp/test/e2e/agentils-vsix-parity.test.ts.)
```

### Why `build` runs before `typecheck`

Workspace packages depend on each other via `dist/index.d.ts`. On a clean CI
runner without a turbo cache, running `tsc --noEmit` first can fail with
`TS2307: Cannot find module '@agent-ils/<x>'` because the dependency hasn't
emitted its types yet. `turbo.json` enforces this with
`typecheck.dependsOn: ["^build", "^typecheck"]`.

### ESLint v9 flat config gotcha

ESLint v9's flat config **does not honor `.gitignore`**. `eslint.config.mjs`
must list explicit ignores:

```js
ignores: ['.tmp/**', '**/scripts/**/*.mjs', 'packages/extensions/*/webview/**']
```

When you add a new build artifact directory or test fixture path, mirror it in
`eslint.config.mjs` or CI will lint files you didn't mean to lint.

### `.gitignore` requirements

Must include `.agent-ils/` — the local JSONL artifact directory written by
`@agent-ils/logger` during tests. It has been accidentally committed before;
when the test suite runs in CI it produces these files and they should not
travel.

---

## `release.yml` — Versioning + publish automation

Triggered **only** on push to `main`. Runs in parallel with `ci.yml` (they're
independent workflows; this is intentional — release failures shouldn't block
PR validation, and vice versa).

### Job-level setup

```yaml
permissions:
    contents: write # for the auto-opened Version PR
    pull-requests: write # for the auto-opened Version PR
    id-token: write # for npm OIDC trusted publisher exchange
```

Node 24 is used here (not 22 like CI) because:

1. npm Trusted Publisher (OIDC) requires npm ≥ 11.5.1.
2. Node 24 ships with npm 11.5+ out of the box — **no `npm install -g` step
   needed**.
3. Trying `npm install -g npm@latest` on Node 22 crashes the global npm
   installation with `MODULE_NOT_FOUND: Cannot find module 'promise-retry'`
   — npm 11.5's bundled-deps tree, when extracted on top of Node 22's
   bundled npm 10.x layout under `/opt/hostedtoolcache/node/22.x/lib/`,
   ends up with broken require resolution. `--force` does not help.
   Switching to Node 24 sidesteps the problem entirely.

### What `changesets/action` does on each run

```
changesets/action@v1
  ├─ scan .changeset/*.md
  │
  ├─ if any .changeset/*.md exist
  │     ↓
  │  Open or update a PR titled "chore(release): version packages"
  │  whose contents are the output of `pnpm changeset version`:
  │    • bump version numbers in affected packages' package.json
  │    • prepend a fresh entry to each affected packages/<name>/CHANGELOG.md
  │    • delete the consumed .changeset/*.md files
  │  When that PR is merged, this workflow runs again and falls through
  │  to the "no changesets" branch below.
  │
  └─ if no .changeset/*.md exist
        ↓
     Run `pnpm changeset publish`:
       • iterate every non-private package in the workspace
       • compare local version to npm registry version
       • for any package whose local version is newer:
           - publish to npm (OIDC token + provenance signature)
           - create git tag <pkg>@<version> and push
           - create GitHub Release
       • packages already at registry parity are skipped silently
```

### Why "private:true" instead of `.changeset/config.json` `ignore`

The `ignore` field in `.changeset/config.json` **only affects the `version`
command — it does NOT affect `publish`** (per the
[changesets official docs](https://github.com/changesets/changesets/blob/main/docs/config-file-options.md#ignore)).

If you want a package to never reach npm, set `"private": true` in its
`package.json`. That is the only mechanism `changeset publish` honors.

We currently keep both:

- `package.json` `"private": true` (the load-bearing rule)
- `.changeset/config.json` `ignore: ["@agent-ils/mcp", "@agent-ils/cli"]`
  (defense in depth, in case someone toggles `private` off without thinking)

### OIDC Trusted Publisher

Each publishable package is registered at
`https://www.npmjs.com/package/<pkg>/access` → Trusted Publisher → GitHub
Actions, with:

- Organization: `bugfix2020`
- Repository: `AgentILS`
- Workflow filename: `release.yml`
- Environment: (empty)

This means the workflow can publish without a long-lived `NPM_TOKEN` secret —
the npm registry mints a short-lived token from GitHub's OIDC ID token at
publish time. The publish is automatically signed with provenance metadata
(via `NPM_CONFIG_PROVENANCE: "true"` env), so consumers can verify what built
the artifact.

**Do not add `NPM_TOKEN` back.** It defeats the security improvement and
introduces a credential to rotate.

---

## A normal release end-to-end

```
1. Branch off main:
       git checkout main && git pull --ff-only
       git checkout -b fix/logger-default-paths

2. Make your code changes inside packages/logger/...

3. Generate a changeset:
       pnpm changeset
       # interactive: pick @agent-ils/logger, pick patch/minor/major,
       # write a one-line summary. Produces .changeset/<random>.md

4. Commit and push:
       git add -A
       git commit -m "fix(logger): correct default JSONL output path"
       git push -u origin fix/logger-default-paths

5. Open a PR targeting main. CI runs (ci.yml) — must be green.

6. Squash-merge the PR. Delete the feature branch.

7. Wait ~30 seconds. Two workflow runs appear:
     CI #N      — pure quality re-validation on main; will be green.
     Release #N — opens (or updates) a PR titled
                  "chore(release): version packages" containing the
                  version bump and CHANGELOG entry derived from your
                  .changeset/*.md.

8. Review that Version PR. The diff shows:
     - packages/logger/package.json   version bumped
     - packages/logger/CHANGELOG.md   new entry prepended
     - .changeset/<random>.md         deleted

9. Squash-merge the Version PR.

10. release.yml fires once more. This time there are no .changeset/*.md
    files, so it runs `pnpm changeset publish`:
      - sees @agent-ils/logger@<new> > registry version
      - publishes to npm with OIDC + provenance
      - tags `@agent-ils/logger@<new>` and pushes
      - creates a GitHub Release

You have not run a single publish command yourself.
```

---

## Things that have bitten us — keep in mind when editing CI

| Symptom                                                                                                     | Root cause                                                            | Fix                                                           |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| `TS2307: Cannot find module '@agent-ils/<x>'` in CI                                                         | typecheck ran before workspace deps built `.d.ts`                     | `turbo.json` `typecheck.dependsOn` must include `^build`      |
| ESLint flagging files inside `.tmp/` or `*.back/`                                                           | flat config doesn't read `.gitignore`                                 | add to `ignores` in `eslint.config.mjs`                       |
| `.agent-ils/logger/logs/*.jsonl` showing up in `git status`                                                 | logger test side effect                                               | `.agent-ils/` in `.gitignore`                                 |
| `MODULE_NOT_FOUND: 'promise-retry'` after `npm install -g`                                                  | Node 22 + npm 11.5 self-replace bug                                   | use Node 24 in release.yml; never `npm install -g npm@latest` |
| Annotation: "Node.js 20 is deprecated"                                                                      | actions pinned at v4 (Node 20 runtime)                                | upgrade actions to `@v6` (Node 24 native)                     |
| Release publishes a half-baked package                                                                      | `.changeset` `ignore` doesn't stop publish                            | `"private": true` in that package's `package.json`            |
| `TypeError: Cannot read properties of undefined (reading 'split')` from `node -e "process.versions.npm..."` | `process.versions` has no `npm` key                                   | use `npm --version` shell command                             |
| Two workflow runs for one push to `main`                                                                    | `ci.yml` and `release.yml` both subscribe to `push: branches: [main]` | not a bug — designed to be independent                        |

---

## Where to make changes

- **Workflow logic itself:** edit `.github/workflows/{ci,release}.yml` directly.
- **Rules / constraints / "you must" language:** edit
  [`docs/instructions/agentils.instructions.md`](../instructions/agentils.instructions.md)
  then run `pnpm sync:instructions`. Never hand-edit
  `.github/instructions/*` or `AGENTS.md`.
- **This walkthrough document:** edit it directly. It's narrative, not synced.
