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
  Qwen2Coder = 'accounts/fireworks/models/qwen2p5-coder-32b-instruct',

  // Groq Models
  Mistral_Saba_24B = 'mistral-saba-24b',
  Deepseek_R1_Groq = 'deepseek-r1-distill-llama-70b-specdec',
  Llama_3_3_70B_speed = 'llama-3.3-70b-specdec',
  Llama_3_3_70B_vers = 'llama-3.3-70b-versatile',
  Llama_3_2_11B = 'llama-3.2-11b-vision-preview',
  Llama_3_1_9B = 'llama-3.1-8b-instant',
  Llama_3_70B = 'llama3-70b-8192',
  Gemma_2_9B = 'gemma2-9b-it',
}
