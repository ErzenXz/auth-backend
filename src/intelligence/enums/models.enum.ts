export enum AIModels {
  // Gemini Models
  Gemini = 'gemini-2.0-flash',
  GeminiFast = 'gemini-2.0-flash-lite',
  GeminiPro = 'gemini-2.5-pro-exp-03-25',
  GeminiFlash_2_5 = 'gemini-2.5-flash-preview-04-17',

  // OpenAI Models
  GPT4OMini = 'gpt-4o-mini-2024-07-18',
  GTP40 = 'chatgpt-4o-latest',
  GPT_o3_mini = 'o3-mini',
  GPT_o4_mini = 'o4-mini',
  GPT4_1 = 'gpt-4.1',
  GPT4_1_mini = 'gpt-4.1-mini',
  GPT4_1_nano = 'gpt-4.1-nano',

  // OpenRouter Models
  DeepseekV3_0324 = 'deepseek/deepseek-chat-v3-0324:free',
  DeepseekR1 = 'deepseek/deepseek-r1:free',
  DeepseekR1T = 'tngtech/deepseek-r1t-chimera:free',

  Qwen2_5VL72B = 'qwen/qwen2.5-vl-72b-instruct:free',
  Mistral_Small_3_1_24B = 'mistralai/mistral-small-3.1-24b-instruct:free',
  Gemma_3_27B = 'google/gemma-3-27b-it:free',
  Reka_Flash_3 = 'rekaai/reka-flash-3:free',
  Gemini2_5_Pro_Open = 'google/gemini-2.5-pro-exp-03-25:free',
  Qwen3_Ultra = 'qwen/qwen3-235b-a22b:free',
  Qwen3_Mini = 'qwen/qwen3-30b-a3b:free',
  Qwen3_32B = 'qwen/qwen3-32b:free',
  Llama3_Ultra = 'nvidia/llama-3.1-nemotron-ultra-253b-v1:free',

  // Llama Models
  Mistral_Small_3_Instruct = 'accounts/fireworks/models/mistral-small-24b-instruct-2501',

  // Groq Models
  Deepseek_R1_Groq = 'deepseek-r1-distill-llama-70b',
  Deepseek_R1_GroqQwen = 'deepseek-r1-distill-qwen-32b',
  Llama_3_3_70B_vers = 'llama-3.3-70b-versatile',
  Llama_3_2_90B_vision = 'llama-3.2-90b-vision-preview',
  Llama_3_70B = 'llama3-70b-8192',
  QwQ_32_B = 'qwen-qwq-32b',
  Llama_4_Scout = 'meta-llama/llama-4-scout-17b-16e-instruct',
  Llama_4_Maverick = 'meta-llama/llama-4-maverick-17b-128e-instruct',
  CompoundGroq = 'compound-beta',
  CompoundGroqMini = 'compound-beta-mini',

  // Anthropic Models
  Claude37Sonnet = 'claude-3-7-sonnet-20250219',
  Claude35SonnetNew = 'claude-3-5-sonnet-20241022',
  Claude35Haiku = 'claude-3-5-haiku-20241022',
}
