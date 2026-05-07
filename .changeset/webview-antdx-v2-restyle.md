---
---

feat(webview): restyle the AgentILS webview to the antd-x v2 Tbox playground layout (sider with Conversations + sparkle Welcome banner + gradient prompt cards + Sender quickPrompts), preserving the existing protocol-bridge / mcp single-source-of-truth contract. Adds a CSP allowance for `mdn.alipayobjects.com` so the official Tbox sparkle avatar renders inside the VS Code webview sandbox. Pure UI iteration in `apps/webview` and the bundled webview asset under `packages/extensions/agentils-vscode/webview/`; no publishable package version bump required (extensions are private; mcp/cli are excluded from changesets).
