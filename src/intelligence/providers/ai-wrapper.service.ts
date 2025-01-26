import { Injectable, Logger } from '@nestjs/common';
import {
  AIProvider,
  DEFAULT_MODELS,
  AI_PROVIDERS,
  MODEL_PROVIDER_MAPPING,
} from '../ai-wrapper.constants';
import { AIModels } from '../enums/models.enum';
import {
  AIProviderBase,
  AIResponse,
  AIStreamResponse,
  ChatHistory,
} from '../models/ai-wrapper.types';
import { GoogleProvider } from './Gemini.provider';
import { OpenAiProvider } from './OpenAI.provider';
import { DeepseekProvider } from './Deepseek.provider';
import { LlamaProvider } from './Llama.provider';

@Injectable()
export class AiWrapperService {
  private readonly logger = new Logger(AiWrapperService.name);
  private readonly providers: Map<AIProvider, AIProviderBase>;
  private readonly defaultModels: typeof DEFAULT_MODELS;

  constructor(
    private readonly googleProvider: GoogleProvider,
    private readonly openAiProvider: OpenAiProvider,
    private readonly deepseekProvider: DeepseekProvider,
    private readonly llamaProvider: LlamaProvider,
  ) {
    this.providers = new Map<AIProvider, AIProviderBase>([
      [AI_PROVIDERS.GOOGLE, this.googleProvider],
      [AI_PROVIDERS.OPENAI, this.openAiProvider],
      [AI_PROVIDERS.DEEPSEEK, this.deepseekProvider],
      [AI_PROVIDERS.LLAMA, this.llamaProvider],
    ]);
    this.defaultModels = DEFAULT_MODELS;
  }

  getProviderForModel(model: AIModels): AIProviderBase {
    const providerKey = MODEL_PROVIDER_MAPPING[model];
    const provider = this.providers.get(providerKey);

    if (!provider) {
      this.logger.error(`No provider found for model ${model}`);
      throw new Error(`AI provider not available for model: ${model}`);
    }

    return provider;
  }

  async generateContent(
    model: AIModels,
    prompt: string,
    options?: any,
  ): Promise<AIResponse> {
    const provider = this.getProviderForModel(model);
    const response = await provider.generateContent(prompt, model, options);
    return response;
  }

  async generateContentStream(
    model: AIModels,
    prompt: string,
    options?: any,
  ): Promise<AIStreamResponse> {
    const provider = this.getProviderForModel(model);

    if (!provider.generateContentStream) {
      this.logger.warn(
        `Streaming not supported for ${model}, falling back to normal`,
      );
      const response = await provider.generateContent(prompt, model, options);
      return {
        content: (async function* () {
          yield response.content;
        })(),
        usage: response.usage,
      };
    }

    return provider.generateContentStream(prompt, model, options);
  }

  async generateContentHistory(
    model: AIModels,
    prompt: string,
    history: ChatHistory[],
    options?: any,
  ): Promise<AIResponse> {
    const provider = this.getProviderForModel(model);
    const response = await provider.generateContentHistory(
      prompt,
      history,
      model,
      options,
    );
    return response;
  }

  async generateContentStreamHistory(
    model: AIModels,
    prompt: string,
    history: ChatHistory[],
    options?: any,
  ): Promise<AIStreamResponse> {
    const provider = this.getProviderForModel(model);

    if (!provider.generateContentStreamHistory) {
      this.logger.warn(
        `Streaming not supported for ${model}, falling back to normal`,
      );
      const response = await provider.generateContentHistory(
        prompt,
        history,
        model,
        options,
      );
      return {
        content: (async function* () {
          yield response.content;
        })(),
        usage: response.usage,
      };
    }

    return provider.generateContentStreamHistory(
      prompt,
      history,
      model,
      options,
    );
  }

  getDefaultModel(provider?: AIProvider): AIModels {
    if (provider) return this.defaultModels[provider];
    return this.defaultModels[AI_PROVIDERS.GOOGLE];
  }
}
