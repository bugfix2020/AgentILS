---
'@agent-ils/workflow-sdk': patch
---

Fix Vue dependency error: remove React/Vue exports from main entry point to prevent bundlers from resolving framework dependencies when importing from '@agent-ils/workflow-sdk'. Users should now import core functions from '@agent-ils/workflow-sdk/core' instead of the main entry.
