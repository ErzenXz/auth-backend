import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DynamicRetrievalMode,
  GoogleGenerativeAI,
} from '@google/generative-ai';
import {
  AIProviderBase,
  AIResponse,
  AIStreamResponse,
  ChatHistory,
} from '../models/ai-wrapper.types';
import { AIModels } from '../enums/models.enum';

@Injectable()
export class GoogleProvider implements AIProviderBase {
  private readonly genAI: GoogleGenerativeAI;
  private readonly defaultModel: AIModels;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GOOGLE_API_KEY');
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.defaultModel = this.configService.get<AIModels>(
      'DEFAULT_GOOGLE_MODEL',
      AIModels.GeminiFast,
    );
  }

  async generateContent(
    prompt: string,
    model: AIModels = this.defaultModel,
    options?: any,
  ): Promise<AIResponse> {
    try {
      const generativeModel = this.genAI.getGenerativeModel({
        model,
        tools: [
          {
            googleSearchRetrieval: {
              dynamicRetrievalConfig: {
                mode: DynamicRetrievalMode.MODE_DYNAMIC,
                dynamicThreshold: 0.7,
              },
            },
          },
        ],
        ...options,
      });
      const result = await generativeModel.generateContent(prompt);
      const text = result.response.text();

      return {
        content: text,
        usage: {
          promptTokens: result.response.usageMetadata?.promptTokenCount || 0,
          completionTokens:
            result.response.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: result.response.usageMetadata?.totalTokenCount || 0,
        },
      };
    } catch (error) {
      console.log(error);
      throw new Error(`Google AI failed: ${error.message}`);
    }
  }

  async generateContentStream(
    prompt: string,
    model: AIModels = this.defaultModel,
    options?: any,
  ): Promise<AIStreamResponse> {
    try {
      const generativeModel = this.genAI.getGenerativeModel({
        model,
        tools: [
          {
            googleSearchRetrieval: {
              dynamicRetrievalConfig: {
                mode: DynamicRetrievalMode.MODE_DYNAMIC,
                dynamicThreshold: 0.7,
              },
            },
          },
        ],
        ...options,
      });
      const result = await generativeModel.generateContentStream(prompt);

      return {
        content: this.streamContent(result.stream),
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      };
    } catch (error) {
      throw new Error(`Google AI stream failed: ${error.message}`);
    }
  }

  private convertHistory(history: ChatHistory[]): Array<{
    role: string;
    parts: { text: string }[];
  }> {
    return history.map((entry) => ({
      role: entry.role,
      parts: [{ text: entry.message }],
    }));
  }

  async generateContentHistory(
    prompt: string,
    history: ChatHistory[],
    model: AIModels = this.defaultModel,
    options?: any,
  ): Promise<AIResponse> {
    try {
      const generativeModel = this.genAI.getGenerativeModel({
        model,
        tools: [
          {
            googleSearchRetrieval: {
              dynamicRetrievalConfig: {
                mode: DynamicRetrievalMode.MODE_DYNAMIC,
                dynamicThreshold: 0.7,
              },
            },
          },
        ],
        ...options,
      });

      const chat = generativeModel.startChat({
        history: this.convertHistory(history),
      });

      const result = await chat.sendMessage(prompt);
      const text = result.response.text();

      return {
        content: text,
        usage: {
          promptTokens: result.response.usageMetadata?.promptTokenCount || 0,
          completionTokens:
            result.response.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: result.response.usageMetadata?.totalTokenCount || 0,
        },
      };
    } catch (error) {
      console.log(error);
      throw new Error(`Google AI history failed: ${error.message}`);
    }
  }

  async generateContentStreamHistory(
    prompt: string,
    history: ChatHistory[],
    model: AIModels = this.defaultModel,
    options?: any,
  ): Promise<AIStreamResponse> {
    try {
      const generativeModel = this.genAI.getGenerativeModel({
        model,
        tools: [
          {
            googleSearchRetrieval: {
              dynamicRetrievalConfig: {
                mode: DynamicRetrievalMode.MODE_DYNAMIC,
                dynamicThreshold: 0.7,
              },
            },
          },
        ],
        ...options,
      });

      const chat = generativeModel.startChat({
        history: this.convertHistory(history),
      });

      const result = await chat.sendMessageStream(prompt);

      return {
        content: this.streamContent(result.stream),
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      };
    } catch (error) {
      throw new Error(`Google AI stream history failed: ${error.message}`);
    }
  }
  private async *streamContent(
    stream: AsyncGenerator<any>,
  ): AsyncIterable<string> {
    for await (const chunk of stream) {
      yield chunk.text();
    }
  }
}
