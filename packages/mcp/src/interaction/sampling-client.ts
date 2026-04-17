export interface SamplingRequest {
  prompt: string
  maxTokens?: number
}

export interface SamplingResponse {
  text: string
  model: string
}

export class SamplingClient {
  constructor(private readonly model = 'unconfigured') {}

  async sample(request: SamplingRequest): Promise<SamplingResponse> {
    return {
      text: `Sampling stub: ${request.prompt}`,
      model: this.model,
    }
  }
}
