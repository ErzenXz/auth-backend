export enum AIModels {
  // Gemini Models
  Gemini = 'gemini-exp-1121',
  GeminiFast = 'gemini-1.5-flash',
  GeminiFastCheap = 'gemini-1.5-flash-8b',
  GeminiBetter = 'gemini-2.0-flash-exp',
  GeminiAdvanced = 'gemini-2.0-flash-thinking-exp',

  // OpenAI Models
  GPT4OMini = 'gpt-4o-mini-2024-07-18',
  GTP40 = 'chatgpt-4o-latest',
  GPTO1 = 'o1',
  GPTO1Mini = 'o1-mini',
  GPT35Turbo = 'gpt-3.5-turbo-0125',

  // Deepseek Models
  DeepseekV3 = 'deepseek-chat',
  DeepseekR1 = 'deepseek-reasoner',

  // Llama Models
  LlamaV3_3_70B = 'accounts/fireworks/models/llama-v3p3-70b-instruct',
  Llama_DeepseekV3 = 'accounts/fireworks/models/deepseek-v3',
  LlamaV3_1_400B = 'accounts/fireworks/models/llama-v3p1-405b-instruct',
  LlamaV3_1_8B = 'accounts/fireworks/models/llama-v3p1-8b-instruct',
  GemmaV2Big = 'accounts/fireworks/models/gemma2-9b-it',
  GemmaV1Big = 'accounts/fireworks/models/gemma-7b-it',
  GemmaV1Small = 'accounts/fireworks/models/gemma-2b-it',
  Qwen2 = 'accounts/fireworks/models/qwen2p5-72b-instruct',
  Qwen2Coder = 'accounts/fireworks/models/qwen2p5-coder-32b-instruct',
  NousResearch = 'accounts/fireworks/models/nous-hermes-2-mixtral-8x7b-dpo',
  Mistral22B = 'accounts/fireworks/models/hermes-2-pro-mistral-7b',
}
