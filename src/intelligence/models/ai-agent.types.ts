export interface AgentResponse {
  content: string;
  tokenUsage?: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
