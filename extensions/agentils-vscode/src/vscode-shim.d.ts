declare module 'vscode' {
  export type Thenable<T> = PromiseLike<T>

  export interface Disposable {
    dispose(): void
  }

  export type Event<T> = (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]) => Disposable

  export interface EventEmitter<T> extends Disposable {
    event: Event<T>
    fire(data: T): void
  }

  export const EventEmitter: {
    new <T>(): EventEmitter<T>
  }

  export class Uri {
    readonly fsPath: string
    static file(path: string): Uri
    static joinPath(base: Uri, ...pathSegments: string[]): Uri
  }

  export interface TextDocument {}
  export interface TextEditor {}

  export interface StatusBarItem extends Disposable {
    text: string
    tooltip?: string | undefined
    command?: string | undefined
    show(): void
    hide(): void
  }

  export const StatusBarAlignment: {
    Left: number
    Right: number
  }

  export const ViewColumn: {
    Active: number
  }

  export interface Webview {
    html: string
    options: {
      enableScripts?: boolean
      localResourceRoots?: Uri[]
      retainContextWhenHidden?: boolean
    }
    onDidReceiveMessage(listener: (message: unknown) => any): Disposable
    postMessage(message: unknown): Thenable<boolean>
  }

  export interface WebviewPanel extends Disposable {
    webview: Webview
    reveal(viewColumn: number): void
    onDidDispose(listener: () => any): Disposable
  }

  export interface Memento {
    get<T>(key: string): T | undefined
    update(key: string, value: unknown): Thenable<void>
  }

  export interface ExtensionContext {
    extensionUri: Uri
    globalStorageUri: Uri
    globalState: Memento
    subscriptions: Disposable[]
  }

  export interface WorkspaceConfiguration {
    get<T>(section: string): T | undefined
  }

  export const workspace: {
    getConfiguration(section: string): WorkspaceConfiguration
    fs: {
      createDirectory(uri: Uri): Thenable<void>
      writeFile(uri: Uri, content: Uint8Array): Thenable<void>
    }
    openTextDocument(uri: Uri): Thenable<TextDocument>
  }

  export const window: {
    createStatusBarItem(alignment: number, priority?: number): StatusBarItem
    createWebviewPanel(
      viewType: string,
      title: string,
      showOptions: number,
      options?: Webview['options'],
    ): WebviewPanel
    showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>
    showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined>
    showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined>
    showInputBox(options?: { title?: string; prompt?: string; ignoreFocusOut?: boolean }): Thenable<string | undefined>
    showQuickPick<T extends string>(
      items: readonly T[],
      options?: { placeHolder?: string },
    ): Thenable<T | undefined>
    showTextDocument(document: TextDocument, options?: { preview?: boolean }): Thenable<TextEditor>
  }

  export const commands: {
    registerCommand(command: string, callback: (...args: any[]) => any): Disposable
    executeCommand<T = unknown>(command: string, ...rest: any[]): Thenable<T>
  }
}
