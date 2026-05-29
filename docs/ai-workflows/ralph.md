# Ralph Multi-Agent Workflow

Ralph is the repository's evidence-driven AI collaboration workflow. It prevents a
single agent from defining requirements, implementing them, and declaring success
without independent review.

## Core Chain

```text
product -> developer -> ops? -> tester -> contributor? -> beta -> done
```

- `product` clarifies intent, acceptance criteria, non-goals, risks, affected
  surfaces, and `requiredStages`.
- `developer` implements only after reading the product handoff.
- `ops` updates CI, release, changeset, or publishing configuration when the
  story requires it.
- `tester` verifies implementation correctness and can send work back to
  `developer` or `product`.
- `contributor` checks docs and instructions from a new-developer perspective.
- `beta` simulates a real user and is the only role allowed to set
  `passes=true`.

## State Files

`scripts/ralph/` is runtime scaffolding only. Each active run uses a directory
under `scripts/ralph/runs/<run>/`:

```text
prd.json
progress.txt
handoff/product.md
handoff/developer.md
handoff/ops.md
handoff/tester.md
handoff/contributor.md
handoff/beta.md
```

Subagents communicate only through `prd.json`, `progress.txt`, and their own
handoff file. The orchestrating agent routes tasks and summarizes results, but
must not invent evidence for a role.

## Tool Mapping

The role definitions are authored once under `docs/agents/` and generated to:

- Claude Code: `.claude/agents/*.md`
- GitHub Copilot: `.github/agents/*.agent.md`
- Codex: `.codex/agents/*.toml`

The `/ralph` trigger means: run the same role chain using the current tool's
available custom-agent/subagent mechanism. Tools that cannot run an autonomous
loop should still preserve role isolation and handoff evidence.
