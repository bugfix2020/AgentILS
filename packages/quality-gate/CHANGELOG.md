# @agent-ils/quality-gate

## 0.0.3

### Patch Changes

- 8d7ec1a: Fix ECAM pre-commit panel to render full error output below the panel box on step failure. The failing step row now shows a short "FAILED" status inside the box, and the complete error output (up to 20 meaningful lines with ANSI escapes stripped) is rendered below the panel box for full visibility. The dry-run-fail scenario now simulates realistic ESLint lint-staged output with actual variable names, line numbers, and rule names.
