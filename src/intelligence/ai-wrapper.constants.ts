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

export type DraftStepType = 'INITIAL_DRAFT' | 'REVISION';
export type ThoughtStepType = 'INITIAL_THOUGHT' | 'REVISION';

export const DRAFT_STEPS: DraftStepType[] = ['INITIAL_DRAFT', 'REVISION'];
export const THOUGHT_STEPS: ThoughtStepType[] = ['INITIAL_THOUGHT', 'REVISION'];

export interface ProcessResult {
  reasoning: string;
  drafts?: string[];
  thoughts?: string[];
  complexity: 'low' | 'medium' | 'high' | 'very-high';
}

export const AI_PROVIDERS = {
  GOOGLE: 'GOOGLE',
  OPENAI: 'OPENAI',
  OPENROUTER: 'OPENROUTER',
  LLAMA: 'LLAMA',
  GROQ: 'GROQ',
  ANTHROPIC: 'ANTHROPIC',
} as const;

export type AIProvider = keyof typeof AI_PROVIDERS;

export const MODEL_PROVIDER_MAPPING: Record<AIModels, AIProvider> = {
  // Gemini Models
  [AIModels.Gemini]: AI_PROVIDERS.GOOGLE,
  [AIModels.GeminiFast]: AI_PROVIDERS.GOOGLE,
  [AIModels.GeminiFlash_2_5]: AI_PROVIDERS.GOOGLE,
  [AIModels.GeminiPro]: AI_PROVIDERS.GOOGLE,

  // OpenAI Models
  [AIModels.GPT4OMini]: AI_PROVIDERS.OPENAI,
  [AIModels.GTP40]: AI_PROVIDERS.OPENAI,
  [AIModels.GPT_o3_mini]: AI_PROVIDERS.OPENAI,
  [AIModels.GPT_o4_mini]: AI_PROVIDERS.OPENAI,
  [AIModels.GPT4_1]: AI_PROVIDERS.OPENAI,
  [AIModels.GPT4_1_mini]: AI_PROVIDERS.OPENAI,
  [AIModels.GPT4_1_nano]: AI_PROVIDERS.OPENAI,

  // OpenRouter Models
  [AIModels.DeepseekR1]: AI_PROVIDERS.OPENROUTER,
  [AIModels.Qwen2_5VL72B]: AI_PROVIDERS.OPENROUTER,
  [AIModels.Mistral_Small_3_1_24B]: AI_PROVIDERS.OPENROUTER,
  [AIModels.Gemma_3_27B]: AI_PROVIDERS.OPENROUTER,
  [AIModels.Reka_Flash_3]: AI_PROVIDERS.OPENROUTER,
  [AIModels.DeepseekV3_0324]: AI_PROVIDERS.OPENROUTER,
  [AIModels.Gemini2_5_Pro_Open]: AI_PROVIDERS.OPENROUTER,
  [AIModels.DeepseekR1T]: AI_PROVIDERS.OPENROUTER,

  // Llama Models
  [AIModels.Mistral_Small_3_Instruct]: AI_PROVIDERS.LLAMA,

  // Groq Models
  [AIModels.Deepseek_R1_Groq]: AI_PROVIDERS.GROQ,
  [AIModels.Deepseek_R1_GroqQwen]: AI_PROVIDERS.GROQ,
  [AIModels.Llama_3_3_70B_vers]: AI_PROVIDERS.GROQ,
  [AIModels.Llama_3_2_90B_vision]: AI_PROVIDERS.GROQ,
  [AIModels.Llama_3_70B]: AI_PROVIDERS.GROQ,
  [AIModels.QwQ_32_B]: AI_PROVIDERS.GROQ,
  [AIModels.Llama_4_Scout]: AI_PROVIDERS.GROQ,
  [AIModels.Llama_4_Maverick]: AI_PROVIDERS.GROQ,
  [AIModels.CompoundGroq]: AI_PROVIDERS.GROQ,
  [AIModels.CompoundGroqMini]: AI_PROVIDERS.GROQ,

  // Anthropic Models
  [AIModels.Claude37Sonnet]: AI_PROVIDERS.ANTHROPIC,
  [AIModels.Claude35SonnetNew]: AI_PROVIDERS.ANTHROPIC,
  [AIModels.Claude35Haiku]: AI_PROVIDERS.ANTHROPIC,
};

export const DEFAULT_MODELS: Record<AIProvider, AIModels> = {
  [AI_PROVIDERS.GOOGLE]: AIModels.Gemini,
  [AI_PROVIDERS.OPENAI]: AIModels.GPT4_1_mini,
  [AI_PROVIDERS.OPENROUTER]: AIModels.Reka_Flash_3,
  [AI_PROVIDERS.LLAMA]: AIModels.Mistral_Small_3_Instruct,
  [AI_PROVIDERS.GROQ]: AIModels.Llama_3_2_90B_vision,
  [AI_PROVIDERS.ANTHROPIC]: AIModels.Claude37Sonnet,
};
