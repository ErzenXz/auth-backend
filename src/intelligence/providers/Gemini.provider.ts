import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleGenAI } from '@google/genai';
import {
  AIProviderBase,
  AIResponse,
  AIStreamResponse,
  ChatHistory,
} from '../models/ai-wrapper.types';
import { AIModels } from '../enums/models.enum';

@Injectable()
export class GoogleProvider implements AIProviderBase {
  private readonly defaultModel: AIModels;
  private readonly googleAPI: GoogleGenAI;

  constructor(private readonly configService: ConfigService) {
    this.defaultModel = this.configService.get<AIModels>(
      'DEFAULT_GOOGLE_MODEL',
      AIModels.GeminiFast,
    );
    this.googleAPI = new GoogleGenAI({
      apiKey: this.configService.get<string>('GEMINI_API_KEY'),
    });
  }

  async generateContent(
    prompt: string,
    model: AIModels = this.defaultModel,
    options?: any,
  ): Promise<AIResponse> {
    try {
      const response = await this.googleAPI.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.5,
          ...options?.generationConfig,
        },
        ...options,
      });

      return {
        content: response.text,
        usage: {
          promptTokens: response.usageMetadata?.promptTokenCount || 0,
          completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: response.usageMetadata?.totalTokenCount || 0,
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
      const response = await this.googleAPI.models.generateContentStream({
        model,
        contents: prompt,
        config: {
          temperature: 0.5,
          ...options?.generationConfig,
        },
        ...options,
      });

      return {
        content: this.streamContent(response),
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
      role: entry.role === 'user' ? 'user' : 'model',
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
      const chat = this.googleAPI.chats.create({
        model,
        history: this.convertHistory(history),
        config: {
          temperature: 0.5,
          ...options?.generationConfig,
        },
        ...options,
      });

      const response = await chat.sendMessage({
        message: prompt,
      });

      return {
        content: response.text,
        usage: {
          promptTokens: response.usageMetadata?.promptTokenCount || 0,
          completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: response.usageMetadata?.totalTokenCount || 0,
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
      const chat = this.googleAPI.chats.create({
        model,
        history: this.convertHistory(history),
        config: {
          temperature: 0.5,
          ...options?.generationConfig,
        },
        ...options,
      });

      const stream = await chat.sendMessageStream({
        message: prompt,
      });

      return {
        content: this.streamContent(stream),
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
    stream: AsyncIterable<any>,
  ): AsyncIterable<string> {
    for await (const chunk of stream) {
      yield chunk.text;
      await new Promise((r) => setImmediate(r)); // Flush each chunk immediately
    }
  }
}
