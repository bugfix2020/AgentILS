# @agent-ils/workflow-sdk

## 0.0.4

### Patch Changes

- 97ce896: Fix Vue dependency error: remove React/Vue exports from main entry point to prevent bundlers from resolving framework dependencies when importing from '@agent-ils/workflow-sdk'. Users should now import core functions from '@agent-ils/workflow-sdk/core' instead of the main entry.

## 0.0.3

### Patch Changes

- b7b32ad: Add `repository` and `license` fields to package.json (required by npm Trusted Publisher / OIDC provenance verification).

## 0.0.2

### Patch Changes

- c56d4f8: Fix README links: add npm version badge, use GitHub absolute URLs for Chinese README and examples (relative links break on npmjs.com).

## 0.0.1

### Patch Changes

- e34033f: Add `@agent-ils/workflow-sdk`: framework-agnostic workflow engine with sequential node execution, context patching, stop/continue signals, hooks, and AbortSignal support. Includes React (`useWorkflow`) and Vue (`useWorkflow`) bindings with per-node state tracking, and interactive API Key management examples (React+Antd, Vue+ElementPlus).
