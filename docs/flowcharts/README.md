# AgentILS 流程图集合

> 用 Mermaid 静态图描绘 V1 / Plan C 的关键链路。
> 想看更精美的章节图（含 SVG）请到 [docs/agentils/flowcharts/](../../docs/agentils/flowcharts) 查阅 ch2/ch3/ch4 章节图（来自 `scripts/flowcharts/` 生成）。

## 索引

| 图 | 范畴 | 文件 |
|----|------|------|
| 1 | Plan C 部署拓扑 | [01-plan-c-topology.md](01-plan-c-topology.md) |
| 2 | V1 任务状态机（`collect → ... → summarize`） | [02-v1-task-loop.md](02-v1-task-loop.md) |
| 3 | `run_task_loop` 决策树（`next.action`） | [03-run-task-loop-decision.md](03-run-task-loop-decision.md) |
| 4 | HTTP MCP 启动 + lock 协调 | [04-http-lock-startup.md](04-http-lock-startup.md) |
| 5 | ResourceNotifier per-client 推送 | [05-resource-notifier.md](05-resource-notifier.md) |
| 6 | VS Code 扩展激活流程 | [06-vscode-activation.md](06-vscode-activation.md) |
| 7 | 三种执行法则切换 | [07-control-modes.md](07-control-modes.md) |

## 怎么看 Mermaid

每个 `.md` 内的 Mermaid 图块在 GitHub、VS Code（带预览）、大多数 Markdown viewer 里都直接渲染。
若需要 SVG/PNG 导出，可用 `mermaid-cli`：

```bash
pnpm dlx @mermaid-js/mermaid-cli -i docs/flowcharts/02-v1-task-loop.md -o /tmp/v1-task-loop.svg
```

## 与 docs/agentils/flowcharts/ 的关系

- `docs/agentils/flowcharts/`（章节图）：来自 `scripts/flowcharts/` 节点脚本生成的 HTML/SVG/PNG，覆盖论文章节的固定流程图（ch2 状态映射、ch3 控制模式、ch4 任务流程组合）
- `docs/flowcharts/`（本目录）：以 Markdown + 内联 Mermaid 描述**实现**层面的关键链路，便于贡献者直接在 IDE 里阅读和修改

如果你需要新章节图，编辑 `scripts/flowcharts/ch*` 下的脚本；如果你需要更新本目录的图，直接编辑对应 `.md`。
