## (2026-04-22)

### ⚠ BREAKING CHANGES

- **interaction:** interactive_feedback tool now blocks until user finishes feedback loop

### Features

- add support for long-lived user interactions in MCP tools ([d71eadd](https://github.com/bugfix2020/AgentILS/commit/d71eadd054cffef2e53e84f6ab8c7e51ed632add))
- **agentils-vscode:** refresh webview loop and hooks ([8c5ca6a](https://github.com/bugfix2020/AgentILS/commit/8c5ca6a850aa83f1f07d08f5687f73a9cfa531b9))
- **interaction:** implement multi-round feedback loop with sampling support ([b56f36d](https://github.com/bugfix2020/AgentILS/commit/b56f36d2684066ba0a6bb51fa893ee447dc94b07))
- temporary commit ([eca9661](https://github.com/bugfix2020/AgentILS/commit/eca966150ac16e6c95c3a4ead6b9586b003fdb25))

### Bug Fixes

- **webview:** restore welcome layout ([de3fc86](https://github.com/bugfix2020/AgentILS/commit/de3fc8652c349f43e1640cb0497c8e7f5df33a83))
- **webview:** streaming rendering + messageId accumulation + debounce ([a568ba9](https://github.com/bugfix2020/AgentILS/commit/a568ba96b7732365dfee724f7fb52efab013aa02))
