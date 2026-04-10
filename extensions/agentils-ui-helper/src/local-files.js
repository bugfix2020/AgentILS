import fs from 'node:fs/promises'
import * as vscode from 'vscode'
import { normalizeCommandPath } from './local-paths.js'

export async function readLocalFile(input) {
  const filePath = normalizeCommandPath(input)

  if (!filePath) {
    return {
      read: false,
      reason: 'No file path was provided.',
    }
  }

  const content = await fs.readFile(filePath, 'utf8')
  return {
    read: true,
    filePath,
    size: Buffer.byteLength(content, 'utf8'),
    content,
  }
}

export async function openLocalFile(input) {
  const filePath = normalizeCommandPath(input)

  if (!filePath) {
    return {
      opened: false,
      reason: 'No file path was provided.',
    }
  }

  const position = input?.position ?? {}
  const line = Math.max(1, Number(position.line ?? input?.line ?? 1))
  const column = Math.max(1, Number(position.column ?? input?.column ?? 1))

  const uri = vscode.Uri.file(filePath)
  const document = await vscode.workspace.openTextDocument(uri)
  const editor = await vscode.window.showTextDocument(document, { preview: false })
  const targetLine = Math.min(document.lineCount, line)
  const range = new vscode.Range(
    new vscode.Position(targetLine - 1, column - 1),
    new vscode.Position(targetLine - 1, column - 1),
  )

  editor.revealRange(range, vscode.TextEditorRevealType.InCenter)
  editor.selection = new vscode.Selection(range.start, range.end)

  return {
    opened: true,
    filePath,
    line: targetLine,
    column,
  }
}
