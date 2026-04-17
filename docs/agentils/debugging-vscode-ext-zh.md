# AgentILS VS Code 扩展调试指引

本文档覆盖 AgentILS 的两个 VS Code 扩展的构建和调试流程：
- **agentils-vscode** — 主扩展，提供 Task Console、LM Tools、MCP Elicitation Bridge
- **agentils-ui-helper** — UI 辅助扩展，提供本地 prompt 和文件桥接命令

---

## 1. 前置准备

### 1.1 环境要求

| 依赖 | 最低版本 |
|------|---------|
| VS Code | 1.90.0+ |
| Node.js | 20+ |
| npm | 9+ |

### 1.2 安装依赖

```bash
# 根目录安装（核心 MCP Server 依赖）
npm install

# agentils-vscode 扩展依赖
cd extensions/agentils-vscode && npm install && cd ../..
```

> `agentils-ui-helper` 是纯 JavaScript 扩展，没有额外依赖需要安装。

---

## 2. 项目结构

```
extensions/
├── agentils-vscode/          # 主扩展（TypeScript）
│   ├── package.json          # 扩展清单（commands, languageModelTools）
│   ├── tsconfig.json         # CommonJS 输出，target ES2022
│   ├── src/
│   │   ├── extension.ts      # 激活入口
│   │   ├── commands.ts       # 命令注册
│   │   ├── lm-tools/         # Language Model Tools 注册
│   │   ├── session/          # 会话管理
│   │   ├── interaction-channel/ # 交互通道
│   │   ├── mcp-elicitation-bridge.ts  # MCP 桥接
│   │   ├── task-service-client.ts     # 任务服务客户端
│   │   └── status-surface.ts # 状态栏 UI
│   └── dist/                 # 构建产物
│
└── agentils-ui-helper/       # UI 辅助扩展（纯 JavaScript）
    ├── package.json          # extensionKind: ["ui"]
    └── src/
        ├── extension.js      # 激活入口
        ├── local-prompts.js  # 本地 prompt 读取
        ├── local-files.js    # 本地文件操作
        ├── local-paths.js    # 路径解析
        └── constants.js      # 常量定义
```

---

## 3. 构建扩展

### 3.1 一键构建（推荐）

项目提供了预定义的 VS Code Task，按序构建全部依赖：

1. 按 `Cmd+Shift+P` → "Tasks: Run Task"
2. 选择 **prepare:agentils-extensions**

此任务会依次执行：
1. `build:root` — 构建核心 MCP Server（`npm run build`）
2. `build:agentils-vscode` — 构建 VS Code 主扩展
3. `check:agentils-ui-helper` — 检查 UI Helper 语法

### 3.2 手动构建

```bash
# 1. 构建核心 MCP Server
npm run build

# 2. 构建 agentils-vscode 扩展
cd extensions/agentils-vscode
npm run build
cd ../..

# 3. 检查 agentils-ui-helper（纯 JS，无需编译）
npm run check:ui-helper
```

### 3.3 类型检查

```bash
# 检查 agentils-vscode 扩展的类型
npm run typecheck:vscode-host

# 检查所有表面（vscode-host + ui-helper）
npm run verify:surfaces
```

---

## 4. 调试扩展

### 4.1 使用预配置的 Launch Configuration

项目 `.vscode/launch.json` 已预配置三种调试模式：

#### 调试主扩展

1. 在 VS Code 侧边栏打开 **Run and Debug** 面板（`Cmd+Shift+D`）
2. 选择 **"AgentILS: VS Code Extension"**
3. 按 `F5` 启动

这会：
- 自动执行 `prepare:agentils-extensions` pre-launch task
- 启动 Extension Development Host
- 仅加载 `extensions/agentils-vscode` 扩展
- source map 映射到 `extensions/agentils-vscode/dist/**/*.js`

#### 调试 UI Helper 扩展

1. 选择 **"AgentILS: UI Helper Extension"**
2. 按 `F5` 启动

#### 同时调试两个扩展

1. 选择 **"AgentILS: Both Extensions"**
2. 按 `F5` 启动

这会同时加载 `agentils-vscode` 和 `agentils-ui-helper` 两个扩展。

### 4.2 断点调试

1. **在源码中设置断点**：
   - `extensions/agentils-vscode/src/extension.ts` — 扩展激活流程
   - `extensions/agentils-vscode/src/commands.ts` — 命令处理
   - `extensions/agentils-vscode/src/lm-tools/` — Language Model Tool 调用
   - `extensions/agentils-vscode/src/session/` — 会话管理逻辑
   - `extensions/agentils-vscode/src/mcp-elicitation-bridge.ts` — MCP 桥接

2. **确保 sourceMap 开启**：`extensions/agentils-vscode/tsconfig.json` 中 `"sourceMap": true`

3. **在 Extension Development Host 中触发操作**：
   - `Cmd+Shift+P` → 执行 AgentILS 命令
   - 或在 Copilot Chat 中使用 `#agentils_start_conversation` 等 LM Tool

4. **调试器会在断点处暂停**，你可以查看调用栈、变量值等。

### 4.3 查看扩展输出日志

在 Extension Development Host 中：

