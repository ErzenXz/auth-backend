import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  AIProviderBase,
  AIStreamResponse,
  AIResponse,
  ChatHistory,
} from '../models/ai-wrapper.types';
import { AIModels } from '../enums/models.enum';

@Injectable()
export class AnthropicProvider implements AIProviderBase {
  private readonly anthropic: Anthropic;
  private readonly defaultModel: AIModels;

  constructor(private readonly configService: ConfigService) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
    });
    this.defaultModel = this.configService.get<AIModels>(
      'DEFAULT_ANTHROPIC_MODEL',
      AIModels.Claude37Sonnet,
    );
  }

  async generateContent(
    prompt: string,
    model: AIModels,
    options?: any,
  ): Promise<AIResponse> {
    try {
      const message = await this.anthropic.messages.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        ...options,
      });

      // Get content text safely by checking content type
      let contentText = '';
      if (
        message.content &&
        message.content.length > 0 &&
        message.content[0].type === 'text'
      ) {
        contentText = message.content[0].text;
      }

      return {
        content: contentText,
        usage: {
          promptTokens: message.usage?.input_tokens || 0,
          completionTokens: message.usage?.output_tokens || 0,
          totalTokens:
            (message.usage?.input_tokens || 0) +
            (message.usage?.output_tokens || 0),
        },
      };
    } catch (error) {
      throw new Error(`Anthropic failed: ${error.message}`);
    }
  }

  async generateContentStream(
    prompt: string,
    model: AIModels = this.defaultModel,
    options?: any,
  ): Promise<AIStreamResponse> {
    try {
      const response = await this.anthropic.messages.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        ...options,
      });

      return {
        content: this.streamContent(response),
      };
    } catch (error) {
      throw new Error(`Anthropic stream failed: ${error.message}`);
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
      const message = await this.anthropic.messages.create({
        model,
        messages: [
          ...this.convertHistory(history),
          { role: 'user', content: prompt },
        ],
        ...options,
      });

      // Get content text safely by checking content type
      let contentText = '';
      if (
        message.content &&
        message.content.length > 0 &&
        message.content[0].type === 'text'
      ) {
        contentText = message.content[0].text;
      }

      return {
        content: contentText,
        usage: {
          promptTokens: message.usage?.input_tokens || 0,
          completionTokens: message.usage?.output_tokens || 0,
          totalTokens:
            (message.usage?.input_tokens || 0) +
            (message.usage?.output_tokens || 0),
        },
      };
    } catch (error) {
      throw new Error(`Anthropic history failed: ${error.message}`);
    }
  }

  async generateContentStreamHistory(
    prompt: string,
    history: ChatHistory[],
    model: AIModels = this.defaultModel,
    options?: any,
  ): Promise<AIStreamResponse> {
    try {
      const response = await this.anthropic.messages.create({
        model,
        messages: [
          ...this.convertHistory(history),
          { role: 'user', content: prompt },
        ],
        stream: true,
        ...options,
      });

      return {
        content: this.streamContent(response),
      };
    } catch (error) {
      throw new Error(`Anthropic stream history failed: ${error.message}`);
    }
  }

  private async *streamContent(stream: any): AsyncIterable<string> {
    try {
      // Cast the stream to AsyncIterable to use for await...of
      const streamIterable = stream as AsyncIterable<any>;

      for await (const chunk of streamIterable) {
        if (chunk.type === 'content_block_delta') {
          if (chunk.delta.type === 'text') {
            yield chunk.delta.text || '';
          }
        } else if (chunk.type === 'content_block_start') {
          if (chunk.content_block.type === 'text') {
            yield chunk.content_block.text || '';
          }
        } else if (
          chunk.type === 'message_delta' &&
          chunk.delta.content_block
        ) {
          if (chunk.delta.content_block.type === 'text') {
            yield chunk.delta.content_block.text || '';
          }
        }
        // Small delay to avoid overwhelming the system
        await new Promise((r) => setTimeout(r, 0));
      }
    } catch (error) {
      console.error('Error in stream processing:', error);
      throw error;
    }
  }
}
