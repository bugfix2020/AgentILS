---
'@agent-ils/logger': patch
---

Fix ECAM panel border overflow when long values (e.g. deeply nested logDir paths) exceed IW=60. The Go binary's banner package now uses `visLen` for ANSI-aware length calculation and `padOrTruncate` / `truncateVisible` to enforce exact panel width, matching the quality-gate ECAM panel behavior.
