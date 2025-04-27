import { AIModels } from '../enums/models.enum';

export interface AIResponse {
  content: string;
  thinking?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIStreamResponse {
  content: AsyncIterable<string>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ChatHistory {
  role: string;
  message: string;
}

export interface AIProviderBase {
  generateContent(
    prompt: string,
    model: AIModels,
    options?: any,
  ): Promise<AIResponse>;
  generateContentStream?(
    prompt: string,
    model: AIModels,
    options?: any,
  ): Promise<AIStreamResponse>;
  generateContentHistory?(
    prompt: string,
    history: ChatHistory[],
    model: AIModels,
    options?: any,
  ): Promise<AIResponse>;
  generateContentStreamHistory?(
    prompt: string,
    history: ChatHistory[],
    model: AIModels,
    options?:
      | any
      | {
          systemPrompt?: string;
        },
  ): Promise<AIStreamResponse>;
}
