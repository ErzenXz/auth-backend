import { AIModels } from './enums/models.enum';

export type ReasoningStepType =
  | 'PROBLEM_DECOMPOSITION'
  | 'CONTEXTUAL_ANALYSIS'
  | 'ARCHITECTURE_BRAINSTORM'
  | 'CODE_STRUCTURE_ITERATION'
  | 'EDGE_CASE_SIMULATION'
  | 'IMPLEMENTATION_STRATEGY'
  | 'API_DESIGN_REVIEW'
  | 'USER_EXPERIENCE_FLOW'
  | 'ERROR_HANDLING_PLAN'
  | 'PERFORMANCE_OPTIMIZATION'
  | 'FINAL_SYNTHESIS';

export const STEP_ORDER: ReasoningStepType[] = [
  'PROBLEM_DECOMPOSITION',
  'CONTEXTUAL_ANALYSIS',
  'ARCHITECTURE_BRAINSTORM',
  'CODE_STRUCTURE_ITERATION',
  'EDGE_CASE_SIMULATION',
  'IMPLEMENTATION_STRATEGY',
  'API_DESIGN_REVIEW',
  'USER_EXPERIENCE_FLOW',
  'ERROR_HANDLING_PLAN',
  'PERFORMANCE_OPTIMIZATION',
  'FINAL_SYNTHESIS',
];

export const AI_PROVIDERS = {
  GOOGLE: 'GOOGLE',
  OPENAI: 'OPENAI',
  OPENROUTER: 'OPENROUTER',
  LLAMA: 'LLAMA',
} as const;

export type AIProvider = keyof typeof AI_PROVIDERS;

export const MODEL_PROVIDER_MAPPING: Record<AIModels, AIProvider> = {
  // Gemini Models
  [AIModels.Gemini]: AI_PROVIDERS.GOOGLE,
  [AIModels.GeminiFast]: AI_PROVIDERS.GOOGLE,
  [AIModels.GeminiFastCheap]: AI_PROVIDERS.GOOGLE,
  [AIModels.GeminiFastCheapSmall]: AI_PROVIDERS.GOOGLE,
  [AIModels.GeminiBetter]: AI_PROVIDERS.GOOGLE,
  [AIModels.GeminiAdvanced]: AI_PROVIDERS.GOOGLE,
  [AIModels.GeminiTask]: AI_PROVIDERS.GOOGLE,
  [AIModels.GeminiPro]: AI_PROVIDERS.GOOGLE,

  // OpenAI Models
  [AIModels.GPT35Turbo]: AI_PROVIDERS.OPENAI,
  [AIModels.GPT4OMini]: AI_PROVIDERS.OPENAI,
  [AIModels.GTP40]: AI_PROVIDERS.OPENAI,
  [AIModels.GPTO1]: AI_PROVIDERS.OPENAI,
  [AIModels.GPTO1Mini]: AI_PROVIDERS.OPENAI,

  // OpenRouter Models
  [AIModels.DeepseekV3]: AI_PROVIDERS.OPENROUTER,
  [AIModels.DeepseekR1]: AI_PROVIDERS.OPENROUTER,
  [AIModels.DeepseekR1DistilledLlama]: AI_PROVIDERS.OPENROUTER,
  [AIModels.Qwen2_5VL72B]: AI_PROVIDERS.OPENROUTER,

  // Llama Models
  [AIModels.LlamaV3_3_70B]: AI_PROVIDERS.LLAMA,
  [AIModels.Llama_DeepseekV3]: AI_PROVIDERS.LLAMA,
  [AIModels.LlamaV3_1_400B]: AI_PROVIDERS.LLAMA,
  [AIModels.LlamaV3_1_8B]: AI_PROVIDERS.LLAMA,
  [AIModels.GemmaV2Big]: AI_PROVIDERS.LLAMA,
  [AIModels.GemmaV1Big]: AI_PROVIDERS.LLAMA,
  [AIModels.GemmaV1Small]: AI_PROVIDERS.LLAMA,
  [AIModels.Qwen2]: AI_PROVIDERS.LLAMA,
  [AIModels.Qwen2Coder]: AI_PROVIDERS.LLAMA,
  [AIModels.NousResearch]: AI_PROVIDERS.LLAMA,
  [AIModels.Mistral22B]: AI_PROVIDERS.LLAMA,
};

export const DEFAULT_MODELS: Record<AIProvider, AIModels> = {
  [AI_PROVIDERS.GOOGLE]: AIModels.GeminiFast,
  [AI_PROVIDERS.OPENAI]: AIModels.GPT35Turbo,
  [AI_PROVIDERS.OPENROUTER]: AIModels.DeepseekR1DistilledLlama,
  [AI_PROVIDERS.LLAMA]: AIModels.LlamaV3_3_70B,
};
