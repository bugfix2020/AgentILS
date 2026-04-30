---
name: agentils-quality-gate
description: 'Use when: the user asks to install or initialize AgentILS quality gate, Husky, lint-staged, Prettier, commitlint, Commitizen, conventional changelog, Conventional Commits, Git hooks, pre-commit hooks, or commit-msg hooks in a JavaScript or TypeScript project.'
---

# AgentILS Quality Gate

Use this package when a user asks to install or standardize project quality gates for a JavaScript or TypeScript project.

It initializes:

- Husky hooks
- lint-staged
- Prettier
- commitlint with Conventional Commits
- Commitizen / git-cz
- conventional changelog scripts

## Command Selection

Prefer the package manager already used by the target project:

```sh
pnpm dlx @agent-ils/quality-gate init
```

```sh
npx @agent-ils/quality-gate init
```

```sh
yarn dlx @agent-ils/quality-gate init
```

```sh
bunx @agent-ils/quality-gate init
```

Use `--cwd <dir>` when the target project is not the current working directory.

## Safety Rules

- Use `--dry-run` first when the user asks to preview changes.
- Use `--force` only after the user explicitly confirms overwriting existing config or hook files.
- Use `--skip-existing` when the user wants to keep existing files unchanged.
- Use `--merge` when the user wants supported files merged and unsupported files skipped.
- Use `--install` only when the user wants dependencies installed immediately.
- Use `--agentils-hooks` only when the user explicitly wants AgentILS custom Husky hook templates.
- Do not manually create these config files unless the package cannot be used.

## Expected Output

The CLI prints an AgentILS banner, package-manager information, git-style file statistics, skipped-file information when relevant, and a green success message at the end.
