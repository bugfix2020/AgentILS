import type { HostToWebviewMessage, SubmitInteractionResultPayload, WebviewToHostMessage } from './protocol'

declare global {
    interface Window {
        acquireVsCodeApi?: () => { postMessage: (message: WebviewToHostMessage) => void }
    }
}

export interface WebviewProtocolBridge {
    onMessage(handler: (message: HostToWebviewMessage) => void): () => void
    ready(): void
    rendered(version: number): void
    submitInteractionResult(payload: SubmitInteractionResultPayload): void
    cancelInteraction(interactionId: string): void
    heartbeat(interactionId: string): void
    requestPromptFiles(query?: string): void
    requestTools(query?: string): void
    readWorkspaceFile(path: string, range?: { start: number; end: number }): void
    clientError(error: Error): void
}

export function createProtocolBridge(): WebviewProtocolBridge {
    const vscode = window.acquireVsCodeApi?.()
    const post = (message: WebviewToHostMessage): void => {
        if (vscode) {
            vscode.postMessage(message)
            return
        }
        window.parent?.postMessage(message, '*')
    }

    return {
        onMessage(handler) {
            const listener = (event: MessageEvent<HostToWebviewMessage>) => handler(event.data)
            window.addEventListener('message', listener)
            return () => window.removeEventListener('message', listener)
        },
        ready: () => post({ type: 'ready' }),
        rendered: (version) => post({ type: 'rendered', payload: { version } }),
        submitInteractionResult: (payload) => post({ type: 'submit_interaction_result', payload }),
        cancelInteraction: (interactionId) => post({ type: 'cancel_interaction', payload: { interactionId } }),
        heartbeat: (interactionId) => post({ type: 'heartbeat', payload: { interactionId } }),
        requestPromptFiles: (query) => post({ type: 'request_prompt_files', payload: { query } }),
        requestTools: (query) => post({ type: 'request_tools', payload: { query } }),
        readWorkspaceFile: (path, range) => post({ type: 'read_workspace_file', payload: { path, range } }),
        clientError: (error) =>
            post({
                type: 'client_error',
                payload: { message: error.message, stack: error.stack },
            }),
    }
}