1. 打开 Output 面板（`Cmd+Shift+U`）
2. 从下拉菜单选择相关输出通道

也可以在 Developer Tools 中查看 console 输出：
- `Cmd+Shift+P` → "Developer: Toggle Developer Tools"

---

## 5. agentils-vscode 扩展详解

### 5.1 激活流程

```
extension.ts activate()
  ├─ 创建 RepoBackedAgentILSTaskServiceClient
  ├─ 创建 ConversationSessionManager
  ├─ 创建 LocalPanelInteractionChannel（WebView 交互面板）
  ├─ 创建 AgentILSStatusSurface（状态栏）
  ├─ registerAgentILSCommands() — 注册 VS Code 命令
  ├─ registerAgentILSLanguageModelTools() — 注册 LM Tools
  ├─ registerAgentILSPromptPackCommands() — 注册 Prompt Pack 命令
  ├─ 创建 AgentILSMcpElicitationBridge — MCP 桥接
  └─ sessionManager.refresh() — 刷新会话状态
```

### 5.2 MCP Server 路径解析

扩展会自动寻找 MCP Server 入口文件，优先级：
1. `{extensionPath}/../../dist/index.js` — 开发布局（monorepo 同级目录）
2. `{workspaceFolder}/dist/index.js` — 工作区构建产物

> **调试提示**：如果扩展报告 "AgentILS runtime is unavailable"，说明找不到 MCP Server 构建产物。确保先执行 `npm run build`。

### 5.3 注册的命令

| 命令 | 说明 |
|------|------|
| `agentils.openTaskConsole` | 打开 Task Console |
| `agentils.newTask` | 创建新任务 |
| `agentils.continueTask` | 继续当前任务 |
| `agentils.markTaskDone` | 标记任务完成 |
| `agentils.acceptOverride` | 接受 Override |
| `agentils.openSummary` | 打开 Summary |
| `agentils.installPromptPack` | 安装 Prompt Pack |

### 5.4 注册的 Language Model Tools

| 工具 | 说明 |
|------|------|
| `agentils_start_conversation` | 启动新的 AgentILS 任务会话 |
| `agentils_continue_task` | 继续当前任务 |
| `agentils_request_clarification` | 请求用户澄清 |

---

## 6. agentils-ui-helper 扩展详解

### 6.1 特性

- `extensionKind: ["ui"]` — 运行在 UI 侧（本地桌面环境）
- 纯 JavaScript，无需编译
- 提供本地文件系统访问能力

### 6.2 注册的命令

| 命令 | 说明 |
|------|------|
| `agentilsUiHelper.getLocalPrompts` | 读取本地 prompt 文件 |
| `agentilsUiHelper.readLocalFile` | 读取本地文件内容 |
| `agentilsUiHelper.openLocalFile` | 在编辑器中打开本地文件 |
| `agentilsUiHelper.installPromptTemplate` | 安装 prompt 模板 |

### 6.3 配置项

| 配置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `agentilsUiHelper.promptRoots` | `string[]` | `[]` | 自定义 prompt 目录路径 |
| `agentilsUiHelper.defaultPromptName` | `string` | `"agentils-task"` | 安装模板的默认名称 |

---

## 7. 联合调试：MCP Server + VS Code 扩展

当需要同时调试 MCP Server 和 VS Code 扩展时：

### 方式一：HTTP 模式（推荐）

1. **单独启动 MCP Server（HTTP 模式）**：
```bash
node --inspect=9230 dist/index.js --http
```

2. **启动扩展调试**：选择 "AgentILS: Both Extensions" → `F5`

3. **附加到 MCP Server**：VS Code 中新开一个调试会话，使用 "Attach to Node Process" 连接端口 9230

4. 现在可以同时在扩展代码和 MCP Server 代码中设置断点。

### 方式二：stdio 模式

1. **启动扩展调试**：选择 "AgentILS: VS Code Extension" → `F5`
2. 扩展会自动通过 stdio 启动内嵌的 MCP Server 子进程
3. 在扩展侧代码中设置断点即可调试交互逻辑
4. MCP Server 侧的日志输出到 stderr，可在扩展的 Output 通道查看

---

## 8. 常见问题

### Q: Extension Development Host 启动失败

- 确认 `prepare:agentils-extensions` task 执行成功
- 确认 `extensions/agentils-vscode/dist/extension.js` 存在
- 检查 VS Code 版本 >= 1.90.0

### Q: LM Tool 调用无响应

- 确认 MCP Server 已构建（`npm run build`）
- 查看 Extension Development Host 的 Developer Tools Console
- 在 `src/lm-tools/` 和 `src/session/` 中设置断点追踪

### Q: agentils-ui-helper 扩展未加载

- 确认使用了 "AgentILS: Both Extensions" 或 "AgentILS: UI Helper Extension" 启动配置
- 检查 `extensions/agentils-ui-helper/src/extension.js` 语法是否正确：`npm run check:ui-helper`

### Q: WebView 面板不显示

- 在 Extension Development Host 中按 `Cmd+Shift+P` → "AgentILS: Open Task Console"
- 检查 `extension.ts` 中 `LocalPanelInteractionChannel` 的创建是否成功
- 查看 Developer Tools 中的错误信息
