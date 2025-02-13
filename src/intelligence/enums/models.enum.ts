export enum AIModels {
  // Gemini Models
  Gemini = 'gemini-2.0-flash-001',
  GeminiFast = 'gemini-2.0-flash-lite-preview-02-05',
  GeminiFastCheap = 'gemini-1.5-flash',
  GeminiFastCheapSmall = 'gemini-1.5-flash-8b',
  GeminiBetter = 'gemini-2.0-flash-exp',
  GeminiAdvanced = 'gemini-2.0-flash-thinking-exp-01-21',
  GeminiTask = 'learnlm-1.5-pro-experimental',
  GeminiPro = 'gemini-2.0-pro-exp-02-05',

  // OpenAI Models
  GPT4OMini = 'gpt-4o-mini-2024-07-18',
  GTP40 = 'chatgpt-4o-latest',
  GPTO1 = 'o1',
  GPTO1Mini = 'o1-mini',
  GPT35Turbo = 'gpt-3.5-turbo-0125',

  // OpenRouter Models
  DeepseekV3 = 'deepseek/deepseek-chat:free',
  DeepseekR1 = 'deepseek/deepseek-r1:free',
  DeepseekR1DistilledLlama = 'deepseek/deepseek-r1-distill-llama-70b:free',
  Qwen2_5VL72B = 'qwen/qwen2.5-vl-72b-instruct:free',

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
