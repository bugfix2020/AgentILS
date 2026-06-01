---
'@agent-ils/logger': minor
---

Add `open` option to `createBrowserLogger` for zero-config collector startup. Health probe now runs in background `setInterval` instead of synchronous per-call fetch. Log directory auto-creates `.gitignore` to prevent accidental commits.
