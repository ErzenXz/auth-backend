import { AIModels } from './enums/models.enum';

export const AI_PROVIDERS = {
  GOOGLE: 'GOOGLE',
  OPENAI: 'OPENAI',
  DEEPSEEK: 'DEEPSEEK',
} as const;

export type AIProvider = keyof typeof AI_PROVIDERS;

export const MODEL_PROVIDER_MAPPING: Record<AIModels, AIProvider> = {
  // Gemini Models
  [AIModels.Gemini]: AI_PROVIDERS.GOOGLE,
  [AIModels.GeminiFast]: AI_PROVIDERS.GOOGLE,
  [AIModels.GeminiFastCheap]: AI_PROVIDERS.GOOGLE,
  [AIModels.GeminiBetter]: AI_PROVIDERS.GOOGLE,
  [AIModels.GeminiAdvanced]: AI_PROVIDERS.GOOGLE,

  // OpenAI Models
  [AIModels.GPT35Turbo]: AI_PROVIDERS.OPENAI,
  [AIModels.GPT4OMini]: AI_PROVIDERS.OPENAI,
  [AIModels.GTP40]: AI_PROVIDERS.OPENAI,
  [AIModels.GPTO1]: AI_PROVIDERS.OPENAI,
  [AIModels.GPTO1Mini]: AI_PROVIDERS.OPENAI,

  // Deepseek Models
  [AIModels.DeepseekV3]: AI_PROVIDERS.DEEPSEEK,
  [AIModels.DeepseekR1]: AI_PROVIDERS.DEEPSEEK,
};

export const DEFAULT_MODELS: Record<AIProvider, AIModels> = {
  [AI_PROVIDERS.GOOGLE]: AIModels.GeminiFast,
  [AI_PROVIDERS.OPENAI]: AIModels.GPT35Turbo,
  [AI_PROVIDERS.DEEPSEEK]: AIModels.DeepseekV3,
};
