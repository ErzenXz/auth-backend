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
  LlamaV3270B = 'llama3.3-70b',
  LlamaV31400B = 'llama3.1-405b',
  GemmaV2Big = 'gemma2-27b',
  GemmaV2Small = 'gemma2-9b',
  GemmaV1Big = 'gemma-7b',
  GemmaV1Small = 'gemma-2b',
  Qwen2 = 'Qwen2-72B',
  NousResearch = 'Nous-Hermes-2-Mixtral-8x7B-DPO',
  Mistral22B = 'mixtral-8x22b-instruct',
  Qwen15Big = 'Qwen1.5-110B-Chat',
}
