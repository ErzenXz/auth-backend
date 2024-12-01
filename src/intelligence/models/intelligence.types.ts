export interface AIResponse {
  result: {
    responses?: string[];
    questions?: string[];
    content?: string;
    error?: string;
    history?: ChatHistory[];
  };
}

export interface ChatHistory {
  userMessage: string;
  aiResponse: string;
}
