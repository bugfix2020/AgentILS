# AgentILS — 用户视角手动 Walkthrough（本地未发布版）

> 目的：让你以"未来真实用户"的视角手动跑通整个产品链路。
> **F5 之后一切就绪，你只需在 Copilot Chat 里发起一个 task。**
>
> 全部命令在 **Windows PowerShell** 下运行。

---

## 0. 一次性环境准备

```powershell
Set-Location C:\Users\Administrator\Desktop\Lenovo\AgentILS

# 你需要：node ≥ 20、pnpm ≥ 9、VS Code Stable
node -v; pnpm -v; code -v

# 装依赖（首次约 1–3 分钟）
pnpm install
```

> ⚠️ 第一次按 F5 之前**不需要手动 build**：[.vscode/launch.json](.vscode/launch.json) 的
> `preLaunchTask: prepare:agentils-extensions` 会自动按顺序跑
> `build:mcp → build:cli → build:webview → build:agentils-vscode → ensure:debug-workspace`，
> 最后那一步会运行 [scripts/prepare-debug-workspace.cjs](scripts/prepare-debug-workspace.cjs) 把
> [apps/vscode-debug](apps/vscode-debug) 预填充为一个**完全可用的 demo workspace**：
>
> - `.github/prompts/*.prompt.md` + `.github/agents/*.agent.md` 全部模板
> - `.vscode/mcp.json` 指向**本地** node + `packages/mcp/dist/index.js --stdio`
>   （绕过 `npx -y @agentils/mcp` 在 npm 上还没发布的问题）
> - `WELCOME.md` 说明 F5 之后该敲什么

---

## 1. F5 → 一切就绪

1. 在仓库根用 VS Code 打开（**主窗口**）：
    ```powershell
    code .
    ```
2. Run & Debug → 选 `AgentILS: VS Code Extension` → 按 **F5**。
3. 等 `prepare:agentils-extensions` 任务跑完（首次约 5–10 秒），弹出第二个窗口
   `[Extension Development Host] apps/vscode-debug`。
4. 这就完事了。下面的"已就绪"项 **不需要你做任何事**：

| 已就绪                            | 怎么验证                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 扩展已激活                        | `View → Output → AgentILS` 频道可见 `extension activate done`                                                 |
| MCP HTTP bridge 在 8788           | 同频道可见 `MCP HTTP bridge ready {"baseUrl":"http://127.0.0.1:8788"}`                                        |
| 4 个 LM 工具已注册                | 同频道可见 `registering 4 LM tools`；Copilot Chat `#` 自动补全有 4 个 `request_*`                             |
| `.vscode/mcp.json` 指向本地 stdio | 打开 `apps/vscode-debug/.vscode/mcp.json`，`command` 是 `node`，`args[0]` 是仓库 `packages/mcp/dist/index.js` |
| 模板 prompts/agents 全到位        | 资源管理器看到 `apps/vscode-debug/.github/prompts/agentils.runTask.prompt.md`                                 |
| 看到 `WELCOME.md`                 | 编辑器自动显示，告诉你下一步                                                                                  |

---

## 2. 在 Extension Development Host 里跑一个 task（你唯一要做的事）

打开 Copilot Chat（左侧栏），二选一：

**A. 用 prompt：** 在输入框敲 `/`，下拉里选 `agentils.runTask`，让它带你走完一个示例任务。

**B. 直接调工具：**

```
#tool:agentils.agentils-vscode/agentilsRequestUserClarification

请帮我确认下: 你最喜欢的颜色?
```

**期望**（这是 e2e 测试 [debug.test.cjs](apps/e2e-userflow/test/vscode-test/suite/debug.test.cjs) 第 7 个用例已经验证过的）：

- 工具调用一发出，**AgentILS webview 自动从右侧弹开**（在 LLM 真正阻塞之前就开），里面显示 "你最喜欢的颜色?"。
- 你在 webview 输入框打字 + 提交。
- Copilot Chat 立刻收到你提交的文本，作为工具结果继续后续推理。

也可以试 cancel：webview 上点 **Cancel** —— 工具返回结构化取消标记 `{"cancelled":true,"code":"cancelled"}`，LLM 知道用户终止了请求。

---

## 3. 一键自动化复现（不开 GUI 也能验证 F5 体验）

下面这条等价于"按 F5 + 在 Chat 里跑一个工具"：

```powershell
Set-Location C:\Users\Administrator\Desktop\Lenovo\AgentILS\apps\e2e-userflow
npx tsx test\vscode-test\runTestDebug.ts
```

期望末尾：

```
7 passing (~800ms)
```

7 个用例对应：

1. workspaceFolders == apps/vscode-debug
2. extension exports baseUrl + 4 toolNames
3. **真 invokeTool round-trip**（Copilot Chat 等价路径）
4. findFiles 看到所有 prompt 模板
5. **mcp.json = 本地 stdio**（不是 unpublished npx）
6. WELCOME.md 存在
7. **invoke 时 webview 自动弹**（ring-buffer 日志验证）

---

## 4. 全 37 个端到端测试一键跑

```powershell
Set-Location C:\Users\Administrator\Desktop\Lenovo\AgentILS

# (a) mcp 包 vsix-parity 9
pnpm --filter @agentils/mcp test

# (b) 用户流 #1 至 #5 共 6
Set-Location apps\e2e-userflow
npx tsx --test test\01-cli-init.test.ts test\02-mcp-roundtrip.test.ts test\03-stdio-mcp.test.ts test\04-lm-toolcall.test.ts test\05-cancel-timeout.test.ts

# (c) 真扩展 host default suite 10
npx tsx test\vscode-test\runTest.ts

# (d) 真扩展 host CLI-init workspace 5
npx tsx test\vscode-test\runTestWorkspace.ts

# (e) 真扩展 host F5 readiness 7（本节）
npx tsx test\vscode-test\runTestDebug.ts
```

**合计 9 + 6 + 10 + 5 + 7 = 37**，全绿即代表完整链路无回归。

> ⚠️ 第一次跑 (c)/(d)/(e) 会下载 VS Code stable 到 `apps\e2e-userflow\.vscode-test\`（约 120MB），下完缓存。

---

## 5. 反馈

如果第 1 节有任何一项"已就绪"在你机器上没自动达成，告诉我对应行号，我立即定位修复。
