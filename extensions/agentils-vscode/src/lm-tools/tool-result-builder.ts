import * as vscode from 'vscode'

export function buildJsonToolResult(payload: unknown) {
  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2)),
  ])
}
