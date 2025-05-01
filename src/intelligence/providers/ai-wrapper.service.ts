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
import { OpenRouterProvider } from './OpenRouter.provider';
import { LlamaProvider } from './Llama.provider';
import { GroqProvider } from './Groq.provider';
import { AnthropicProvider } from './Anthropic.provider';
import { PostHogService } from 'src/services/posthog.service';

@Injectable()
export class AiWrapperService {
  private readonly logger = new Logger(AiWrapperService.name);
  private readonly providers: Map<AIProvider, AIProviderBase>;
  private readonly defaultModels: typeof DEFAULT_MODELS;

  constructor(
    private readonly googleProvider: GoogleProvider,
    private readonly openAiProvider: OpenAiProvider,
    private readonly openrouterProvider: OpenRouterProvider,
    private readonly llamaProvider: LlamaProvider,
    private readonly groqProvider: GroqProvider,
    private readonly anthropicProvider: AnthropicProvider,
    private readonly postHogService?: PostHogService,
  ) {
    this.providers = new Map<AIProvider, AIProviderBase>([
      [AI_PROVIDERS.GOOGLE, this.googleProvider],
      [AI_PROVIDERS.OPENAI, this.openAiProvider],
      [AI_PROVIDERS.OPENROUTER, this.openrouterProvider],
      [AI_PROVIDERS.LLAMA, this.llamaProvider],
      [AI_PROVIDERS.GROQ, this.groqProvider],
      [AI_PROVIDERS.ANTHROPIC, this.anthropicProvider],
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
    this.postHogService.captureEvent('ai_generate_content', model, {
      totalTokens: response.usage.totalTokens,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      model: model,
      provider: provider.constructor.name,
    });
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
    this.postHogService.captureEvent('ai_generate_content_stream', model, {
      model: model,
      provider: provider.constructor.name,
    });
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
    systemPrompt?: string,
    options?: any,
  ): Promise<AIStreamResponse> {
    const provider = this.getProviderForModel(model);
    let enhancedOptions = options || {};

    // Process options to include systemPrompt if provided
    // Special handling for providers that don't support systemPrompt
    const providerName = provider.constructor.name;
    if (systemPrompt) {
      if (providerName === 'GroqProvider') {
        // For Groq, modify the prompt to include the system prompt at the beginning
        // since they don't support system messages directly
        prompt = `${systemPrompt}\n\n${prompt}`;
      } else {
        // For other providers, add it to options
        enhancedOptions = { ...enhancedOptions, systemPrompt };
      }
    }

    if (!provider.generateContentStreamHistory) {
      this.logger.warn(
        `Streaming not supported for ${model}, falling back to normal`,
      );
      const response = await provider.generateContentHistory(
        prompt,
        history,
        model,
        enhancedOptions,
      );
      return {
        content: (async function* () {
          yield response.content;
        })(),
        usage: response.usage,
      };
    }

    this.postHogService.captureEvent(
      'ai_generate_content_stream_history',
      model,
      {
        model: model,
        provider: provider.constructor.name,
      },
    );

    return provider.generateContentStreamHistory(
      prompt,
      history,
      model,
      enhancedOptions,
    );
  }

  /**
   * Generate content with function calling capabilities
   * This is a temporary implementation that simulates function calling
   * by extracting function calls from the AI response text
   */
  async generateFunctionCallingContent(
    model: AIModels,
    prompt: string,
    history: ChatHistory[],
    functions: Record<string, Function>,
    options?: any,
  ): Promise<AIResponse & { functionCalls: any[] }> {
    // Generate content with the regular method
    const response = await this.generateContentHistory(
      model,
      prompt,
      history,
      options,
    );

    try {
      // Parse function calls from response
      const functionCalls = this.extractFunctionCalls(
        response.content,
        functions,
      );

      // Execute function calls
      const executedFunctionCalls = await this.executeFunctionCalls(
        functionCalls,
        functions,
      );

      // Return enhanced response with function calls
      return {
        ...response,
        functionCalls: executedFunctionCalls,
      };
    } catch (error) {
      this.logger.error('Error processing function calls:', error);
      return {
        ...response,
        functionCalls: [],
      };
    }
  }

  /**
   * Extract function calls from the AI response text
   * Looks for patterns like:
   * 1. "I'll use the function function_name(param1, param2)"
   * 2. "function_name(param1, param2)" in the text
   * 3. "```tool_code\nfunction_name\n```" in markdown blocks
   * 4. Function descriptions with "File: filename.ext" patterns
   */
  private extractFunctionCalls(
    content: string,
    functions: Record<string, Function>,
  ): any[] {
    const functionCalls: any[] = [];
    const functionNames = Object.keys(functions);

    // Check for tool_code patterns first (markdown-style tool invocations)
    const toolCodeRegex =
      /```tool_code\s*\n([a-zA-Z_]+)\s*\n```\s*\n\*\*File:\s*([^*]+)\*\*\s*\n```([a-z]+)\s*\n([\s\S]+?)\n```/g;
    const toolMatches = [...content.matchAll(toolCodeRegex)];

    if (toolMatches.length > 0) {
      for (const match of toolMatches) {
        const [_, functionName, filePath, fileType, fileContent] = match;

        // Check if this function exists
        if (
          functionNames.includes('edit_file') &&
          functionName === 'edit_file'
        ) {
          functionCalls.push({
            name: 'edit_file',
            parameters: [filePath.trim(), fileContent],
          });
        } else if (functionNames.includes(functionName)) {
          functionCalls.push({
            name: functionName,
            parameters: [filePath.trim(), fileContent],
          });
        }
      }
    }

    // Look for other simpler patterns like ```\nfunction_name\n```
    const simpleToolRegex = /```\s*\n([a-zA-Z_]+)\s*\n```/g;
    const simpleMatches = [...content.matchAll(simpleToolRegex)];

    for (const match of simpleMatches) {
      const [_, functionName] = match;
      if (functionNames.includes(functionName)) {
        functionCalls.push({
          name: functionName,
          parameters: [],
        });
      }
    }

    // Match traditional function calls in text: functionName(param1, param2, ...)
    for (const functionName of functionNames) {
      const regex = new RegExp(`${functionName}\\s*\\(([^)]*)\\)`, 'g');
      const matches = content.matchAll(regex);

      for (const match of matches) {
        if (match[1]) {
          // Parse parameters
          const paramsString = match[1];
          const params = this.parseParameters(paramsString);

          functionCalls.push({
            name: functionName,
            parameters: params,
          });
        }
      }
    }

    return functionCalls;
  }

  /**
   * Parse parameters from a string like "param1, param2, ..."
   */
  private parseParameters(paramsString: string): any[] {
    if (!paramsString.trim()) return [];

    // Split by commas, but respect quotes and nested structures
    const paramList = paramsString.split(',').map((p) => p.trim());

    return paramList.map((param) => {
      // Try to parse as JSON if it looks like a complex value
      if (
        param.startsWith('{') ||
        param.startsWith('[') ||
        param.startsWith('"') ||
        param.startsWith("'") ||
        ['true', 'false', 'null'].includes(param.toLowerCase()) ||
        !isNaN(Number(param))
      ) {
        try {
          return JSON.parse(param);
        } catch {
          // If parsing fails, return as string
          return param;
        }
      }
      return param;
    });
  }

  /**
   * Execute the extracted function calls
   */
  private async executeFunctionCalls(
    functionCalls: any[],
    functions: Record<string, Function>,
  ): Promise<any[]> {
    const results = [];

    for (const call of functionCalls) {
      const { name, parameters } = call;
      if (functions[name]) {
        try {
          const result = await functions[name](...parameters);
          results.push({
            name,
            parameters,
            result,
          });
        } catch (error) {
          this.logger.error(`Error executing function ${name}:`, error);
          results.push({
            name,
            parameters,
            error: String(error),
          });
        }
      }
    }

    return results;
  }

  getDefaultModel(provider?: AIProvider): AIModels {
    if (provider) return this.defaultModels[provider];
    return this.defaultModels[AI_PROVIDERS.GOOGLE];
  }
}
