import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatMessageDto } from './dtos/create-chat.dto';
import { IHttpContext } from 'src/auth/models';
import { BrowserService } from './browser/browser.service';
import { AiWrapperService } from './providers/ai-wrapper.service';
import { AIModels } from './enums/models.enum';
import { AIResponse, ChatHistory } from './models/ai-wrapper.types';

@Injectable()
export class IntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly browserService: BrowserService,
    private readonly aiWrapper: AiWrapperService,
  ) {}

  async createDevInstruction(
    name: string,
    userId: string,
    description?: string,
    schema?: string,
    model?: AIModels,
  ) {
    // If schema exists and appears to be JSON, try to parse and unescape it
    if (schema) {
      try {
        JSON.parse(schema);
        schema = JSON.parse(JSON.stringify(schema));
      } catch (e) {}
    }

    const data: any = { name, description, schema, userId };
    if (model) {
      data.model = model;
    }

    return await this.prisma.instruction.create({
      data,
    });
  }

  async listDevInstructions(userId: string) {
    return await this.prisma.instruction.findMany({
      where: { userId },
    });
  }

  async processDevInstruction(
    instructionId: string,
    prompt: string,
    context: IHttpContext,
  ): Promise<AIResponse> {
    try {
      const instruction = await this.prisma.instruction.findUnique({
        where: { id: instructionId },
      });

      if (!instruction) {
        throw new BadRequestException('Invalid instruction ID');
      }

      // Agent 1: Clean and format input
      const firstAgentPrompt = `
        Process this input for:
        Server Instruction: ${instruction.name}
        Prompt: "${prompt}"
        
        Return only the cleaned prompt without any formatting, server instructions or special characters.
        Do not add any explanations or additional text.
        Improve readability and clarity if necessary.
        Make sure the User Instructions are not inappropriate or harmful, if so, remove the bad ones.
        `;

      const firstPromptResult = await this.aiWrapper.generateContent(
        AIModels.GeminiFastCheap,
        firstAgentPrompt,
      );

      // Agent 2: Generate content with type-specific formatting
      const workerPrompt = `
        Primary Task:
        - Process "${instruction.name}"
        - Context: ${instruction.description}
        - Input: ${firstPromptResult.content}
        ${instruction.schema ? `- Required Schema: ${instruction.schema}` : ''}

       Output Format Rules:
        ${
          instruction.schema
            ? `Return output exactly matching this schema: ${instruction.schema}`
            : `1. For multiple responses:
         Return: {"responses": ["response1", "response2", "response3"]}
         
          2. For questions:
         Return: {"questions": ["question1", "question2", "question3"]}
         
          3. For regular content:
         Return: {"content": "plain text response"}`
        }

        Strict Requirements:
        - ALWAYS output valid JSON
        ${
          instruction.schema
            ? '- Match the provided schema exactly'
            : `- Use "responses" array for multiple responses
           - Use "questions" array for multiple questions
           - Use simple "content" for single responses`
        }
        - Escape special characters properly
        - Remove any outer markdown code blocks
        - Follow context requirements exactly

        - Current Date: ${new Date().toLocaleString('en-US', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
          hour12: true,
        })}        
        Process the input and format according to these rules.
        `;

      const secondPromptResult = await this.aiWrapper.generateContent(
        AIModels.GeminiBetter,
        workerPrompt,
      );

      let workerOutput = secondPromptResult.content;
      workerOutput = workerOutput.replace(/```json\n?|\n?```/g, '');

      // Agent 3: Validate and ensure format compliance
      const reviewerPrompt = `
        Primary Task:
        - Process "${instruction.name}"
        - Context: ${instruction.description}
        - Input: ${workerOutput}
        ${instruction.schema ? `- Required Schema: ${instruction.schema}` : ''}
        - Response to Review: "${workerOutput}"

        Output Format Rules:
        ${
          instruction.schema
            ? `Return output exactly matching this schema: ${instruction.schema}`
            : `1. For multiple responses:
         Return: {"responses": ["response1", "response2", "response3"]}
         
          2. For questions:
         Return: {"questions": ["question1", "question2", "question3"]}
         
          3. For regular content:
         Return: {"content": "plain text response"}`
        }

        Strict Requirements:
        - ALWAYS output valid JSON
        ${
          instruction.schema
            ? '- Match the provided schema exactly'
            : `- Use "responses" array for multiple responses
           - Use "questions" array for multiple questions
           - Use simple "content" for single responses`
        }
        - Escape special characters properly
        - Remove any outer markdown code blocks
        - Follow context requirements exactly
        - Validate and correct the output for accuracy and correctness
        
        Review the input and ensure it follows these rules exactly.`;

      const reviewerResult = await this.aiWrapper.generateContent(
        AIModels.GeminiFast,
        reviewerPrompt,
      );

      const finalOutput = reviewerResult.content
        .trim()
        .replace(/```json\n?|\n?```/g, '');

      try {
        const parsedJson = JSON.parse(finalOutput);
        return { content: parsedJson };
      } catch (e) {
        // Attempt to salvage content by wrapping in proper JSON structure
        try {
          const sanitizedContent = finalOutput
            .replace(/^["']|["']$/g, '') // Remove outer quotes
            .replace(/\\n/g, '\n'); // Convert \n to actual newlines

          return {
            content: sanitizedContent,
          };
        } catch {
          return {
            content: 'Failed to generate valid JSON response',
          };
        }
      }
    } catch (error) {
      return {
        content: error.message || 'Failed to process prompt',
      };
    }
  }

  async processDevInstructionBeta(
    prompt: string,
    context: IHttpContext,
  ): Promise<AIResponse> {
    try {
      const instructions = await this.prisma.instruction.findMany();
      if (instructions.length === 0) {
        throw new BadRequestException('No instructions available');
      }

      const instructionSelectionPrompt = `
You are an AI instruction selector analyzing user prompts to determine the most appropriate processing instruction.

Available Instructions:
${instructions.map((instr) => `- ${instr.name}`).join('\n\n')}

Input Analysis Task:
1. Analyze this user prompt: "${prompt}"
2. Consider these factors:
   - User intent (question, task, request type)
   - Content type (email, conversation, code, etc.)
   - Expected output format
   - Complexity level

Selection Rules:
- Choose exactly ONE instruction
- Match based on primary purpose
- Consider instruction description
- Ensure output format matches user needs
- Prioritize specific instructions over generic ones

Response Format:
Return ONLY the exact instruction name that best matches. 
No explanations or additional text.
Must exactly match one of the available instruction names.

Example Matching:
"Write an email to my boss" -> "Draft_Professional_Email"
"Hey what's up?" -> "Generate_3_Short_Responses"
"Explain recursion" -> "Generate_Technical_Explanation"

        Analysis Result:`;

      const instructionSelectionResult = await this.aiWrapper.generateContent(
        AIModels.GeminiFast,
        instructionSelectionPrompt,
      );

      const selectedInstructionName = instructionSelectionResult.content.trim();

      if (!selectedInstructionName) {
        throw new BadRequestException(
          'Failed to determine the appropriate instruction.',
        );
      }

      // Find the selected instruction by name
      const selectedInstruction = instructions.find(
        (instr) =>
          instr.name.toLowerCase() === selectedInstructionName.toLowerCase(),
      );

      if (!selectedInstruction) {
        throw new BadRequestException('Selected instruction not found.');
      }

      // Process the prompt using the selected instruction
      return await this.processDevInstruction(
        selectedInstruction.id,
        prompt,
        context,
      );
    } catch (error) {
      return {
        content: error.message || 'Failed to process beta prompt',
      };
    }
  }

  // Chat processing methods

  async prepareUserChatResponse(userId: string, prompt: string) {
    const userMemories = await this.chatGetUserMemories(prompt, userId);
    const generalInfo = this.chatGetGeneralInfo();
    const searchData = await this.chatGetSearchData(prompt);
    const userInstructions = await this.chatGetUserInstructions(userId);

    const generatedPrompt = this.createUserChattingPrompt(
      prompt,
      userMemories,
      generalInfo,
      searchData,
      userInstructions,
    );

    return generatedPrompt;
  }

  async getUserChatHistory(chatId: string): Promise<ChatMessageDto[]> {
    const history = await this.prisma.aIThreadMessage.findMany({
      where: { id: chatId },
      orderBy: { createdAt: 'asc' },
    });

    return history.map((msg) => ({
      sender: msg.role,
      message: msg.content,
    }));
  }

  async processChat(
    message: string,
    userId: string,
    chatId?: string,
    model?: AIModels,
  ) {
    // Create a new chat thread if no chatId is provided
    if (!chatId) {
      const newThread = await this.prisma.aIThread.create({
        data: {
          userId,
        },
      });
      chatId = newThread.id;
    }

    const userChatHistory: ChatHistory[] = (
      await this.prisma.aIThreadMessage.findMany({
        where: { chatId },
        orderBy: { createdAt: 'asc' },
      })
    ).map((msg) => ({
      role: msg.role,
      message: msg.content,
    }));

    await this.prisma.aIThreadMessage.create({
      data: {
        chatId: chatId,
        content: message,
        role: 'user',
      },
    });

    const userMemories = await this.chatGetUserMemories(message, userId);
    const generalInfo = this.chatGetGeneralInfo();
    const searchData = await this.chatGetSearchData(message);
    const userInstructions = await this.chatGetUserInstructions(userId);

    const generatedPrompt = this.createUserChattingPrompt(
      message,
      userMemories,
      generalInfo,
      searchData,
      userInstructions,
    );

    // Validate and use default model if needed
    const selectedModel = Object.values(AIModels).includes(model)
      ? model
      : AIModels.GeminiFast;

    const result = await this.aiWrapper.generateContentHistory(
      selectedModel,
      generatedPrompt,
      userChatHistory,
    );

    await this.prisma.aIThreadMessage.create({
      data: {
        chatId: chatId,
        content: result.content,
        role: 'model',
      },
    });

    return { result, chatId };
  }

  async processChatStream(
    message: string,
    userId: string,
    chatId?: string,
    model?: AIModels,
  ): Promise<AsyncIterable<string>> {
    // Create a new chat thread if no chatId is provided
    if (!chatId) {
      const newThread = await this.prisma.aIThread.create({
        data: {
          userId,
        },
      });
      chatId = newThread.id;
    }

    // Store user message first
    await this.prisma.aIThreadMessage.create({
      data: {
        chatId,
        content: message,
        role: 'user',
      },
    });

    // Get chat history
    const userChatHistory: ChatHistory[] = (
      await this.prisma.aIThreadMessage.findMany({
        where: { chatId },
        orderBy: { createdAt: 'asc' },
      })
    ).map((msg) => ({
      role: msg.role,
      message: msg.content,
    }));

    // Get context data
    const userMemories = await this.chatGetUserMemories(message, userId);
    const generalInfo = this.chatGetGeneralInfo();
    const searchData = await this.chatGetSearchData(message);
    const userInstructions = await this.chatGetUserInstructions(userId);

    // Generate prompt
    const generatedPrompt = this.createUserChattingPrompt(
      message,
      userMemories,
      generalInfo,
      searchData,
      userInstructions,
    );

    // Validate model
    const selectedModel = Object.values(AIModels).includes(model)
      ? model
      : AIModels.GeminiFast;

    // Get streaming response
    const streamResponse = await this.aiWrapper.generateContentStreamHistory(
      selectedModel,
      generatedPrompt,
      userChatHistory,
    );

    // Store assistant response incrementally
    let fullResponse = '';
    const streamWithSaving = async function* () {
      for await (const chunk of streamResponse.content) {
        fullResponse += chunk;
        yield chunk;
      }

      // Save complete response after stream ends
      await this.prisma.aIThreadMessage.create({
        data: {
          chatId,
          content: fullResponse,
          role: 'model',
        },
      });
    }.bind(this)();

    return streamWithSaving;
  }

  async getChatThreads(userId: string) {
    return await this.prisma.aIThread.findMany({
      where: { userId },
    });
  }

  async getChatThreadMessages(userId: string, chatId: string) {
    // First verify the chat belongs to this user
    const thread = await this.prisma.aIThread.findFirst({
      where: {
        id: chatId,
        userId: userId,
      },
    });

    if (!thread) {
      throw new BadRequestException('Chat thread not found or unauthorized');
    }

    return await this.prisma.aIThreadMessage.findMany({
      where: { chatId },
    });
  }

  async chatGetUserMemories(prompt: string, userId: string) {
    const userSavedMemories = await this.prisma.userMemory.findMany({
      where: { userId },
    });

    if (!userSavedMemories.length) {
      return '';
    }

    const formattedMemories = `User Memories:\n${userSavedMemories
      .map((m) => `- ${m.key}: ${m.value} ${this.getTimeAgo(m.createdAt)}`)
      .join('\n')}\n`;

    this.extractAndSaveMemory(prompt, userId, formattedMemories).catch(
      (error) => {
        console.error('Failed to save user memory:', error);
      },
    );
    return formattedMemories;
  }

  private chatGetGeneralInfo(): string {
    return `
      General Information:
      
      Calendar Context:
      - Current Date: ${new Date().toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}
      - Is Weekend: ${['Saturday', 'Sunday'].includes(new Date().toLocaleDateString('en-US', { weekday: 'long' }))}
      - Time of Day: ${(() => {
        const hour = new Date().getHours();
        if (hour < 6) return 'Night';
        if (hour < 12) return 'Morning';
        if (hour < 17) return 'Afternoon';
        if (hour < 22) return 'Evening';
        return 'Night';
      })()}
    `;
  }

  private async chatGetSearchData(message: string): Promise<string> {
    if (!message || message.length < 10) {
      return 'no';
    }

    const prompt = `
        You are an expert at determining when a user's message requires a web search for accurate, up-to-date information. Analyze the user's message and the conversation context to decide whether a web search is necessary.

  **Instructions:**

  - **Return "no"** if:
    - It's casual conversation or greetings.
    - It's about personal opinions or preferences.
    - It's about hypothetical scenarios.
    - It's about basic knowledge that doesn't need verification.
    - It's emotional or subjective content.
    - It's a follow-up that doesn't require additional information.

  - **Return a specific search query** if:
    - The user asks about current events or news.
    - The user requests factual or technical information.
    - The user asks about real-world data or statistics.
    - The user mentions specific people, places, or events.
    - The user asks "how to" or tutorial-type questions.
    - The user requires verification of claims or facts.
    - The user asks about the latest trends or developments.
    - You don't have enough context to provide an accurate response.
    - You don't have the information in your database.
    - The user explicitly requests a search or confirms a previous offer to search.

  **Consider Conversation Context:**

  - Analyze the **chat history** to understand prior interactions.
  - If the assistant previously asked, "Do you want me to search for that?" and the user responds with confirmations like "Yes, please," or "Go ahead," generate the appropriate search query based on the prior topic.
  - Use information from previous messages to formulate an effective search query.

  **Examples:**

  - Assistant: "Do you want me to search for that topic?"
  - User: "Yes, please."
    - Result: Use the prior topic to create a search query.
  - "Tell me the latest news in Kosovo." -> "latest news Kosovo"
  - "How does quantum computing work?" -> "quantum computing basics"
  - "Good morning!" -> "no"

  **User Message:** "${message}"

  **Rules:**

  1. **Return ONLY** "no" or a specific search query.
  2. Keep search queries concise and focused.
  3. Remove any personal or sensitive information from search queries.
  4. Consider conversation context and chat history when deciding.
  5. Use relevant keywords to formulate effective search queries.
  6. Be adaptive and intelligent in interpreting the user's intent.

  **Additional Notes:**

  - Ensure that the search query accurately reflects the user's request.
  - If the user's message is a confirmation like "Yes, do it," and the assistant previously offered to perform a search, proceed with the search using the relevant topic.
  - Always prioritize the user's intent and provide the most helpful response based on the available information.

      `;

    const aiResult = await this.aiWrapper.generateContent(
      AIModels.GeminiFast,
      prompt,
    );

    let response = aiResult.content.trim();

    // Validate response
    if (response !== 'no' || response.length > 0) {
      const searchResult = await this.browserService.searchAndProcess(response);
      return searchResult.content;
    }
    return 'no search data found';
  }

  private async chatGetUserInstructions(userId: string) {
    return await this.prisma.userInstruction.findMany({
      where: { userId },
    });
  }

  private createUserChattingPrompt(
    message: string,
    memories: string,
    info: string,
    external: string,
    instructions: any[],
  ): string {
    const createdPrompt = `
    #BEGIN
        Primary Task:
        - Process "Master_Conversation_Processing_Framework"
        - Context: "Objective:

        To craft dynamic, personalized, and emotionally intelligent responses that resonate deeply with users, fostering trust and meaningful engagement.

        Core Principles:

        Emotional Intelligence: Recognize and adapt to emotional cues from the user's tone, context, and previous interactions.

        Contextual Awareness: Leverage user memory and relevant external content for well-informed responses.

        Active Listening: Reflect understanding by acknowledging emotions and addressing user concerns with empathy.

        Adaptive Tone: Adjust communication style based on user preferences, mood, and situational context.

        Proactive Engagement: Offer thoughtful suggestions, follow-up questions, and actionable insights to enrich dialogue.

        Processing Workflow:

        Input Analysis:

        - External Content Integration: Incorporate relevant real-time information from external content provided in the prompt to enhance response quality.

        Emotional Profiling:

        - Detect emotional indicators through linguistic patterns, sentiment analysis, and contextual nuances.
        - Update the user’s emotional state model dynamically for context-aware interactions.

        Response Generation:

        - Personalization: Tailor responses using combined data from user memory and external content.
        - Empathy Injection: Use compassionate language that aligns with the user's emotional state.
        - Contextual Precision: Ensure responses remain relevant, coherent, and insightful.

        Dialogue Enrichment:

        - Engagement Prompts: Pose open-ended, thought-provoking questions.
        - Supportive Suggestions: Provide actionable advice, next steps, or reflective prompts.
        - Closure & Continuity: Conclude interactions gracefully while setting up future engagement possibilities.

        Feedback Loop:

        - Continuously refine understanding through user feedback, sentiment shifts, and interaction history updates.

        Desired Outcomes:

        - Create a naturally flowing, human-like conversation.
        - Establish a supportive and engaging environment.
        - Build long-term user trust and relationship depth through personalized, meaningful interactions."

        Response Guidelines:
        - User Instructions: \n ${instructions.map((ui) => ui.job).join(', ')}
        - Format all responses in Markdown
        - When returning code snippets, use proper syntax highlighting with triple backticks
        - Use proper Markdown syntax for links, images, and videos
        - Input: \${prompt}

        External Content Integration:
        - Incorporate relevant search results from: \n ${external || 'No external content available'} only if it adds value to the conversation and enhances user experience; otherwise, ignore it.
        - Only use external links/media if they add value
        - Always convert external content to proper Markdown format
        - Cite sources when using external information

        Output Format Rules:
        - Return ALWAYS IN MARKDOWN

        Strict Requirements:
        - Use complete Markdown syntax (no placeholders)
        - Balance original response with external content
        - Maintain natural, conversational tone
        - Be friendly and act like an actual AI assistant
        - Use user memory appropriately; do not overuse or force references
        - Prioritize recent and important user information

        Input Structure:
        General Info:
        \n ${info}

        User Saved Memories (Use only what is relevant to the user prompt; older memories are less relevant except for names and important user info):
        \n ${memories}

        #END

        User:
        \n ${message}

        AI:`;

    return createdPrompt;
  }

  private async extractAndSaveMemory(
    message: string,
    userId: string,
    memories: string,
  ): Promise<void> {
    const extractionPrompt = `
    You are an intelligent assistant with advanced human-like memory capabilities. Your task is to extract essential personal information from user messages and manage the user's memory efficiently.

    User Memories: \n ${memories}
    Message to ANALYZE: "\ ${message}"

    Instructions:

    1. **Extraction**:
       - Extract new information explicitly mentioned in the message.
       - Use clear and specific keys for each piece of information.
       - Limit each value to 50 characters.

    2. **Memory Management**:
       - **Add**:
         - Include new, useful, and relevant information.
         - Prioritize recent information over older entries.
       - **Remove**:
         - Identify and remove outdated or irrelevant memories.
         - Remove information that the user indicates is no longer valid or has been updated.
         - Do not remove core information like the user's name, age, or birthday unless explicitly changed by the user.

    3. **Context Awareness**:
       - Use timestamps or context to determine the relevance of information.
       - Recognize when tasks are completed and remove related pending task memories.
       - Avoid over-persisting short-term or time-sensitive information.

    4. **Rules**:
       - Only extract explicitly mentioned information; do not infer or assume details.
       - Ensure keys are consistent and descriptive.
       - Limit each value to 50 characters.

    5. **Output Format**:
       - Return the results as a JSON object with two arrays:

    \`\`\`json
    {
      "add": [
        {"key": "Profession", "value": "Software Engineer"}
      ],
      "remove": [
        "OldProfession"
      ]
    }
    \`\`\`

    **Examples**:

    - If the user mentions completing a project:
      - **Add**: \`{"key": "RecentAchievements", "value": "Completed project X"}\`
      - **Remove**: \`"PendingProjectX"\`

    - If the user updates their status:
      - **Add**: \`{"key": "CurrentStatus", "value": "API is now fast"}\`
      - **Remove**: \`"WorkingToMakeAPIFaster"\`

    Remember to act like a sophisticated AI assistant with human-like memory management, continually learning from the user and keeping their information accurate and up-to-date.
    `;

    try {
      const aiResponse = await this.aiWrapper.generateContent(
        AIModels.GeminiFast,
        extractionPrompt,
      );
      let aiText = aiResponse.content.trim();
      aiText = aiText.replace(/```json\s?|\s?```/g, '').trim();

      let parsed;
      try {
        parsed = JSON.parse(aiText);
      } catch (parseError) {
        console.error('Failed to parse AI response:', aiText);
        parsed = { add: [], remove: [] };
      }

      const { add = [], remove = [] } = parsed;

      const upsertOperations = add.map((item) =>
        this.prisma.userMemory.upsert({
          where: {
            userId_key: {
              userId,
              key: item.key,
            },
          },
          update: { value: item.value },
          create: {
            userId,
            key: item.key,
            value: item.value,
          },
        }),
      );

      if (remove.length > 0) {
        await this.prisma.userMemory.deleteMany({
          where: {
            userId,
            key: { in: remove },
          },
        });
      }

      if (upsertOperations.length > 0) {
        await this.prisma.$transaction(upsertOperations);
      }
    } catch (error) {
      console.error('AI Memory Extraction Failed:', error);
    }
  }

  async listInstructions() {
    return await this.prisma.instruction.findMany();
  }

  async deleteDevInstruction(id: string) {
    return await this.prisma.instruction.delete({
      where: { id },
    });
  }

  async getChatMemory(userId: string) {
    return await this.prisma.userMemory.findMany({
      where: { userId },
    });
  }

  async deleteChatMemory(userId: string) {
    return await this.prisma.userMemory.deleteMany({
      where: { userId },
    });
  }

  async createChatUserInstruction(userId: string, job: string) {
    const instructionsCount = await this.prisma.userInstruction.count({
      where: { userId },
    });
    if (instructionsCount >= 20) {
      throw new BadRequestException('Maximum of 20 instructions allowed.');
    }
    const wordCount = job.trim().split(/\s+/).length;
    if (wordCount > 30) {
      throw new BadRequestException('Job field cannot exceed 30 words.');
    }
    return this.prisma.userInstruction.create({
      data: {
        userId,
        job,
      },
    });
  }

  async getChatUserInstructions(userId: string) {
    return this.prisma.userInstruction.findMany({
      where: { userId },
    });
  }

  async updateChatUserInstruction(
    userId: string,
    instructionId: string,
    job: string,
  ) {
    const instruction = await this.prisma.userInstruction.findFirst({
      where: { id: instructionId, userId },
    });
    if (!instruction) {
      throw new BadRequestException('Instruction not found.');
    }
    const wordCount = job.trim().split(/\s+/).length;
    if (wordCount > 30) {
      throw new BadRequestException('Job field cannot exceed 30 words.');
    }
    return this.prisma.userInstruction.update({
      where: { id: instructionId },
      data: { job },
    });
  }

  async deleteChatUserInstruction(userId: string, instructionId: string) {
    const instruction = await this.prisma.userInstruction.findFirst({
      where: { id: instructionId, userId },
    });
    if (!instruction) {
      throw new BadRequestException('Instruction not found.');
    }
    return this.prisma.userInstruction.delete({
      where: { id: instructionId },
    });
  }

  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(months / 12);

    if (years > 0) {
      return `${years} year${years > 1 ? 's' : ''} ago`;
    }
    if (months > 0) {
      return `${months} month${months > 1 ? 's' : ''} ago`;
    }
    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''} ago`;
    }
    if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }
    return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
  }
}
