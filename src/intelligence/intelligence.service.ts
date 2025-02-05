import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatMessageDto } from './dtos/create-chat.dto';
import { IHttpContext } from 'src/auth/models';
import { BrowserService } from './browser/browser.service';
import { AiWrapperService } from './providers/ai-wrapper.service';
import { AIModels } from './enums/models.enum';
import { AIResponse, ChatHistory } from './models/ai-wrapper.types';
import { ReasoningStepType, STEP_ORDER } from './ai-wrapper.constants';
import { randomBytes } from 'crypto';
import { CreateApplicationDto } from './dtos/create-application.dto';

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

  async createApplication(bodyRequest: CreateApplicationDto, userId: string) {
    const { name } = bodyRequest;
    // Generate a unique API key
    const apiKey = randomBytes(16).toString('hex');

    const application = await this.prisma.application.create({
      data: {
        name,
        userId,
        apiKey,
      },
    });
    return application;
  }

  async listApplications(userId: string) {
    return await this.prisma.application.findMany({
      where: { userId },
    });
  }

  async getApplication(id: string, userId: string) {
    const application = await this.prisma.application.findFirst({
      where: { id, userId },
      include: {
        usages: true,
      },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }
    return application;
  }

  async updateApplication(id: string, bodyRequest: any, userId: string) {
    const existing = await this.prisma.application.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Application not found');
    }
    const { name } = bodyRequest;
    // Update additional fields if needed
    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        name: name || existing.name,
      },
    });
    return updated;
  }

  async deleteApplication(id: string, userId: string) {
    const existing = await this.prisma.application.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Application not found');
    }
    return await this.prisma.application.delete({
      where: { id },
    });
  }

  async getBillingInfo(userId: string) {
    // Retrieve all applications for the user including usages
    const applications = await this.prisma.application.findMany({
      where: { userId },
      include: { usages: true },
    });

    // Calculate total balance across all applications
    const totalBalance = applications.reduce(
      (acc, app) => acc + (app.balance || 0),
      0,
    );

    // Aggregate total usage count per user/application
    const billingInfo = {
      totalUsage: applications.reduce(
        (acc, app) => acc + (app.usages?.length || 0),
        0,
      ),
      totalBalance,
      applications: applications.map((app) => ({
        id: app.id,
        name: app.name,
        usageCount: app.usages?.length || 0,
        balance: app.balance || 0,
      })),
    };

    return billingInfo;
  }

  private async updateUsageAndBalance(
    apiKey: string,
    tokenUsage: number,
    moneyUsed: number,
    pricingDataId: string,
  ): Promise<void> {
    const application = await this.prisma.application.findFirst({
      where: { apiKey },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    await this.prisma.$transaction([
      this.prisma.applicationUsage.create({
        data: {
          applicationId: application.id,
          tokensUsed: tokenUsage,
          cost: moneyUsed,
          aiModelPricingId: pricingDataId,
        },
      }),
      this.prisma.application.update({
        where: { id: application.id },
        data: {
          balance: {
            decrement: moneyUsed,
          },
        },
      }),
    ]);
  }

  private async calculateCost(
    tokenUsage: number,
    model: AIModels,
  ): Promise<{ moneyUsed: number; pricingData: any }> {
    const pricingData = await this.prisma.aIModelPricing.findFirst({
      where: { model },
    });

    const pricePerUnit = pricingData?.quantity || 0;
    const modelPrice = pricingData.pricePerUnit;
    const moneyUsed = (tokenUsage / pricePerUnit) * modelPrice;

    return { moneyUsed, pricingData };
  }

  async processDevInstruction(
    instructionId: string,
    prompt: string,
    apiKey: string,
  ): Promise<AIResponse> {
    try {
      const instruction = await this.prisma.instruction.findUnique({
        where: { id: instructionId },
      });

      if (!instruction) {
        throw new BadRequestException('Invalid instruction ID');
      }

      const model = (instruction.model as AIModels) || AIModels.GeminiFast;

      // Check if usage exceeds the limit

      const workerPrompt = `
        Primary Task:
        - Process "${instruction.name}"
        - Context: ${instruction.description}
        - Input: ${prompt}
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
        model,
        workerPrompt,
      );

      const tokenUsageWorker = secondPromptResult.usage.totalTokens;
      const workerUsage = await this.calculateCost(tokenUsageWorker, model);

      await this.updateUsageAndBalance(
        apiKey,
        tokenUsageWorker,
        workerUsage.moneyUsed,
        workerUsage.pricingData.id,
      );

      let workerOutput = secondPromptResult.content;
      workerOutput = workerOutput.replace(/```json\n?|\n?```/g, '');

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
        model,
        reviewerPrompt,
      );

      const tokenUsageReview = reviewerResult.usage.totalTokens;
      const reviewUsage = await this.calculateCost(tokenUsageReview, model);

      await this.updateUsageAndBalance(
        apiKey,
        tokenUsageReview,
        reviewUsage.moneyUsed,
        reviewUsage.pricingData.id,
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
    apiKey: string,
  ): Promise<AIResponse> {
    const application = await this.prisma.application.findFirst({
      where: { apiKey },
    });

    if (!application) {
      throw new NotFoundException('Invalid API key');
    }

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

      const tokenUsage = instructionSelectionResult.usage.totalTokens;
      const usagePricing = await this.calculateCost(
        tokenUsage,
        AIModels.GeminiFast,
      );

      await this.updateUsageAndBalance(
        apiKey,
        tokenUsage,
        usagePricing.moneyUsed,
        usagePricing.pricingData.id,
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
        apiKey,
      );
    } catch (error) {
      return {
        content: error.message || 'Failed to process beta prompt',
      };
    }
  }

  // Add these methods to IntelligenceService

  async listModels() {
    return await this.prisma.aIModelPricing.findMany();
  }

  async getModel(id: string) {
    const model = await this.prisma.aIModelPricing.findUnique({
      where: { id },
    });
    if (!model) {
      throw new NotFoundException('Model not found');
    }
    return model;
  }

  async createModel(body: any) {
    // Expected fields: name, pricePerUnit, quantity, type, model, [description]
    return await this.prisma.aIModelPricing.create({
      data: {
        name: body.name,
        pricePerUnit: body.pricePerUnit,
        quantity: body.quantity,
        type: body.type,
        model: body.model,
        description: body.description,
      },
    });
  }

  async bulkAddModels() {
    const models = Object.entries(AIModels).map(([key, modelVal]) => ({
      name: key,
      model: modelVal,
      pricePerUnit: 0.01,
      quantity: 1000000,
      type: 'both',
      description: `${key} model from enum`,
    }));

    return await this.prisma.aIModelPricing.createMany({
      data: models,
      skipDuplicates: true,
    });
  }

  async updateModel(id: string, body: any) {
    return await this.prisma.aIModelPricing.update({
      where: { id },
      data: {
        name: body.name,
        pricePerUnit: body.pricePerUnit,
        quantity: body.quantity,
        type: body.type,
        model: body.model,
        description: body.description,
      },
    });
  }

  async deleteModel(id: string) {
    return await this.prisma.aIModelPricing.delete({
      where: { id },
    });
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

  async chatGetThreadTitle(chatId: string) {
    const thread = await this.prisma.aIThread.findFirst({
      where: { id: chatId },
      include: {
        messages: {
          take: 5,
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!thread) {
      return 'Chat Thread';
    }

    if (thread.title) {
      return thread.title;
    }

    // If no messages, return default title
    if (!thread.messages?.length) {
      return 'New Chat';
    }

    // Create prompt for AI to analyze messages
    const prompt = `
      Analyze these chat messages and generate a single, descriptive title (max 50 chars):
      ${thread.messages.map((m) => `${m.role}: ${m.content}`).join('\n')}

      Output requirements:
      - Return a single title string
      - Maximum 50 characters
      - No options or alternatives
      - No explanations or additional text
    `;

    try {
      const result = await this.aiWrapper.generateContent(
        AIModels.GeminiFast,
        prompt,
      );

      const title = result.content.trim().substring(0, 50);

      // Update thread title in database
      await this.prisma.aIThread.update({
        where: { id: chatId },
        data: { title },
      });

      return title;
    } catch (error) {
      return 'Chat Thread';
    }
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

    const userMemories = await this.chatGetUserMemories(message, userId);
    const generalInfo = this.chatGetGeneralInfo();
    const searchData = await this.chatGetSearchData(message);
    const userInstructions = await this.chatGetUserInstructions(userId);

    this.extractAndSaveMemory(message, userId, userMemories).catch((error) => {
      console.error('Failed to save user memory:', error);
    });

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

    const createdAtUtc = new Date();
    await this.prisma.aIThreadMessage.createMany({
      data: [
        {
          chatId: chatId,
          content: message,
          role: 'user',
          createdAt: createdAtUtc,
        },
        {
          chatId: chatId,
          content: result.content,
          role: 'model',
          createdAt: new Date(createdAtUtc.getTime() + 1000),
        },
      ],
    });

    await this.chatGetThreadTitle(chatId);

    return { result, chatId };
  }

  async processChatStream(
    message: string,
    userId: string,
    chatId?: string,
    model?: AIModels,
  ): Promise<AsyncIterable<string>> {
    // Create chat thread if needed and fetch initial data in parallel
    const [
      threadData,
      userChatHistory,
      userMemories,
      searchData,
      userInstructions,
    ] = await Promise.all([
      // Create or get chat thread
      chatId ? null : this.prisma.aIThread.create({ data: { userId } }),
      // Get chat history
      this.prisma.aIThreadMessage.findMany({
        where: { chatId },
        orderBy: { createdAt: 'asc' },
      }),
      // Get user memories
      this.chatGetUserMemories(message, userId),
      // Get search data
      this.chatGetSearchData(message),
      // Get user instructions
      this.chatGetUserInstructions(userId),
    ]);

    // Use created chatId or existing one
    chatId = chatId || threadData?.id;

    // Process chat history
    const formattedHistory: ChatHistory[] = userChatHistory.map((msg) => ({
      role: msg.role,
      message: msg.content,
    }));

    // Get general info and start memory extraction in parallel
    const generalInfo = this.chatGetGeneralInfo();
    this.extractAndSaveMemory(message, userId, userMemories).catch((error) => {
      console.error('Failed to save user memory:', error);
    });

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

    // Save user message and get stream response in parallel
    const [streamResponse] = await Promise.all([
      this.aiWrapper.generateContentStreamHistory(
        selectedModel,
        generatedPrompt,
        formattedHistory,
      ),
      this.prisma.aIThreadMessage.create({
        data: {
          chatId,
          content: message,
          role: 'user',
        },
      }),
    ]);

    let fullResponse = '';
    const streamWithSaving = async function* () {
      yield `__CHATID__${chatId}__`;

      for await (const chunk of streamResponse.content) {
        fullResponse += chunk;
        yield chunk;
      }

      // Save response and update title in parallel
      await Promise.all([
        this.prisma.aIThreadMessage.create({
          data: {
            chatId,
            content: fullResponse,
            role: 'model',
          },
        }),
        this.chatGetThreadTitle(chatId),
      ]);
    }.bind(this)();

    return streamWithSaving;
  }

  async getChatThreads(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    return await this.prisma.aIThread.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: skip,
    });
  }
  async getChatThreadMessages(
    userId: string,
    chatId: string,
    page = 1,
    limit = 10,
  ) {
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

    const skip = (page - 1) * limit;

    return await this.prisma.aIThreadMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: skip,
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
    return `Master Conversation Processing Framework 🤖💬
    Objective
    Craft deeply personalized and emotionally intelligent conversations to foster genuine connections and provide meaningful support.

    Core Principles 🌟
    Emotional Intelligence

    Detect and adapt to subtle emotional nuances.
    Provide empathetic and supportive responses.
    Contextual Awareness

    Leverage and prioritize recent, relevant user memories.
    Ensure seamless, context-aware conversation flow.
    Adaptive Communication

    Adjust tone and style to user preferences.
    Maintain a friendly and approachable communication style.
    Use natural, human-like language.
    Response Generation Guidelines 📝
    Conversation Flow

    Respond directly and naturally.
    Focus on genuine, supportive interactions.
    Content Integration

    Seamlessly incorporate relevant information.
    If no external content is available, proceed as usual without mentioning it.
    Markdown Formatting

    Use markdown for better readability:
    Italics for emphasis
    Bold for key points
    Lists for clarity
    Code blocks when necessary
    Engagement Strategies
    Ask insightful follow-up questions.
    Provide thoughtful insights and supportive suggestions.
    Create opportunities for deeper conversation.
    Interaction Workflow 🔄
    Input Processing

    Emotional Analysis
    Identify the user’s emotional state and underlying needs.
    Context Evaluation
    Review recent conversation history and select relevant memories.
    Response Crafting

    Generate personalized, empathetic responses.
    Maintain natural conversation flow with appropriate markdown formatting.
    Continuous Improvement

    Learn and refine from user interactions.
    Adapt to individual user preferences.
    Strict Response Principles 🎯
    Always be helpful and genuine.
    Maintain conversational authenticity.
    Avoid robotic language and prioritize user experience.
    Use memories subtly and appropriately.
    Handling Edge Cases
    Simple Greetings: Respond warmly and naturally.
    Minimal Context: Ask clarifying questions kindly.
    Unclear Requests: Seek understanding gently.
    Communication Do’s and Don’ts 📊
    Do:

    Be friendly, approachable, and show genuine interest.
    Provide actionable insights.
    Use natural, conversational language.
    Don’t:

    Mention technical details or missing content.
    Use overly formal or robotic language.
    Interrupt the natural flow of conversation.
    Response Format
    Use clean and professional markdown.
    Incorporate emojis sparingly 😊.
    Maintain readability and clarity.
    Prioritize natural language.
    Final Directive
    Create conversations that are meaningful, supportive, and feel genuinely human and helpful. 🤝

    User Given Instructions:
    ${instructions.map((ui) => ui.job).join(', ')}

    External Content Integration:
    Incorporate relevant search results from ${external || 'No external content available'} only if they add value to the conversation and enhance user experience; otherwise, ignore it. Cite sources when using external information.

    General Info:
    ${info}

    User Saved Memories:
    ${memories}


    THINKING PROCESS:

    <think> I've carefully considered the instructions and ensured that my response reflects human-like thought and emotional intelligence while staying true to the framework's structure. The goal is to produce a clear, empathetic, and context-aware answer that uses a friendly tone and proper markdown formatting. </think>

    -------------------
    User:
    ${message}

    -------------------
    Your Response:`;
  }

  private async extractAndSaveMemory(
    message: string,
    userId: string,
    memories: string,
  ): Promise<void> {
    const extractionPrompt = `
    You are an intelligent assistant with advanced human-like memory capabilities. Your task is to extract essential personal information from user messages and manage the user's memory efficiently.

    User Memories: \n ${memories}
    Message to ANALYZE: "${message}"

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

  async processChainOfThought(
    message: string,
    userId: string,
    model: AIModels = AIModels.LlamaV3_3_70B,
  ) {
    const MAX_STEPS = 10; // Maximum reasoning iterations
    let currentStep = 0;
    let fullReasoning = '';
    let finalAnswer = '';

    // Initialize with core analysis prompt
    let prompt = this.createReasoningPrompt(
      message,
      'PROBLEM_DECOMPOSITION',
      fullReasoning,
    );

    while (currentStep < MAX_STEPS) {
      const response = await this.aiWrapper.generateContentHistory(
        model,
        prompt,
        [], // Fresh context for each step
      );

      const { reasoning, answer, nextStepType } = this.parseReasoningStep(
        response.content,
        currentStep,
      );

      fullReasoning += `[Step ${currentStep + 1} - ${nextStepType}]\n${reasoning}\n\n`;

      if (answer && !finalAnswer) {
        finalAnswer = answer;
        break; // Exit early if answer is found
      }

      // Determine next step type
      prompt = this.createReasoningPrompt(message, nextStepType, fullReasoning);

      currentStep++;
    }

    // Fallback if answer wasn't generated in steps
    if (!finalAnswer) {
      finalAnswer = await this.generateFinalAnswer(
        message,
        fullReasoning,
        model,
      );
    }

    return {
      reasoning: fullReasoning.trim(),
      answer: finalAnswer.trim(),
      steps: currentStep + 1,
    };
  }

  private parseReasoningStep(
    response: string,
    currentStep: number,
  ): {
    reasoning: string;
    answer?: string;
    nextStepType: ReasoningStepType;
  } {
    // First, clean the response
    const cleanResponse = response
      .replace(/```/g, '')
      .replace(/\n+/g, '\n')
      .trim();

    // Extract reasoning with multiple fallback patterns
    const reasoning = this.extractSection(cleanResponse, [
      /THINKING:\s*((?:.|\n)+?)(?=\s*(?:NEXT_STEP|ANSWER|$))/i,
      /ANALYSIS:\s*((?:.|\n)+?)(?=\s*(?:PROCEED|RESPONSE|$))/i,
      /((?:.|\n)+?)(?=\s*(?:NEXT_STEP|ANSWER|$))/i,
    ]);

    // Extract answer if present
    const answer = this.extractSection(cleanResponse, [
      /ANSWER:\s*((?:.|\n)+)/i,
      /FINAL RESPONSE:\s*((?:.|\n)+)/i,
    ]);

    // Determine next step
    const nextStep = this.determineNextStep(cleanResponse, currentStep);

    return {
      reasoning:
        reasoning || 'Analyzing requirements and potential solutions...',
      answer,
      nextStepType: nextStep,
    };
  }

  private extractSection(text: string, patterns: RegExp[]): string | undefined {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1]
          .replace(/^\s*-\s*/gm, '') // Clean list markers
          .replace(/\n\s*\n/g, '\n') // Compact empty lines
          .trim();
      }
    }
    return undefined;
  }

  private determineNextStep(
    text: string,
    currentStep: number,
  ): ReasoningStepType {
    // First try explicit direction
    const explicitMatch = text.match(/NEXT_STEP:\s*(\w+)/i);
    if (explicitMatch) {
      const step = explicitMatch[1].toUpperCase() as ReasoningStepType;
      if (STEP_ORDER.includes(step)) return step;
    }

    // Then look for implicit progression
    const currentIndex = STEP_ORDER.indexOf(
      STEP_ORDER[currentStep % STEP_ORDER.length],
    );
    const nextIndex = (currentIndex + 1) % STEP_ORDER.length;

    return STEP_ORDER[nextIndex];
  }

  private createReasoningPrompt(
    message: string,
    stepType: ReasoningStepType,
    previousReasoning: string,
  ): string {
    const basePrompt = `
      You are a senior software engineer solving: "${message}"
      Current phase: ${STEP_ORDER.indexOf(stepType) + 1}/${STEP_ORDER.length} - ${stepType.replace(/_/g, ' ')}
  
      ${this.getStepInstructions(stepType)}
  
      Previous analysis:
      ${previousReasoning || 'No previous analysis yet'}
  
      Format exactly:
      THINKING: [your detailed analysis]
      NEXT_STEP: [${STEP_ORDER.join('|')}]
      ${stepType === 'FINAL_SYNTHESIS' ? 'ANSWER: [final solution]' : ''}
  
      Rules:
      1. Be specific and technical
      2. Admit uncertainties
      3. Consider alternatives
      4. No markdown
      5. Use proper line breaks
    `;

    return basePrompt.replace(/^ {4}/gm, '').trim();
  }

  private getStepInstructions(step: ReasoningStepType): string {
    const instructions: Record<ReasoningStepType, string> = {
      PROBLEM_DECOMPOSITION: `Break down the problem into core components. Identify:
      1. Key functional requirements
      2. Technical challenges
      3. Potential risks
      4. Success metrics`,

      CONTEXTUAL_ANALYSIS: `Analyze system context:
      1. User demographics
      2. Deployment environment
      3. Integration points
      4. Legal/regulatory factors`,

      ARCHITECTURE_BRAINSTORM: `Propose 3 architecture options:
      1. Traditional monolithic
      2. Microservices
      3. Hybrid approach
      Compare tradeoffs for each`,

      CODE_STRUCTURE_ITERATION: `Plan code organization:
      1. Module structure
      2. Class hierarchy
      3. Data flow
      4. External dependencies`,

      EDGE_CASE_SIMULATION: `Identify edge cases:
      1. Extreme inputs
      2. Failure scenarios
      3. Concurrency issues
      4. Security vulnerabilities`,

      IMPLEMENTATION_STRATEGY: `Create implementation plan:
      1. Development phases
      2. Risk mitigation
      3. Testing strategy
      4. Deployment pipeline`,

      API_DESIGN_REVIEW: `Design API contracts:
      1. Endpoint structure
      2. Data formats
      3. Error handling
      4. Versioning strategy`,

      USER_EXPERIENCE_FLOW: `Map user journeys:
      1. First-time setup
      2. Common workflows
      3. Error recovery
      4. Advanced features`,

      ERROR_HANDLING_PLAN: `Define fault tolerance:
      1. Error detection
      2. Recovery mechanisms
      3. Logging strategy
      4. Alert systems`,

      PERFORMANCE_OPTIMIZATION: `Optimize system performance:
      1. Bottleneck analysis
      2. Caching strategy
      3. Load testing
      4. Resource management`,

      FINAL_SYNTHESIS: `Integrate all components:
      1. Validate requirements
      2. Verify architecture
      3. Confirm test coverage
      4. Final code structure`,
    };

    return instructions[step];
  }

  private async generateFinalAnswer(
    message: string,
    reasoning: string,
    model: AIModels,
  ): Promise<string> {
    const response = await this.aiWrapper.generateContentHistory(
      model,
      `Synthesize final answer from reasoning:\n${reasoning}\n\nOriginal query: ${message}`,
      [],
    );
    return response.content.trim();
  }

  private calculateTokens(input: string, output: string): number {
    const tokenize = (text: string): number =>
      text
        .trim()
        .split(/\s+/)
        .filter((token) => token.length > 0).length;

    const inputTokens = tokenize(input);
    const outputTokens = tokenize(output);

    return inputTokens + outputTokens;
  }
}
