---
'@agent-ils/logger': minor
---

Add grouped logging with `logger.group()` / `logger.groupEnd()`, return `path:line` metadata after successful log writes, use version-matched native collector binaries, require logger collector changes to release through `@agent-ils/logger`, and harden collector readiness so wrong-service health checks return `204` instead of posting to `/api/logs`.
