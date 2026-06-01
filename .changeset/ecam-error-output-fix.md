---
'@agent-ils/quality-gate': patch
---

Fix ECAM pre-commit panel showing "AP DISCONNECT" instead of actual error output on step failure. The panel now displays the last meaningful line from subprocess stderr/stdout, with ANSI escapes stripped and truncation to fit the panel width.
