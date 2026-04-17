# human-clarification-ui-helper vsix 完整调用链路分析

版本：v1.0  
来源：`justwe9517.human-clarification-ui-helper-0.0.3.vsix` 实际拆包分析  
日期：2026-04-15  
用途：为 AgentILS 插件层 prompt 安装功能提供参考，理解 UI Extension 模式下如何跨越"远程-本地"边界访问本地文件系统

---

## 0. 阅读前提示

本文档分析的是 `human-clarification` 插件的**UI Helper 配套扩展**，与主插件（`vsix-human-clarification-complete-chain.md`）功能不同。

**核心价值**：在 VS Code Remote 场景（SSH / Dev Containers / WSL）中，工作区扩展运行在**远程主机**，无法直接访问**本地机器**的文件系统。UI Helper 通过 `extensionKind: ["ui"]` 声明，强制运行在本地 UI 侧，从而充当本地文件系统的代理。

---

## 1. 插件定位与设计边界

```
┌─────────────────────────────────────────────────────┐
│                  远程主机 (Remote Host)              │
│                                                     │
│  human-clarification 主插件（工作区扩展）            │
│    ↓ vscode.commands.executeCommand()               │
│    ↓ [IPC 通道穿越 Remote 边界]                      │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│                  本地机器 (UI Side)                  │
│                                                     │
│  human-clarification-ui-helper（UI 扩展）            │
│    ├── humanClarification.getLocalPrompts            │
│    ├── humanClarification.readLocalFile              │
│    ├── humanClarification.openLocalFile              │
│    └── humanClarification.hcInstall.installFromTemplate│
│                                                     │
│  访问本地 fs（~/Library/Application Support/Code/..）│
└─────────────────────────────────────────────────────┘
```

---

## 2. 激活逻辑：`activate(context)`

**文件**：`src/extension.ts`

```
activate(context)
  ├── 创建 OutputChannel('Human Clarification (UI Helper)')
  ├── 检查 vscode.env.remoteName
  │     └── 若为空（非远程窗口）→ 直接返回，不注册任何命令
  │         理由：避免与本地运行的主插件冲突（两者都注册同名命令时会产生歧义）
  └── 注册 4 个命令（仅在远程窗口中生效）
```

**安全设计**：只有在检测到远程环境时才注册命令，避免在本地窗口中命令冲突（主插件也可能注册同名命令）。

---

## 3. 命令 1：`humanClarification.getLocalPrompts`

**用途**：返回本地机器上所有 `.prompt.md` 文件的列表，供主插件（远程侧）展示和使用。

**输入**：无参数

**执行链路**：
```
executeCommand('humanClarification.getLocalPrompts')
  ├── 确定本地 userData 路径
  │     macOS: ~/Library/Application Support
  │     Windows: %APPDATA%
  │     Linux: ~/.config
  ├── 确定 VS Code 版本文件夹
  │     含 'Insiders' → 'Code - Insiders'
  │     否则 → 'Code'
  ├── 构建 promptsDir = {userDataPath}/{vsCodeFolder}/User/prompts
  ├── 若目录不存在 → 返回 []
  └── 读取目录中所有 .prompt.md 文件
        └── 返回数组 [{ name, fullPath, relativePath, source: 'user' }]
```

**返回格式**：
```typescript
Array<{
  name: string         // 文件名去掉 .prompt.md 后缀
  fullPath: string     // 本地绝对路径，如 /Users/xxx/.../prompts/hc.review.prompt.md
  relativePath: string // 如 ~/prompts/hc.review.prompt.md
  source: 'user'       // 固定值
}>
```

---

## 4. 命令 2：`humanClarification.readLocalFile`

**用途**：读取本地机器上指定路径的文件内容，返回给远程侧主插件。

**输入**：`filePath: string`（本地文件绝对路径）

**执行链路**：
```
executeCommand('humanClarification.readLocalFile', filePath)
  ├── 参数校验：filePath 为空 → 返回 ''
  ├── 文件存在性检查：!existsSync → 返回 ''
  ├── fs.readFileSync(filePath, 'utf8')
  └── 返回文件内容字符串（任意文件，无路径约束）
```

**返回格式**：`string`（文件内容，失败时为 `''`）

⚠️ **注意**：此命令**未做路径限制**，理论上可以读取任意本地文件。与 `installFromTemplate` 的严格校验形成对比。

---

## 5. 命令 3：`humanClarification.openLocalFile`

**用途**：在 VS Code 编辑器（本地侧）打开指定本地文件，可选定位到指定行列范围。

**输入**：
```typescript
filePath: string
selection?: {
  startLine: number     // 1-based
  startColumn?: number  // 1-based，默认 1
  endLine?: number      // 1-based，默认同 startLine
  endColumn?: number    // 1-based，默认行末
}
```

**执行链路**：
```
executeCommand('humanClarification.openLocalFile', filePath, selection?)
  ├── 参数校验：filePath 为空 → 返回
  ├── 文件存在性检查：!existsSync → showWarningMessage + 返回
  ├── vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
  ├── 若 selection 非空，将 1-based 行列转换为 0-based vscode.Range
  │     含边界保护（不超过 doc.lineCount）
  └── vscode.window.showTextDocument(doc, { preview: true, selection: selectionRange })
```

**返回格式**：`void`（副作用：打开编辑器 Tab）

---

## 6. 命令 4：`humanClarification.hcInstall.installFromTemplate`

**用途**：将 prompt 模板文件批量写入本地 VS Code prompts 目录，并合并更新全局设置。主插件的 `/hc install` 命令调用此命令完成安装流程。

