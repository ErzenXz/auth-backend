export enum AIModels {
  // Gemini Models
  Gemini = 'gemini-2.0-flash',
  GeminiFast = 'gemini-2.0-flash-lite',
  // GeminiFastCheap = 'gemini-1.5-flash',
  // GeminiFastCheapSmall = 'gemini-1.5-flash-8b',
  GeminiPro = 'gemini-2.5-pro-exp-03-25',
  GeminiFlash_2_5 = 'gemini-2.5-flash-preview',

  // OpenAI Models
  GPT4OMini = 'gpt-4o-mini-2024-07-18',
  GTP40 = 'chatgpt-4o-latest',
  // GPTO1 = 'o1',
  // GPT_o1_mini = 'o1-mini',
  GPT_o3_mini = 'o3-mini',
  GPT_o4_mini = 'o4-mini',
  GPT4_1 = 'gpt-4.1',
  GPT4_1_mini = 'gpt-4.1-mini',
  GPT4_1_nano = 'gpt-4.1-nano',

  // OpenRouter Models
  // DeepseekV3 = 'deepseek/deepseek-chat:free',
  DeepseekV3_0324 = 'deepseek/deepseek-chat-v3-0324:free',
  DeepseekR1 = 'deepseek/deepseek-r1:free',
  // DeepseekR1Zero = 'deepseek/deepseek-r1-zero:free',
  // DeepseekR1DistilledLlama = 'deepseek/deepseek-r1-distill-llama-70b:free',
  Qwen2_5VL72B = 'qwen/qwen2.5-vl-72b-instruct:free',
  // Qwen2_5_Code_32B = 'qwen/qwen-2.5-coder-32b-instruct:free',
  Mistral_Small_3_1_24B = 'mistralai/mistral-small-3.1-24b-instruct:free',
  // OlympicCoder_32B = 'open-r1/olympiccoder-32b:free',
  Gemma_3_27B = 'google/gemma-3-27b-it:free',
  Reka_Flash_3 = 'rekaai/reka-flash-3:free',
  // Llama_3_1_Neutron_Nvidia = 'nvidia/llama-3.1-nemotron-70b-instruct:free',
  Gemini2_5_Pro_Open = 'google/gemini-2.5-pro-exp-03-25:free',
  // GeminiBetter = 'google/gemini-2.0-flash-exp:free',
  // Deepcoder_14B = 'agentica-org/deepcoder-14b-preview:free',

  // Llama Models
  Mistral_Small_3_Instruct = 'accounts/fireworks/models/mistral-small-24b-instruct-2501',

  // Groq Models
  // Mistral_Saba_24B = 'mistral-saba-24b',
  Deepseek_R1_Groq = 'deepseek-r1-distill-llama-70b',
  Deepseek_R1_GroqQwen = 'deepseek-r1-distill-qwen-32b',
  Llama_3_3_70B_speed = 'llama-3.3-70b-specdec',
  Llama_3_3_70B_vers = 'llama-3.3-70b-versatile',
  Llama_3_2_90B_vision = 'llama-3.2-90b-vision-preview',
  // Llama_3_2_11B = 'llama-3.2-11b-vision-preview',
  // Llama_3_1_9B = 'llama-3.1-8b-instant',
  Llama_3_70B = 'llama3-70b-8192',
  // Gemma_2_9B = 'gemma2-9b-it',
  QwQ_32_B = 'qwen-qwq-32b',
  Llama_4_Scout = 'meta-llama/llama-4-scout-17b-16e-instruct',
  Llama_4_Maverick = 'meta-llama/llama-4-maverick-17b-128e-instruct',

  // Anthropic Models
  Claude37Sonnet = 'claude-3-7-sonnet-20250219',
  Claude35SonnetNew = 'claude-3-5-sonnet-20241022',
  Claude35Haiku = 'claude-3-5-haiku-20241022',
  // Claude35SonnetOld = 'claude-3-5-sonnet-20240620',
  // Claude3Haiku = 'claude-3-haiku-20240307',
  // Claude3Opus = 'claude-3-opus-20240229',
  // Claude3Sonnet = 'claude-3-sonnet-20240229',
  // Claude21 = 'claude-2.1',
  // Claude20 = 'claude-2.0',
}
