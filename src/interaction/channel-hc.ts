export interface HumanClarificationMessage {
  runId: string
  question: string
  context?: string
}

export class HumanClarificationChannel {
  request(message: HumanClarificationMessage): HumanClarificationMessage {
    return message
  }
}
