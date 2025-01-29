import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIModels } from '../enums/models.enum';
import {
  AIProviderBase,
  AIStreamResponse,
  AIResponse,
  ChatHistory,
} from '../models/ai-wrapper.types';
import OpenAI from 'openai';

@Injectable()
export class LlamaProvider implements AIProviderBase {
  private readonly openai: OpenAI;
  private readonly defaultModel: AIModels;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      baseURL: 'https://api.fireworks.ai/inference/v1',
      apiKey: this.configService.get<string>('LLAMA_API_KEY'),
    });
    this.defaultModel = this.configService.get<AIModels>(
      'DEFAULT_LLAMA_MODEL',
      AIModels.LlamaV3_3_70B,
    );
  }

  async generateContent(
    prompt: string,
    model: AIModels,
    options?: any,
  ): Promise<AIResponse> {
    try {
      const completion = await this.openai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model,
        ...options,
      });

      return {
        content: completion.choices[0].message.content,
        usage: completion.usage
          ? {
              promptTokens: completion.usage.prompt_tokens,
              completionTokens: completion.usage.completion_tokens,
              totalTokens: completion.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      console.log(error);
      throw new Error(`OpenAI failed: ${error.message}`);
    }
  }

  async generateContentStream(
    prompt: string,
    model: AIModels = this.defaultModel,
    options?: any,
  ): Promise<AIStreamResponse> {
    try {
      const stream = (await this.openai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model,
        stream: true,
        ...options,
      })) as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

      return {
        content: this.streamContent(stream),
      };
    } catch (error) {
      throw new Error(`OpenAI stream failed: ${error.message}`);
    }
  }

  private convertHistory(
    history: ChatHistory[],
  ): { role: string; content: string }[] {
    return history.map((entry) => ({
      role: entry.role === 'user' ? 'user' : 'assistant',
      content: entry.message,
    }));
  }

  async generateContentHistory(
    prompt: string,
    history: ChatHistory[],
    model: AIModels = this.defaultModel,
    options?: any,
  ): Promise<AIResponse> {
    try {
      const completion = await this.openai.chat.completions.create({
        messages: [
          ...this.convertHistory(history),
          { role: 'user', content: prompt },
        ],
        model,
        ...options,
      });

      return {
        content: completion.choices[0].message.content,
        usage: completion.usage
          ? {
              promptTokens: completion.usage.prompt_tokens,
              completionTokens: completion.usage.completion_tokens,
              totalTokens: completion.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      console.log(error);
      throw new Error(`Llama generateContentHistory failed: ${error.message}`);
    }
  }

  async generateContentStreamHistory(
    prompt: string,
    history: ChatHistory[],
    model: AIModels = this.defaultModel,
    options?: any,
  ): Promise<AIStreamResponse> {
    try {
      const stream = (await this.openai.chat.completions.create({
        messages: [
          ...this.convertHistory(history),
          { role: 'user', content: prompt },
        ],
        model,
        stream: true,
        ...options,
      })) as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

      return {
        content: this.streamContent(stream),
      };
    } catch (error) {
      throw new Error(
        `Llama generateContentStreamHistory failed: ${error.message}`,
      );
    }
  }

  private async *streamContent(
    stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  ): AsyncIterable<string> {
    for await (const chunk of stream) {
      yield chunk.choices[0]?.delta?.content || '';
      await new Promise((r) => setImmediate(r)); // Flush each chunk immediately
    }
  }
}
