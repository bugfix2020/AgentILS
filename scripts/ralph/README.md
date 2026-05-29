# Ralph Runtime Directory

This directory is runtime scaffolding for Ralph runs.

Role definitions do not live here. The source of truth is:

```text
docs/agents/ralph-*.md
```

The sync script generates tool-specific custom agents from those sources:

```text
.claude/agents/ralph-*.md
.github/agents/ralph-*.agent.md
.codex/agents/ralph-*.toml
```

Use `scripts/ralph/prd.json.example` as the run-state template. Active runs
should be created under:

```text
scripts/ralph/runs/<run>/
```

Historical run output is intentionally not kept here as source material. Keep
handoff evidence only for active or intentionally archived tasks.
