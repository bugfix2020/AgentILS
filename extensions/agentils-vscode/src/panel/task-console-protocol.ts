export type TaskConsoleComposerMode = 'newTask' | 'continueTask' | 'markTaskDone' | 'acceptOverride'

export type TaskConsoleMessage =
  | { action?: 'newTask' | 'continueTask' | 'markTaskDone' | 'acceptOverride' | 'openSummary' }
  | { action: 'submitNewTask'; title?: string; goal?: string }
  | { action: 'submitContinueTask'; note?: string }
  | { action: 'submitMarkTaskDone'; summary?: string }
  | { action: 'submitAcceptOverride'; acknowledgement?: string }
  | {
      action: 'submitPendingInteraction'
      requestId: string
      content?: string
      status?: string
      responseAction?: string
      message?: string
    }
  | { action: 'cancelPendingInteraction'; requestId: string }
  | { action: 'submitApprovalConfirm'; requestId: string }
  | { action: 'submitApprovalDecline'; requestId: string; reason?: string }

// ---------------------------------------------------------------------------
// Control-mode panel state (Change B)
// Added to the panel protocol so the renderer can display colored mode badges.
// ---------------------------------------------------------------------------

export type PanelControlMode = 'normal' | 'alternate' | 'direct'

export interface PanelControlModeState {
  controlMode: PanelControlMode
  overrideActive: boolean
}

// ---------------------------------------------------------------------------
// Approval interaction payload (Change C)
// Describes the data used when rendering the approval form in the WebView.
// The form collects: responseAction (accept/cancel/decline), status, msg.
// ---------------------------------------------------------------------------

export interface PanelApprovalInteractionInfo {
  kind: 'approval'
  requestId: string
  summary: string
  riskLevel: 'low' | 'medium' | 'high'
  targets: string[]
  risks?: string[]
  controlMode?: 'normal' | 'alternate' | 'direct'
}

// ---------------------------------------------------------------------------
// Feedback interaction payload (Change D)
// Describes the data used when rendering the feedback_gate form in the WebView.
// The form collects: status (continue/done/revise), msg.
// ---------------------------------------------------------------------------

export interface PanelFeedbackInteractionInfo {
  kind: 'feedback'
  requestId: string
  summary: string
}