**输入**：
```typescript
payload: {
  files: Array<{
    name: string    // 如 'hc.review.prompt.md'
    content: string // 文件内容
  }>
  settings: Record<string, unknown>  // 要写入全局设置的键值对
}
```

**执行链路**：
```
executeCommand('humanClarification.hcInstall.installFromTemplate', payload)
  ├── 确定 promptsDir（同命令 1 的路径解析逻辑）
  ├── fs.mkdirSync(promptsDir, { recursive: true })
  ├── 写入文件（含安全校验）
  │     对每个 file:
  │       ├── 参数完整性校验（name 和 content 必须是 string）
  │       ├── 文件名安全校验 1：path.basename(name) === name（禁止路径穿越）
  │       ├── 文件名安全校验 2：必须以 'hc.' 开头
  │       ├── 文件扩展名校验：只允许 .prompt.md / .chatmode.md / .agent.md
  │       ├── 文件大小校验：Buffer.byteLength(content) ≤ 1MB
  │       ├── 若目标文件已存在 → overwritten++
  │       └── fs.writeFileSync(targetPath, content, 'utf8')
  └── 写入 VS Code 全局设置
        对每个 settings[key]:
          ├── 获取现有值 config.get(key)
          ├── 若新值为数组 → mergeArraysByName（按 name 字段去重合并）
          │     逻辑：具名对象数组（含 { name: string }）按 name 字段合并（覆盖/追加）
          │           非具名对象数组 → 直接 [...existing, ...incoming]
          └── config.update(key, nextValue, ConfigurationTarget.Global)
```

**返回格式**：
```typescript
{
  promptsDir: string     // 安装目录绝对路径
  written: number        // 成功写入的文件数
  overwritten: number    // 覆盖已有文件的数量
  updatedKeys: string[]  // 更新的 settings 键名列表
}
```

**安全防护总结**：

| 校验 | 规则 |
|---|---|
| 路径穿越防护 | `path.basename(fileName) === fileName`（禁止包含 `/` 或 `..`） |
| 命名空间隔离 | 文件必须以 `hc.` 开头（保留 namespace） |
| 扩展名白名单 | 只允许 `.prompt.md`、`.chatmode.md`、`.agent.md` |
| 文件大小限制 | 单文件 ≤ 1MB（防止内存溢出） |
| 设置值合并 | 数组使用 name-based merge（防止重复项），而非直接覆盖 |

---

## 7. mergeArraysByName 逻辑详解

```
mergeArraysByName(existing, incoming):
  IF incoming 不是数组 → 直接返回 incoming（非数组覆盖）
  ELSE
    existingArray = existing 若为数组，否则 []
    IF incoming 的每项都有 { name: string } → 具名合并模式
      byName = Map<name, item>（来自 existingArray）
      result = [...existingArray]
      FOR each nextItem in incoming:
        IF byName 中已存在同名 → 替换 result 中的该项
        ELSE → 追加到 result
      返回 result
    ELSE → 简单合并 [...existingArray, ...incoming]
```

**用途**：例如 `github.copilot.chat.agent.thinkingTools` 这类数组型设置，通过 name 字段来更新具体 tool 配置而不是全量覆盖。

---

## 8. 与主插件的协作关系

**主插件调用路径**（从 `vsix-human-clarification-complete-chain.md` 引用）：

```
主插件（远程侧）的 installFromTemplate()
  └── vscode.commands.executeCommand(
        'humanClarification.hcInstall.installFromTemplate',
        { files, settings }
      )
      [IPC 跨越 Remote 边界]
      └── UI Helper 执行（本地侧）
            └── 将文件写入本地 ~/Library/.../prompts/
            └── 更新本地 settings.json
```

**此分工确保**：
- 远程侧主插件（知道要装什么）决定内容
- 本地侧 UI Helper（有权限写本地文件）决定写到哪

---

## 9. 对 AgentILS 的参考价值

### 9.1 Remote 场景支持模式

若 AgentILS 需要在 Remote 场景（云开发机、Server 版 VS Code）中使用，可参考此 UI / 工作区扩展拆分模式：

| 职责 | 扩展类型 | 运行位置 |
|---|---|---|
| MCP Server 连接、elicitation bridge、状态管理 | workspace extension | 远程主机 |
| 本地 prompt 文件读写、本地文件打开 | ui extension（类似 ui-helper）| 本地机器 |

### 9.2 Prompt 安装集成

AgentILS vscode 插件的 `installPromptPack` 命令（`agentils.installPromptPack`）可参考此实现，结合 UI Helper 模式完成对 VS Code 全局 prompts 目录的写入，而不依赖工作区文件系统访问权限。

### 9.3 安全校验参考

`installFromTemplate` 中的五层安全校验（路径穿越、命名空间、扩展名白名单、大小限制、数组合并策略）是 prompt 安装类功能的最佳实践，AgentILS 的 prompt pack 安装功能应参照实现。

---

## 10. 总结

| 维度 | 内容 |
|---|---|
| 扩展类型 | `extensionKind: ["ui"]`（本地 UI 侧） |
| 激活条件 | 仅在远程窗口中激活（否则直接退出） |
| 注册命令数 | 4 个 |
| 核心能力 | 本地文件系统读写代理（Remote 场景下的跨边界文件访问） |
| 安全级别 | `getLocalPrompts`/`readLocalFile`/`openLocalFile` 无路径限制；`installFromTemplate` 有严格的五层安全校验 |
| 与主插件的关系 | 主插件通过 `executeCommand` IPC 调用，UI Helper 执行本地副作用 |
