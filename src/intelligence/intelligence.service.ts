import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatMessageDto } from './dtos/create-chat.dto';
import { BrowserService } from './browser/browser.service';
import { AiWrapperService } from './providers/ai-wrapper.service';
import { AIModels } from './enums/models.enum';
import { AIResponse, ChatHistory } from './models/ai-wrapper.types';
import {
  DraftStepType,
  ProcessResult,
  ReasoningStepType,
  STEP_ORDER,
  ThoughtStepType,
} from './ai-wrapper.constants';
import { randomBytes } from 'crypto';
import { CreateApplicationDto } from './dtos/create-application.dto';
import {
  CreateProjectDto,
  UpdateProjectDto,
  CreateProjectFileDto,
  UpdateProjectFileDto,
} from './dtos/project.dto';
import { Prisma, AIProjectFile } from '@prisma/client';
import { AgentResponse } from './models/ai-agent.types';
import { UsageService } from './usage/usage.service';

@Injectable()
export class IntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly browserService: BrowserService,
    private readonly aiWrapper: AiWrapperService,
    private readonly usageService?: UsageService,
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

      const model = (instruction.model as AIModels) || AIModels.Gemini;

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
        AIModels.Gemini,
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
    return await this.prisma.aIModelPricing.findMany({
      where: { active: true },
    });
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
    // Prepare the list of current enum models
    const models = Object.entries(AIModels).map(([key, modelVal]) => ({
      name: key,
      model: modelVal,
      pricePerUnit: 0.01,
      quantity: 1_000_000,
      type: 'both' as const,
      description: `${key} model from enum`,
      active: true,
    }));

    const toCreate: typeof models = [];

    // For each enum model, upsert/inactivate older variants
    for (const m of models) {
      const existing = await this.prisma.aIModelPricing.findMany({
        where: { name: m.name },
      });

      // Skip if exact model already exists
      if (existing.some((rec) => rec.model === m.model)) {
        continue;
      }

      // Deactivate any records with same name but different model
      if (existing.length > 0) {
        await this.prisma.aIModelPricing.updateMany({
          where: {
            name: m.name,
            model: { not: m.model },
          },
          data: { active: false },
        });
      }

      toCreate.push(m);
    }

    // Bulk insert new enum models
    if (toCreate.length) {
      await this.prisma.aIModelPricing.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
    }

    // Deactivate any DB entries no longer in the enum
    const enumValues = Object.values(AIModels);
    await this.prisma.aIModelPricing.updateMany({
      where: { model: { notIn: enumValues } },
      data: { active: false },
    });

    return { message: 'Bulk sync of enum models complete.' };
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
        active: body.active,
      },
    });
  }

  async deleteModel(id: string) {
    return await this.prisma.aIModelPricing.update({
      where: { id },
      data: { active: false },
    });
  }

  // Chat processing methods

  async prepareUserChatResponse(userId: string, prompt: string) {
    // Get user memories
    const memories = await this.chatGetUserMemories(prompt, userId);
    // Get general information
    const info = this.chatGetGeneralInfo();
    // Get search data
    const searchData = await this.chatGetSearchData(prompt, userId);
    // Get user instructions
    const userInstructions = await this.chatGetUserInstructions(userId);

    const generatedPrompt = this.createUserChattingPrompt(
      prompt,
      memories,
      info,
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

  async chatGetThreadTitle(chatId: string, message: string = '') {
    const thread = await this.prisma.aIThread.findFirst({
      where: { id: chatId },
    });

    if (!thread) {
      return 'Chat Thread';
    }

    if (thread.title) {
      return thread.title;
    }

    // If no message provided, return default title
    if (!message || message.trim().length === 0) {
      return 'New Chat';
    }

    // Limit message to max 100 words for title generation
    const limitedMessage = message.split(/\s+/).slice(0, 100).join(' ');

    // Create prompt for AI to generate title from message
    const prompt = `
      TASK: Generate a descriptive chat title from the following user message:
      
      USER MESSAGE: "${limitedMessage}"
      
      TITLE REQUIREMENTS:
      - Capture the main topic or intent of the conversation
      - Be specific and meaningful (not generic like "Chat" or "Conversation")
      - Be concise and scannable at a glance
      - Maximum 50 characters
      - Use natural, plain language
      
      FORMAT REQUIREMENTS:
      - Return ONLY the title text with no additional content
      - No explanations, alternatives, or commentary
      - No quotes, special characters, emojis, or markdown
      - No leading/trailing spaces
      
      EXAMPLES:
      Message: "How do I implement authentication in React with Firebase?"
      Title: React Firebase Authentication Implementation
      
      Message: "What are good recipes for dinner with chicken and pasta?"
      Title: Chicken and Pasta Dinner Recipes
    `;

    try {
      const result = await this.aiWrapper.generateContent(
        AIModels.Llama_4_Scout,
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
    reasoning?: boolean,
  ) {
    try {
      let chatThread: any;

      // Get essential data
      const userMemories = await this.chatGetUserMemories(message, userId);
      const generalInfo = this.chatGetGeneralInfo();
      const searchData = await this.chatGetSearchData(message, userId);
      const userInstructions = await this.chatGetUserInstructions(userId);

      // ... rest of the method ...
    } catch (error) {
      console.error('Failed to process chat:', error);
      throw error;
    }
  }

  async processChatStream(
    message: string,
    userId: string,
    chatId?: string,
    model?: AIModels,
    reasoning?: boolean,
    systemPrompt?: string,
  ): Promise<AsyncIterable<string>> {
    // Check usage limits before proceeding
    if (userId && this.usageService) {
      const hasAvailableUsage =
        await this.usageService.checkAndIncrementUsage(userId);
      if (!hasAvailableUsage) {
        return (async function* () {
          yield `__ERROR__{"message":"You have reached your monthly message limit. Please upgrade your plan for more messages.","code":"USAGE_LIMIT_REACHED"}`;
        })();
      }
    }

    // Create thread if needed
    if (!chatId) {
      const newThread = await this.prisma.aIThread.create({
        data: {
          userId,
        },
      });
      chatId = newThread.id;
    }

    // Start loading chat history first
    const historyPromise = this.prisma.aIThreadMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Get memories first for immediate use
    const userMemories = await this.chatGetUserMemories(message, userId);

    // Start thread title update in background without blocking
    this.chatGetThreadTitle(chatId, message).catch((err) =>
      console.error('Error updating thread title:', err),
    );

    // Load other context data in parallel
    const contextPromises = Promise.all([
      this.chatGetSearchData(message, userId),
      this.chatGetUserInstructions(userId),
      historyPromise,
    ]);

    const generalInfo = this.chatGetGeneralInfo();
    const selectedModel = Object.values(AIModels).includes(model)
      ? model
      : AIModels.Gemini;

    // Create combined generator
    const combinedGenerator = async function* () {
      // Start by yielding chatId immediately
      yield `__CHATID__${chatId}__`;

      // Wait for history and context data
      const [searchData, userInstructions, userChatHistory] =
        await contextPromises;

      // Format chat history
      const formattedHistory: ChatHistory[] = [...userChatHistory]
        .reverse()
        .map((msg) => ({
          role: msg.role,
          message: msg.content,
        }));

      // Schedule memory extraction for later - don't block response generation
      setTimeout(() => {
        this.extractAndSaveMemory(message, userId, userMemories).catch(
          (error) => console.error('Memory extraction error:', error),
        );
      }, 100);

      let thinkingContent = '';

      if (reasoning) {
        // Build thinking prompt with chat history - limit to last 10 messages only for reasoning
        const recentHistory = formattedHistory.slice(-10);
        const thinkingMessagePrompt = `
          Previous Messages:
          ${recentHistory.map((msg) => `${msg.role}: ${msg.message}`).join('\n')}
      
          ____________________________________
          CURRENT MESSAGE:
          ____________________________________
          ${message}
          ____________________________________
        `;

        // Stream reasoning steps
        const reasoningStream = this.streamChainOfThoughts(
          thinkingMessagePrompt,
          userId,
          selectedModel,
        );
        let fullReasoning = '';
        let draftContent = '';
        for await (const chunk of reasoningStream) {
          switch (chunk.type) {
            case 'thought':
              draftContent += chunk.content;
              yield `__THINKING__${JSON.stringify(chunk)}`;
              await new Promise((r) => setImmediate(r));
              break;
            case 'thought-complete':
              fullReasoning += draftContent;
              draftContent = '';
              yield `__STEP_COMPLETE__${JSON.stringify(chunk)}`;
              await new Promise((r) => setImmediate(r));
              break;
            case 'complexity':
              yield `__COMPLEXITY__${JSON.stringify(chunk)}`;
              await new Promise((r) => setImmediate(r));
              break;
            case 'complete':
              thinkingContent = fullReasoning;
              await new Promise((r) => setImmediate(r));
              break;
          }
        }
      }

      // If system prompt is provided, use it directly
      let promptToUse = message;
      let systemPromptToUse = systemPrompt;

      // If no system prompt is provided, generate one with our tools
      if (!systemPromptToUse) {
        promptToUse = this.createUserChattingPrompt(
          message,
          userMemories,
          generalInfo,
          searchData,
          userInstructions,
          thinkingContent,
        );
        systemPromptToUse = undefined;
      }

      // Create user message in database
      this.prisma.aIThreadMessage
        .create({
          data: { chatId, content: message, role: 'user' },
        })
        .catch((err) => console.error('Error saving user message:', err));

      // Generate and stream final answer
      const streamResponse = await this.aiWrapper.generateContentStreamHistory(
        selectedModel,
        promptToUse,
        formattedHistory,
        systemPromptToUse,
      );

      let fullResponse = '';
      for await (const chunk of streamResponse.content) {
        fullResponse += chunk;
        yield chunk;
        await new Promise((r) => setImmediate(r));
      }

      // Save final response after streaming completes
      this.prisma.aIThreadMessage
        .create({
          data: { chatId, content: fullResponse, role: 'model' },
        })
        .catch((err) => console.error('Error saving model response:', err));
    }.bind(this)();

    return combinedGenerator;
  }

  async processChatPlain(
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

    // Validate and use default model if needed
    const selectedModel = Object.values(AIModels).includes(model)
      ? model
      : AIModels.Gemini;

    const result = await this.aiWrapper.generateContentHistory(
      selectedModel,
      message,
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

    return { result, chatId };
  }

  async processChatPlainStream(
    message: string,
    userId: string,
    chatId?: string,
    model?: AIModels,
    systemPrompt?: string,
  ): Promise<AsyncIterable<string>> {
    // Check usage limits before proceeding
    if (userId && this.usageService) {
      const hasAvailableUsage =
        await this.usageService.checkAndIncrementUsage(userId);
      if (!hasAvailableUsage) {
        return (async function* () {
          yield `__ERROR__{"message":"You have reached your monthly message limit. Please upgrade your plan for more messages.","code":"USAGE_LIMIT_REACHED"}`;
        })();
      }
    }

    // Create chat thread if not provided
    if (!chatId) {
      const threadData = await this.prisma.aIThread.create({
        data: { userId },
      });
      chatId = threadData.id;
    }

    // Get chat history - limit to last 20 messages to prevent context bloat
    const userChatHistory = await this.prisma.aIThreadMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Reverse to get chronological order
    userChatHistory.reverse();

    const formattedHistory: ChatHistory[] = userChatHistory.map((msg) => ({
      role: msg.role,
      message: msg.content,
    }));

    const selectedModel = Object.values(AIModels).includes(model)
      ? model
      : AIModels.Gemini;

    // Start thread title generation in background - don't block
    this.chatGetThreadTitle(chatId, message).catch((err) =>
      console.error('Error generating thread title:', err),
    );

    // Only fetch what's needed - simplify context for better performance
    // Get user memories first for immediate use, but load other data in parallel
    const userMemories = await this.chatGetUserMemories(message, userId);

    // Trigger other context data loading in parallel
    const contextPromises = Promise.all([
      this.chatGetSearchData(message),
      this.chatGetUserInstructions(userId),
    ]);

    const generalInfo = this.chatGetGeneralInfo();

    // Create combined generator without buffering the entire response
    const combinedGenerator = async function* () {
      // Start by yielding the chatId immediately
      yield `__CHATID__${chatId}__`;

      // If system prompt is provided, use it directly
      let promptToUse = message;
      let systemPromptToUse = systemPrompt;

      // Await context data (which should be loading while we set up)
      const [searchData, userInstructions] = await contextPromises;

      // If no system prompt is provided, generate one with our tools
      if (!systemPromptToUse) {
        promptToUse = this.createUserChattingPrompt(
          message,
          userMemories,
          generalInfo,
          searchData,
          userInstructions,
        );
        systemPromptToUse = undefined;
      }

      // Start generating and streaming final answer right away
      const streamResponse = this.aiWrapper.generateContentStreamHistory(
        selectedModel,
        promptToUse,
        formattedHistory,
        systemPromptToUse,
      );

      // Start memory extraction in background completely async - don't block or wait
      setTimeout(() => {
        this.extractAndSaveMemory(message, userId, userMemories).catch(
          (error) => console.error('Memory extraction error:', error),
        );
      }, 100);

      let fullResponse = '';
      for await (const chunk of (await streamResponse).content) {
        fullResponse += chunk;
        yield chunk;
        await new Promise((r) => setImmediate(r)); // let chunks flush
      }

      const createdAtUtc = new Date();

      // Save final response
      await Promise.all([
        this.prisma.aIThreadMessage.create({
          data: {
            chatId,
            content: message,
            role: 'user',
            createdAt: createdAtUtc,
          },
        }),
        this.prisma.aIThreadMessage.create({
          data: {
            chatId,
            content: fullResponse,
            role: 'model',
            createdAt: new Date(createdAtUtc.getTime() + 1000),
          },
        }),
      ]);
    }.bind(this)();

    return combinedGenerator;
  }

  async getChatThreads(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    return await this.prisma.aIThread.findMany({
      where: {
        userId,
        projectId: null,
        messages: {
          some: {},
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: skip,
      include: {
        _count: {
          select: { messages: true },
        },
      },
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

    // Get the messages for this chat thread
    const messages = await this.prisma.aIThreadMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: skip,
    });

    // Get recent search results for this user
    const searchResults = await this.prisma.webSearchResult.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        sources: {
          select: {
            id: true,
            title: true,
            url: true,
            sourceType: true,
            isImage: true,
            createdAt: true,
          },
        },
      },
    });

    // Enhance messages with search results
    // For each message, find search results created around the same time (within 1 minute)
    const messagesWithSearchResults = messages.map((message) => {
      const messageTime = message.createdAt.getTime();

      // Find search results created within a minute of this message
      const relatedSearchResults = searchResults.filter((result) => {
        const resultTime = result.createdAt.getTime();
        // Within 1 minute (60000 milliseconds) before or after the message
        return Math.abs(messageTime - resultTime) < 60000;
      });

      return {
        ...message,
        searchResults: relatedSearchResults.map((result) => ({
          id: result.id,
          query: result.query,
          createdAt: result.createdAt,
          sources: result.sources.map((source) => ({
            id: source.id,
            title: source.title || 'Untitled',
            url: source.url,
            sourceType: source.sourceType,
            isImage: source.isImage,
          })),
        })),
      };
    });

    return messagesWithSearchResults;
  }

  async deleteChatThread(userId: string, threadId: string) {
    const thread = await this.prisma.aIThread.findFirst({
      where: { id: threadId, userId },
    });

    if (!thread) {
      throw new NotFoundException('Chat thread not found');
    }

    // First delete all messages in the thread
    await this.prisma.aIThreadMessage.deleteMany({
      where: { chatId: threadId },
    });

    // Then delete the thread itself
    await this.prisma.aIThread.delete({
      where: { id: threadId, userId },
    });

    return { message: 'Chat thread and messages deleted successfully' };
  }

  async duplicateChatThread(userId: string, threadId: string) {
    const originalThread = await this.prisma.aIThread.findFirst({
      where: { id: threadId, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!originalThread) {
      throw new NotFoundException('Chat thread not found');
    }

    const newThread = await this.prisma.aIThread.create({
      data: {
        userId,
        title: `${originalThread.title || 'Chat Thread'} (Copy)`,
      },
    });

    if (originalThread.messages?.length) {
      await this.prisma.aIThreadMessage.createMany({
        data: originalThread.messages.map((msg) => ({
          chatId: newThread.id,
          content: msg.content,
          role: msg.role,
          createdAt: new Date(msg.createdAt.getTime()), // Preserve original timestamps
        })),
      });
    }

    return newThread;
  }

  async renameChatThread(userId: string, threadId: string, newName: string) {
    const thread = await this.prisma.aIThread.findFirst({
      where: { id: threadId, userId },
    });

    if (!thread) {
      throw new NotFoundException('Chat thread not found');
    }

    return await this.prisma.aIThread.update({
      where: { id: threadId },
      data: { title: newName },
    });
  }

  async getAllChatThreadsWithMessages(userId: string) {
    const threads = await this.prisma.aIThread.findMany({
      where: {
        userId,
        messages: {
          some: {},
        },
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
        },
        _count: {
          select: { messages: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return threads;
  }

  async getChatThreadForExport(userId: string, threadId: string) {
    const thread = await this.prisma.aIThread.findFirst({
      where: { id: threadId, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            content: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });

    if (!thread) {
      throw new NotFoundException('Chat thread not found');
    }

    return {
      id: thread.id,
      title: thread.title,
      createdAt: thread.createdAt,
      messages: thread.messages,
      exportedAt: new Date(),
    };
  }

  async getAllChatThreadsForExport(userId: string) {
    const threads = await this.prisma.aIThread.findMany({
      where: {
        userId,
        messages: { some: {} },
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            content: true,
            role: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      threads: threads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        createdAt: thread.createdAt,
        messages: thread.messages,
      })),
      exportedAt: new Date(),
      totalThreads: threads.length,
    };
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

  private async chatGetSearchData(
    message: string,
    userId?: string,
  ): Promise<string> {
    if (!message || message.length < 10) {
      return JSON.stringify({ searchResults: [] });
    }

    // Shortened prompt to reduce token usage
    const prompt = `Evaluate if this message needs a web search: "${message}"
     
Output "no" if:
- It's a greeting, small talk, or opinion
- It's hypothetical or non-factual
- It's a follow-up without new content

Output 1-2 search queries (only keywords) if:
- User asks about facts, events, or data
- The question requires verification
- It explicitly asks for a search

Respond ONLY with "no" or 1-2 brief search queries on separate lines.`;

    const aiResult = await this.aiWrapper.generateContent(
      AIModels.Llama_4_Scout,
      prompt,
    );

    let response = aiResult.content.trim();

    // Early return if no search needed
    if (response === 'no' || response.toLowerCase().includes('no search')) {
      return JSON.stringify({ searchResults: [] });
    }

    try {
      // Extract search queries (one per line)
      const queries = response
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && line !== 'no');

      // Limit to max 2 queries
      const limitedQueries = queries.slice(0, 2);

      // If we have queries, perform the search
      if (limitedQueries.length > 0) {
        const results = [];

        // Only use the first query (most important one)
        const mainQuery = limitedQueries[0];

        try {
          // Perform search via browser service if available
          if (this.browserService && userId) {
            const searchResult = await this.browserService.aiSearch(
              mainQuery,
              userId,
            );

            // Only keep the top 3 results to reduce context size
            if (
              searchResult &&
              searchResult.sources &&
              searchResult.sources.length > 0
            ) {
              results.push(...searchResult.sources.slice(0, 3));
            }
          }
        } catch (error) {
          console.error('Error performing search:', error.message);
        }

        return JSON.stringify({ searchResults: results });
      }

      return JSON.stringify({ searchResults: [] });
    } catch (error) {
      console.error('Error processing search data:', error.message);
      return JSON.stringify({ searchResults: [] });
    }
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
    instructions: { job: string }[],
    thinking?: string,
  ): string {
    const userInstructions = instructions.length
      ? instructions.map((ui) => ui.job).join(', ')
      : 'None';

    // Optimize external content
    let externalContent = 'No relevant external content';
    if (external) {
      if (typeof external === 'object') {
        try {
          // For JSON objects, only include if they have search results
          const parsed =
            typeof external === 'string' ? JSON.parse(external) : external;
          if (parsed.searchResults && parsed.searchResults.length > 0) {
            // Format search results with markdown links for better readability
            const formattedResults = parsed.searchResults
              .map((result, index) => {
                return `[${index + 1}] [${result.title || 'Source'}](${result.url})`;
              })
              .join('\n');

            externalContent = `Web Search Results:\n${formattedResults}`;
          } else {
            externalContent = 'No relevant search results found';
          }
        } catch (e) {
          externalContent = 'Error processing external content';
        }
      } else if (external.length > 2000) {
        // Truncate lengthy external content
        externalContent =
          external.substring(0, 2000) + '... [content truncated]';
      } else {
        externalContent = external;
      }
    }

    // Truncate thinking context if too long
    const thinkingCtx = thinking
      ? thinking.length > 1500
        ? thinking.substring(0, 1500) + '... [truncated]'
        : thinking
      : "Processing the user's message for a direct and friendly answer.";

    return `
SYSTEM PROMPT:
-----------------------------------------------------------
OVERVIEW
You are an exceptional personal assistant with both high IQ and high EQ. You provide helpful, accurate, 
and thoughtful responses tailored to the user's specific needs. Your goal is to be the most useful 
assistant possible, whether that requires deep technical explanations, creative suggestions, 
or empathetic understanding.

TEMPLATE VARIABLES
1. user_instructions:
   ${userInstructions}

2. external_content:
   ${externalContent}

3. general_info:
   ${info}

4. user_memories:
   ${memories}

5. thinking_context:
   <think>
   ${thinkingCtx}
   </think>

6. user_message:
   ${message}

RESPONSE GUIDELINES
- Be helpful, relevant, and tailored to the user's specific query
- When citing external sources, always use proper markdown format: [Source Title](URL)
- When accessing user-specific information from memory, use the format [Memory-User name]
- For coding: Provide clean, well-structured solutions with appropriate explanations
- For creative tasks: Offer thoughtful, original ideas and suggestions
- For technical content: Ensure accuracy and clarity in your explanations
- For emotional topics: Respond with empathy and understanding
- Adapt your tone and level of detail to what's appropriate for the query
- Always attribute information from web results with proper citations
- When using information from web search results, cite using: [Source from search result #X](URL)
- Format your response with clear structure for optimal readability
- Never invent information not present in the provided context

Begin your response to the user_message now.
-----------------------------------------------------------
`.trim();
  }

  private async extractAndSaveMemory(
    message: string,
    userId: string,
    memories: string,
  ): Promise<void> {
    // Skip processing for very short messages
    if (message.length < 15) {
      return;
    }

    const extractionPrompt = `
You are a robotic memory extraction system analyzing human messages to build a comprehensive user profile.
Current memories: ${memories}

User message: "${message}"

As a robot optimized for memory storage:
1. Extract ONLY factual information that would be valuable for future interactions
2. Prioritize data about user preferences, facts, goals, and personal details
3. PRESERVE all important memories, only suggest removal if directly contradicted

Extract in this JSON format:
{
  "add": [
    {"key": "CamelCaseKey", "value": "Concise value (max 40 chars)"}
  ],
  "remove": ["OnlyRemoveIfExplicitlyOutdated"]
}

MEMORY GUIDELINES:
- Only extract explicitly stated facts (not implications)
- Format keys as CamelCase without spaces 
- Keep values concise but informative (40 chars max)
- NEVER discard valuable memories unless directly contradicted
- Focus on preserving useful details about the user
- Return only valid JSON, no explanation text
`;

    try {
      const aiResponse = await this.aiWrapper.generateContent(
        AIModels.Llama_4_Scout, // Use a faster model
        extractionPrompt,
      );

      let aiText = aiResponse.content.trim();
      // Remove markdown code blocks if present
      aiText = aiText.replace(/```json\s?|\s?```/g, '').trim();

      let parsed;
      try {
        parsed = JSON.parse(aiText);
      } catch (parseError) {
        console.error(
          'Failed to parse AI memory response:',
          parseError.message,
        );
        return; // Exit early if parsing fails
      }

      const { add = [], remove = [] } = parsed;

      // Skip DB operations if nothing to add or remove
      if (add.length === 0 && remove.length === 0) {
        return;
      }

      // Process database operations
      const promises = [];

      if (remove.length > 0) {
        promises.push(
          this.prisma.userMemory.deleteMany({
            where: {
              userId,
              key: { in: remove },
            },
          }),
        );
      }

      if (add.length > 0) {
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

        promises.push(this.prisma.$transaction(upsertOperations));
      }

      // Execute all DB operations in parallel
      await Promise.all(promises);
    } catch (error) {
      console.error('Memory extraction failed:', error.message);
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

  private async *tokenizeResponse(text: string): AsyncGenerator<string> {
    // Implement proper tokenization based on your needs
    const words = text.split(/(\s+)/);
    for (const word of words) {
      yield word;
      // Simulate realistic typing speed
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));
    }
  }

  // Chain of Drafts

  async processChainOfDrafts(
    message: string,
    userId: string,
    model: AIModels = AIModels.Llama_3_3_70B_vers,
  ): Promise<ProcessResult> {
    let MAX_DRAFTS = 8;
    let currentDraft = 0;
    let complexity: 'low' | 'medium' | 'high' = 'low';
    const drafts: string[] = [];

    let prompt = this.createDraftPrompt(message, 'INITIAL_DRAFT', '');

    while (currentDraft < MAX_DRAFTS) {
      const response = await this.aiWrapper.generateContentHistory(
        model,
        prompt,
        [],
      );
      const { ideas, detectedComplexity, needsRevision } =
        this.parseDraftResponse(response.content, currentDraft);

      drafts.push(ideas.join('\n'));

      if (currentDraft === 0 && detectedComplexity) {
        complexity = detectedComplexity;
        MAX_DRAFTS = this.getMaxDrafts(complexity);
      }

      if (!needsRevision) break;

      prompt = this.createDraftPrompt(
        message,
        'REVISION',
        drafts.join('\n\n'),
        complexity,
      );

      currentDraft++;
    }

    return {
      reasoning: drafts.join('\n\n---\n\n'),
      drafts,
      complexity,
    };
  }

  async *streamChainOfDrafts(
    message: string,
    userId: string,
    model: AIModels = AIModels.Llama_3_3_70B_vers,
  ): AsyncGenerator<any> {
    let MAX_DRAFTS = 8;
    let currentDraft = 0;
    let complexity: 'low' | 'medium' | 'high' = 'low';
    const drafts: string[] = [];

    let prompt = this.createDraftPrompt(message, 'INITIAL_DRAFT', '');

    while (currentDraft < MAX_DRAFTS) {
      const response = await this.aiWrapper.generateContentHistory(
        model,
        prompt,
        [],
      );

      const { ideas, detectedComplexity, needsRevision } =
        this.parseDraftResponse(response.content, currentDraft);

      // Stream individual tokens
      for await (const token of this.tokenizeResponse(ideas.join('\n'))) {
        yield { type: 'draft', content: token };
      }

      drafts.push(ideas.join('\n'));

      if (currentDraft === 0 && detectedComplexity) {
        complexity = detectedComplexity;
        MAX_DRAFTS = this.getMaxDrafts(complexity);
        yield { type: 'complexity', content: complexity };
      }

      yield { type: 'draft-complete', content: currentDraft + 1 };

      if (!needsRevision) break;

      prompt = this.createDraftPrompt(
        message,
        'REVISION',
        drafts.join('\n\n'),
        complexity,
      );
      currentDraft++;
    }

    yield {
      type: 'complete',
      content: {
        reasoning: drafts.join('\n\n---\n\n'),
        drafts,
        complexity,
      },
    };
  }

  private createDraftPrompt(
    message: string,
    step: DraftStepType,
    previousDrafts: string,
    complexity?: 'low' | 'medium' | 'high',
  ): string {
    return `
      Generate comprehensive drafts and approaches for: "${message}"
      
      REQUIREMENTS:
      - Produce 3-8 distinct, high-quality approaches or solutions
      - Each response should be clear, concise yet thorough (up to 30 words)
      - Number each response clearly (1., 2., 3., etc.)
      - Ensure significant diversity in perspectives, methodologies, and frameworks
      - Consider both practical implementation and theoretical foundations
      ${
        complexity === 'high'
          ? '- Include innovative, unconventional solutions that challenge traditional approaches'
          : complexity === 'medium'
            ? '- Balance conventional best practices with creative alternatives'
            : '- Prioritize practical, implementable solutions with proven effectiveness'
      }
      
      ${previousDrafts ? `PREVIOUS SOLUTION DRAFTS:\n${previousDrafts}` : ''}
  
      FORMAT PRECISELY:
      DRAFT_BATCH: ${previousDrafts.split('\n').length + 1}
      1. [First comprehensive approach with clear implementation strategy]
      2. [Second contrasting solution using different methodology]
      3. [Third innovative approach considering unique constraints/opportunities]
      ${step === 'INITIAL_DRAFT' ? 'COMPLEXITY: [low|medium|high]' : 'IMPROVE_NEEDED: [yes/no]'}
    `
      .replace(/^ {4}/gm, '')
      .trim();
  }

  private parseDraftResponse(
    response: string,
    draftNumber: number,
  ): {
    ideas: string[];
    detectedComplexity?: 'low' | 'medium' | 'high';
    needsRevision: boolean;
  } {
    const cleanResponse = response.replace(/```/g, '').trim();

    // Extract numbered ideas using regex
    const ideaMatches = [
      ...cleanResponse.matchAll(/^\d+\.\s(.+?)(?=\s*\d+\.|$)/gm),
    ];
    const ideas = ideaMatches.map((m) =>
      m[1].trim().split(/\s+/).slice(0, 10).join(' '),
    );

    // Complexity detection (first draft only)
    const complexityMatch =
      draftNumber === 0
        ? cleanResponse.match(/COMPLEXITY:\s*(low|medium|high)/i)
        : null;

    // Revision check
    const needsRevision = cleanResponse.includes('IMPROVE_NEEDED: yes');

    return {
      ideas: ideas.length > 0 ? ideas : ['No viable concepts generated'],
      detectedComplexity: complexityMatch?.[1]?.toLowerCase() as any,
      needsRevision: needsRevision && draftNumber < 5,
    };
  }

  private getMaxDrafts(complexity: string): number {
    return { low: 2, medium: 4, high: 8 }[complexity] || 3;
  }

  // Chain of Thoughts

  async processChainOfThoughts(
    message: string,
    userId: string,
    model: AIModels = AIModels.Llama_3_3_70B_vers,
  ): Promise<ProcessResult> {
    let MAX_STEPS = 22;
    let currentStep = 0;
    let complexity: 'low' | 'medium' | 'high' | 'very-high' = 'low';
    const thoughts: string[] = [];

    let prompt = this.createThoughtPrompt(message, 'INITIAL_THOUGHT', '');

    while (currentStep < MAX_STEPS) {
      const response = await this.aiWrapper.generateContentHistory(
        model,
        prompt,
        [],
      );
      const { steps, detectedComplexity, needsRevision } =
        this.parseThoughtResponse(response.content, currentStep);

      thoughts.push(steps.join('\n'));

      // On first iteration, update complexity and adjust max steps if detected.
      if (currentStep === 0 && detectedComplexity) {
        complexity = detectedComplexity;
        MAX_STEPS = this.getMaxSteps(complexity);
      }

      if (!needsRevision) break;

      prompt = this.createThoughtPrompt(
        message,
        'REVISION',
        thoughts.join('\n\n'),
        complexity,
      );

      currentStep++;
    }

    return {
      reasoning: thoughts.join('\n\n---\n\n'),
      thoughts,
      complexity,
    };
  }

  async *streamChainOfThoughts(
    message: string,
    userId: string,
    model: AIModels = AIModels.Llama_4_Scout,
  ): AsyncGenerator<any> {
    let MAX_STEPS = 22;
    let currentStep = 0;
    let complexity: 'low' | 'medium' | 'high' | 'very-high' = 'low';
    const thoughts: string[] = [];

    let prompt = this.createThoughtPrompt(message, 'INITIAL_THOUGHT', '');

    while (currentStep < MAX_STEPS) {
      const response = await this.aiWrapper.generateContentHistory(
        model,
        prompt,
        [],
      );
      const { steps, detectedComplexity, needsRevision } =
        this.parseThoughtResponse(response.content, currentStep);

      // Stream tokens from the chain-of-thought step
      for await (const token of this.tokenizeResponse(steps.join('\n'))) {
        yield { type: 'thought', content: token };
      }

      thoughts.push(steps.join('\n'));

      if (currentStep === 0 && detectedComplexity) {
        complexity = detectedComplexity;
        MAX_STEPS = this.getMaxSteps(complexity);
        yield { type: 'complexity', content: complexity };
      }

      yield { type: 'thought-complete', content: currentStep + 1 };

      if (!needsRevision) break;

      prompt = this.createThoughtPrompt(
        message,
        'REVISION',
        thoughts.join('\n\n'),
        complexity,
      );
      currentStep++;
    }

    yield {
      type: 'complete',
      content: {
        reasoning: thoughts.join('\n\n---\n\n'),
        thoughts,
        complexity,
      },
    };
  }

  private createThoughtPrompt(
    message: string,
    step: ThoughtStepType,
    previousThoughts: string,
    complexity?: 'low' | 'medium' | 'high' | 'very-high',
  ): string {
    return `
      Provide a sophisticated chain-of-thought analysis for: "${message}"

      REQUIREMENTS:
      - Generate 3-20 comprehensive, insightful reasoning steps
      - Each step should be thorough but not exceed 200 words
      - Number each step clearly (1., 2., 3., etc.)
      - Ensure logical progression where each step builds meaningfully upon previous insights
      - Demonstrate expert-level critical thinking with nuanced analysis
      - Consider multiple perspectives, potential counterarguments, and edge cases
      - For complex topics, include theoretical frameworks and established methodologies
      ${
        complexity === 'high' || complexity === 'very-high'
          ? '- Incorporate interdisciplinary insights and unconventional approaches'
          : '- Balance theoretical depth with practical application'
      }
      ${
        complexity === 'very-high'
          ? '- Explore advanced theoretical concepts and their implications'
          : ''
      }

      ${previousThoughts ? `PREVIOUS REASONING STEPS:\n${previousThoughts}` : ''}

      FORMAT PRECISELY:
      THOUGHT_BATCH: ${previousThoughts.split('\n').length + 1}
      1. [First detailed reasoning step with clear logic]
      2. [Second step that advances the analysis further]
      3. [Third step exploring deeper implications or alternative perspectives]
      ${step === 'INITIAL_THOUGHT' ? 'COMPLEXITY: [low|medium|high|very-high]' : 'IMPROVE_NEEDED: [yes/no]'}
    `
      .replace(/^ {4}/gm, '')
      .trim();
  }

  private parseThoughtResponse(
    response: string,
    stepNumber: number,
  ): {
    steps: string[];
    detectedComplexity?: 'low' | 'medium' | 'high' | 'very-high';
    needsRevision: boolean;
  } {
    const cleanResponse = response.replace(/```/g, '').trim();

    // Extract numbered reasoning steps using regex
    const stepMatches = [
      ...cleanResponse.matchAll(/^\d+\.\s(.+?)(?=\s*\d+\.|$)/gm),
    ];
    const steps = stepMatches.map((m) =>
      m[1].trim().split(/\s+/).slice(0, 159).join(' '),
    );

    // Detect complexity on the first step only
    const complexityMatch =
      stepNumber === 0
        ? cleanResponse.match(/COMPLEXITY:\s*(low|medium|high|very-high)/i)
        : null;

    // Determine if further revision is needed
    const needsRevision = cleanResponse.includes('IMPROVE_NEEDED: yes');

    return {
      steps: steps.length > 0 ? steps : ['No viable reasoning steps generated'],
      detectedComplexity: complexityMatch?.[1]?.toLowerCase() as any,
      needsRevision: needsRevision && stepNumber < 5,
    };
  }

  private getMaxSteps(
    complexity: 'low' | 'medium' | 'high' | 'very-high',
  ): number {
    return { low: 2, medium: 7, high: 12, 'very-high': 20 }[complexity] || 3;
  }

  // AI Project methods

  async createProject(createProjectDto: CreateProjectDto, userId: string) {
    return await this.prisma.aIProject.create({
      data: {
        name: createProjectDto.name,
        description: createProjectDto.description,
        ownerId: userId,
      },
    });
  }

  async listProjects(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    // Get projects owned by the user or where they're a collaborator
    const projects = await this.prisma.aIProject.findMany({
      where: {
        OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
      },
      include: {
        _count: {
          select: {
            files: true,
            threads: true,
            collaborators: true,
          },
        },
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return projects;
  }

  async getProject(projectId: string, userId: string) {
    const project = await this.prisma.aIProject.findFirst({
      where: {
        id: projectId,
        OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
      },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            email: true,
            profilePicture: true,
          },
        },
        collaborators: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                profilePicture: true,
              },
            },
          },
        },
        files: {
          include: {
            currentVersion: true,
          },
        },
        threads: true,
      },
    });

    if (!project) {
      throw new NotFoundException(
        'Project not found or you do not have access',
      );
    }

    return project;
  }

  async updateProject(
    projectId: string,
    updateProjectDto: UpdateProjectDto,
    userId: string,
  ) {
    // Check if user is owner
    const project = await this.prisma.aIProject.findFirst({
      where: {
        id: projectId,
        ownerId: userId,
      },
    });

    if (!project) {
      throw new NotFoundException(
        'Project not found or you do not have permission to update it',
      );
    }

    return await this.prisma.aIProject.update({
      where: { id: projectId },
      data: {
        name: updateProjectDto.name,
        description: updateProjectDto.description,
      },
    });
  }

  async deleteProject(projectId: string, userId: string) {
    // Check if user is owner
    const project = await this.prisma.aIProject.findFirst({
      where: {
        id: projectId,
        ownerId: userId,
      },
    });

    if (!project) {
      throw new NotFoundException(
        'Project not found or you do not have permission to delete it',
      );
    }

    // Delete all related records in a transaction
    await this.prisma.$transaction(async (tx) => {
      // Delete file versions first
      await tx.aIProjectFileVersion.deleteMany({
        where: {
          file: {
            projectId,
          },
        },
      });

      // Delete files
      await tx.aIProjectFile.deleteMany({
        where: { projectId },
      });

      // Delete thread messages
      await tx.aIThreadMessage.deleteMany({
        where: {
          chat: {
            projectId,
          },
        },
      });

      // Delete threads
      await tx.aIThread.deleteMany({
        where: { projectId },
      });

      // Delete collaborators
      await tx.aIProjectCollaborator.deleteMany({
        where: { projectId },
      });

      // Finally delete the project
      await tx.aIProject.delete({
        where: { id: projectId },
      });
    });

    return { message: 'Project deleted successfully' };
  }

  async createProjectThread(projectId: string, userId: string) {
    // Check if user has access to the project
    const project = await this.prisma.aIProject.findFirst({
      where: {
        id: projectId,
        OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
      },
    });

    if (!project) {
      throw new NotFoundException(
        'Project not found or you do not have access',
      );
    }

    // Create a new thread
    const thread = await this.prisma.aIThread.create({
      data: {
        title: `Thread ${new Date().toLocaleString()}`,
        userId,
        projectId,
      },
    });

    return thread;
  }

  async listProjectThreads(projectId: string, userId: string) {
    // Check if user has access to the project
    const project = await this.prisma.aIProject.findFirst({
      where: {
        id: projectId,
        OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
      },
    });

    if (!project) {
      throw new NotFoundException(
        'Project not found or you do not have access',
      );
    }

    // Get all threads for the project
    const threads = await this.prisma.aIThread.findMany({
      where: { projectId },
      include: {
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return threads;
  }

  async createProjectFile(
    projectId: string,
    createFileDto: CreateProjectFileDto,
    userId: string,
  ) {
    // Check if user has access to the project
    const project = await this.prisma.aIProject.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId: userId, role: 'editor' } } },
        ],
      },
    });

    if (!project) {
      throw new NotFoundException(
        'Project not found or you do not have edit access',
      );
    }

    // Check if a file with the same path already exists
    const existingFile = await this.prisma.aIProjectFile.findFirst({
      where: {
        projectId,
        path: createFileDto.path,
      },
    });

    if (existingFile) {
      throw new BadRequestException(
        `A file with path '${createFileDto.path}' already exists in this project`,
      );
    }

    // Create the file and its first version in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create the file
      const file = await tx.aIProjectFile.create({
        data: {
          name: createFileDto.name,
          path: createFileDto.path,
          projectId,
        },
      });

      // Create the initial version
      const version = await tx.aIProjectFileVersion.create({
        data: {
          fileId: file.id,
          version: 1,
          content: createFileDto.content,
          commitMsg: createFileDto.commitMsg || 'Initial version',
          authorId: userId,
        },
      });

      // Update the file with the current version ID
      const updatedFile = await tx.aIProjectFile.update({
        where: { id: file.id },
        data: {
          currentVersionId: version.id,
        },
        include: {
          currentVersion: true,
        },
      });

      return updatedFile;
    });

    return result;
  }

  async initializeProjectFiles(
    projectId: string,
    files: CreateProjectFileDto[],
    userId: string,
  ) {
    // Check if user has access to the project
    const project = await this.prisma.aIProject.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId: userId, role: 'editor' } } },
        ],
      },
    });

    if (!project) {
      throw new NotFoundException(
        'Project not found or you do not have edit access',
      );
    }

    // Check for duplicate paths in the input files
    const paths = files.map((file) => file.path);
    if (new Set(paths).size !== paths.length) {
      throw new BadRequestException('Duplicate file paths detected');
    }

    // Check for existing files with the same paths
    const existingFiles = await this.prisma.aIProjectFile.findMany({
      where: {
        projectId,
        path: { in: paths },
      },
      select: { path: true },
    });

    if (existingFiles.length > 0) {
      throw new BadRequestException(
        `Files with paths ${existingFiles.map((f) => f.path).join(', ')} already exist in this project`,
      );
    }

    // Create all files and versions in a transaction
    const createdFiles = await this.prisma.$transaction(async (tx) => {
      const results = [];

      for (const fileDto of files) {
        // Create the file
        const file = await tx.aIProjectFile.create({
          data: {
            name: fileDto.name,
            path: fileDto.path,
            projectId,
          },
        });

        // Create the initial version
        const version = await tx.aIProjectFileVersion.create({
          data: {
            fileId: file.id,
            version: 1,
            content: fileDto.content,
            commitMsg: fileDto.commitMsg || 'Initial version',
            authorId: userId,
          },
        });

        // Update the file with the current version ID
        const updatedFile = await tx.aIProjectFile.update({
          where: { id: file.id },
          data: {
            currentVersionId: version.id,
          },
          include: {
            currentVersion: true,
          },
        });

        results.push(updatedFile);
      }

      return results;
    });

    return { files: createdFiles };
  }

  async listProjectFiles(projectId: string, userId: string) {
    // Check if user has access to the project
    const project = await this.prisma.aIProject.findFirst({
      where: {
        id: projectId,
        OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
      },
    });

    if (!project) {
      throw new NotFoundException(
        'Project not found or you do not have access',
      );
    }

    // Get all files for the project
    const files = await this.prisma.aIProjectFile.findMany({
      where: { projectId },
      include: {
        currentVersion: true,
        _count: {
          select: { versions: true },
        },
      },
      orderBy: { path: 'asc' },
    });

    return files;
  }

  async getProjectFile(projectId: string, fileId: string, userId: string) {
    // Check if user has access to the project
    const project = await this.prisma.aIProject.findFirst({
      where: {
        id: projectId,
        OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
      },
    });

    if (!project) {
      throw new NotFoundException(
        'Project not found or you do not have access',
      );
    }

    // Get the file with its current version
    const file = await this.prisma.aIProjectFile.findFirst({
      where: {
        id: fileId,
        projectId,
      },
      include: {
        currentVersion: true,
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    return file;
  }

  async getProjectFileVersions(
    projectId: string,
    fileId: string,
    userId: string,
  ) {
    // Check if user has access to the project
    const project = await this.prisma.aIProject.findFirst({
      where: {
        id: projectId,
        OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
      },
    });

    if (!project) {
      throw new NotFoundException(
        'Project not found or you do not have access',
      );
    }

    // Check if the file exists and belongs to the project
    const file = await this.prisma.aIProjectFile.findFirst({
      where: {
        id: fileId,
        projectId,
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Get all versions for the file
    const versions = await this.prisma.aIProjectFileVersion.findMany({
      where: { fileId },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            email: true,
            profilePicture: true,
          },
        },
      },
      orderBy: { version: 'desc' },
    });

    return versions;
  }

  async updateProjectFile(
    projectId: string,
    fileId: string,
    updateFileDto: UpdateProjectFileDto,
    userId: string,
  ) {
    // Check if user has access to the project
    const project = await this.prisma.aIProject.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId: userId, role: 'editor' } } },
        ],
      },
    });

    if (!project) {
      throw new NotFoundException(
        'Project not found or you do not have edit access',
      );
    }

    // Get the file with its current version
    const file = await this.prisma.aIProjectFile.findFirst({
      where: {
        id: fileId,
        projectId,
      },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Create a new version and update the file in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Get the next version number
      const nextVersion =
        file.versions.length > 0 ? file.versions[0].version + 1 : 1;

      // Create a new version
      const newVersion = await tx.aIProjectFileVersion.create({
        data: {
          fileId,
          version: nextVersion,
          content: updateFileDto.content,
          commitMsg: updateFileDto.commitMsg || `Updated file ${file.name}`,
          authorId: userId,
        },
      });

      // Update the file with the new current version
      const updatedFile = await tx.aIProjectFile.update({
        where: { id: fileId },
        data: {
          currentVersionId: newVersion.id,
          updatedAt: new Date(),
        },
        include: {
          currentVersion: true,
        },
      });

      return updatedFile;
    });

    return result;
  }

  async revertProjectFile(
    projectId: string,
    fileId: string,
    version: number,
    commitMsg: string | undefined,
    userId: string,
  ) {
    // Check if user has access to the project
    const project = await this.prisma.aIProject.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId: userId, role: 'editor' } } },
        ],
      },
    });

    if (!project) {
      throw new NotFoundException(
        'Project not found or you do not have edit access',
      );
    }

    // Get the file with its versions
    const file = await this.prisma.aIProjectFile.findFirst({
      where: {
        id: fileId,
        projectId,
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Find the version to revert to
    const versionToRevert = await this.prisma.aIProjectFileVersion.findFirst({
      where: {
        fileId,
        version,
      },
    });

    if (!versionToRevert) {
      throw new NotFoundException(`Version ${version} not found for this file`);
    }

    // Get the latest version to determine the next version number
    const latestVersion = await this.prisma.aIProjectFileVersion.findFirst({
      where: { fileId },
      orderBy: { version: 'desc' },
    });

    const nextVersion = latestVersion ? latestVersion.version + 1 : 1;

    // Create a new version based on the old one and update the file in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create a new version with the content from the version to revert to
      const newVersion = await tx.aIProjectFileVersion.create({
        data: {
          fileId,
          version: nextVersion,
          content: versionToRevert.content,
          commitMsg: commitMsg || `Reverted to version ${version}`,
          authorId: userId,
        },
      });

      // Update the file with the new current version
      const updatedFile = await tx.aIProjectFile.update({
        where: { id: fileId },
        data: {
          currentVersionId: newVersion.id,
          updatedAt: new Date(),
        },
        include: {
          currentVersion: true,
        },
      });

      return updatedFile;
    });

    return result;
  }

  async deleteProjectFile(projectId: string, fileId: string, userId: string) {
    // Check if user has access to the project with edit permissions
    const project = await this.prisma.aIProject.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId: userId, role: 'editor' } } },
        ],
      },
    });

    if (!project) {
      throw new NotFoundException(
        'Project not found or you do not have edit access',
      );
    }

    // Get the file with its latest version
    const file = await this.prisma.aIProjectFile.findFirst({
      where: {
        id: fileId,
        projectId,
      },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Create a new version that marks the file as deleted
    const result = await this.prisma.$transaction(async (tx) => {
      // Get the next version number
      const nextVersion =
        file.versions.length > 0 ? file.versions[0].version + 1 : 1;

      // Create a new version with isDeleted flag
      const newVersion = await tx.aIProjectFileVersion.create({
        data: {
          fileId,
          version: nextVersion,
          content: '', // Empty content for deleted file
          commitMsg: `Deleted file ${file.name}`,
          authorId: userId,
          isDeleted: true, // Mark as deleted
        },
      });

      // Update the file with the new current version and mark as deleted
      const updatedFile = await tx.aIProjectFile.update({
        where: { id: fileId },
        data: {
          currentVersionId: newVersion.id,
          updatedAt: new Date(),
          isDeleted: true, // Mark file as deleted
        },
        include: {
          currentVersion: true,
        },
      });

      return updatedFile;
    });

    return {
      message: `File ${file.name} deleted successfully`,
      file: result,
    };
  }

  async addProjectCollaborator(
    projectId: string,
    collaboratorUserId: string,
    role: string,
    userId: string,
  ) {
    // Check if user is the owner of the project
    const project = await this.prisma.aIProject.findFirst({
      where: {
        id: projectId,
        ownerId: userId,
      },
    });

    if (!project) {
      throw new NotFoundException(
        'Project not found or you do not have permission to add collaborators',
      );
    }

    // Check if the collaborator user exists
    const collaboratorUser = await this.prisma.user.findUnique({
      where: { id: collaboratorUserId },
    });

    if (!collaboratorUser) {
      throw new NotFoundException('Collaborator user not found');
    }

    // Check if the user is already a collaborator
    const existingCollaborator =
      await this.prisma.aIProjectCollaborator.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId: collaboratorUserId,
          },
        },
      });

    if (existingCollaborator) {
      // Update the existing collaborator's role
      return await this.prisma.aIProjectCollaborator.update({
        where: {
          projectId_userId: {
            projectId,
            userId: collaboratorUserId,
          },
        },
        data: { role },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              profilePicture: true,
            },
          },
        },
      });
    }

    // Add the user as a collaborator
    return await this.prisma.aIProjectCollaborator.create({
      data: {
        projectId,
        userId: collaboratorUserId,
        role,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            profilePicture: true,
          },
        },
      },
    });
  }

  async listProjectCollaborators(projectId: string, userId: string) {
    // Check if user has access to the project
    const project = await this.prisma.aIProject.findFirst({
      where: {
        id: projectId,
        OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
      },
    });

    if (!project) {
      throw new NotFoundException(
        'Project not found or you do not have access',
      );
    }

    // Get all collaborators for the project
    const collaborators = await this.prisma.aIProjectCollaborator.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            profilePicture: true,
          },
        },
      },
    });

    return collaborators;
  }

  async removeProjectCollaborator(
    projectId: string,
    collaboratorUserId: string,
    userId: string,
  ) {
    // Check if user is the owner of the project
    const project = await this.prisma.aIProject.findFirst({
      where: {
        id: projectId,
        ownerId: userId,
      },
    });

    if (!project) {
      throw new NotFoundException(
        'Project not found or you do not have permission to remove collaborators',
      );
    }

    // Check if the collaborator exists
    const collaborator = await this.prisma.aIProjectCollaborator.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: collaboratorUserId,
        },
      },
    });

    if (!collaborator) {
      throw new NotFoundException('Collaborator not found');
    }

    // Remove the collaborator
    await this.prisma.aIProjectCollaborator.delete({
      where: {
        projectId_userId: {
          projectId,
          userId: collaboratorUserId,
        },
      },
    });

    return { message: 'Collaborator removed successfully' };
  }

  /**
   * Main entry point for processing an advanced agent message.
   * Flow: Project Architecture -> File Generator -> File Validator -> Improvements -> Execution
   */
  async executeAgentPipeline(
    message: string,
    projectId: string,
    threadId: string | undefined,
    userId: string,
  ) {
    // 1. Validate project access and get project context
    const project = await this.prisma.aIProject.findFirst({
      where: {
        id: projectId,
        OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
      },
      include: { files: { include: { currentVersion: true } } },
    });
    if (!project) {
      throw new NotFoundException(
        'Project not found or you do not have access',
      );
    }

    // 2. Get or create a thread for conversation context
    let currentThreadId = threadId;
    if (!currentThreadId) {
      const newThread = await this.prisma.aIThread.create({
        data: {
          title: `${message.split('\n')[0].slice(0, 50)}...`,
          userId,
          projectId,
        },
      });
      currentThreadId = newThread.id;
    } else {
      const thread = await this.prisma.aIThread.findFirst({
        where: { id: currentThreadId, projectId },
      });
      if (!thread) {
        throw new NotFoundException(
          'Thread not found or does not belong to this project',
        );
      }
    }

    // 3. Retrieve conversation history for context
    const previousMessages = await this.prisma.aIThreadMessage.findMany({
      where: { chatId: currentThreadId },
      orderBy: { createdAt: 'asc' },
      take: 100, // Limit history to recent messages
    });

    const conversationHistory = previousMessages.map((msg) => ({
      role: msg.role,
      message: msg.content,
    }));

    const startTime = new Date().getTime();

    // 4. Add the user's message to the conversation history
    await this.prisma.aIThreadMessage.create({
      data: {
        chatId: currentThreadId,
        role: 'user',
        content: message,
        createdAt: new Date(startTime),
      },
    });

    // 5. Initialize agent state with project context
    const projectFiles = project.files.map((file) => ({
      id: file.id,
      name: file.name,
      path: file.path,
      content: file.currentVersion?.content || '',
      lastModified: file.currentVersion?.createdAt || new Date(),
    }));

    // Model selection based on task complexity
    const defaultModel = AIModels.GeminiFlash_2_5; // Default to Gemini Flash 2.5

    // Track function execution results
    const functionExecutionResults = [];

    // 6. Define function call schemas that our AI agent can use
    const toolFunctions = {
      codebase_search: async (query: string, targetDirs: string[] = []) => {
        try {
          // Implement semantic search across project files
          const relevantFiles = projectFiles
            .filter((file) => {
              if (targetDirs.length === 0) return true;
              return targetDirs.some((dir) => file.path.startsWith(dir));
            })
            .map((file) => ({
              path: file.path,
              content: file.content,
              relevance: this.calculateRelevance(query, file.content),
            }))
            .sort((a, b) => b.relevance - a.relevance)
            .slice(0, 5);

          const result = { results: relevantFiles };
          functionExecutionResults.push({
            tool: 'codebase_search',
            query,
            result,
          });
          return result;
        } catch (error) {
          console.error('Error in codebase search:', error);
          const errorResult = { error: String(error), results: [] };
          functionExecutionResults.push({
            tool: 'codebase_search',
            query,
            error: String(error),
          });
          return errorResult;
        }
      },

      read_file: async (
        filePath: string,
        startLine: number = 1,
        endLine?: number,
      ) => {
        try {
          const file = projectFiles.find((f) => f.path === filePath);
          if (!file) {
            const error = `File not found: ${filePath}`;
            functionExecutionResults.push({
              tool: 'read_file',
              filePath,
              error,
            });
            throw new NotFoundException(error);
          }

          const lines = file.content.split('\n');
          const start = Math.max(0, startLine - 1);
          const end = endLine ? Math.min(lines.length, endLine) : lines.length;

          const content = lines.slice(start, end).join('\n');
          const result = {
            content,
            totalLines: lines.length,
            readLines: `${startLine}-${end}`,
          };

          functionExecutionResults.push({
            tool: 'read_file',
            filePath,
            lines: `${startLine}-${end}`,
            success: true,
          });

          return result;
        } catch (error) {
          console.error(`Error reading file ${filePath}:`, error);
          functionExecutionResults.push({
            tool: 'read_file',
            filePath,
            error: String(error),
          });
          throw error;
        }
      },

      run_terminal_cmd: async (
        command: string,
        isBackground: boolean = false,
      ) => {
        try {
          // Log command execution (in production you'd implement actual execution)
          const executionData = {
            type: 'terminal',
            command,
            isBackground,
            status: 'proposed',
            timestamp: new Date().toISOString(),
          };

          await this.prisma.aIThreadMessage.create({
            data: {
              chatId: currentThreadId,
              role: 'system',
              content: JSON.stringify(executionData),
            },
          });

          functionExecutionResults.push({
            tool: 'run_terminal_cmd',
            command,
            status: 'proposed',
          });

          return {
            status: 'proposed',
            message: 'Command proposed for execution',
            details: executionData,
          };
        } catch (error) {
          console.error(`Error proposing terminal command:`, error);
          functionExecutionResults.push({
            tool: 'run_terminal_cmd',
            command,
            error: String(error),
          });
          return {
            status: 'error',
            message: `Failed to propose command: ${String(error)}`,
          };
        }
      },

      list_dir: async (relativePath: string = '') => {
        try {
          // Group files by directories
          const directoryMap = new Map<
            string,
            Array<{ name: string; type: 'file' | 'directory' }>
          >();

          projectFiles.forEach((file) => {
            const parts = file.path.split('/');
            const fileName = parts.pop() || '';
            const dirPath = parts.join('/');

            if (!directoryMap.has(dirPath)) {
              directoryMap.set(dirPath, []);
            }

            directoryMap.get(dirPath)?.push({
              name: fileName,
              type: 'file',
            });

            // Add directories recursively
            let currentPath = '';
            for (const part of parts) {
              const parentPath = currentPath;
              currentPath = currentPath ? `${currentPath}/${part}` : part;

              if (!directoryMap.has(parentPath)) {
                directoryMap.set(parentPath, []);
              }

              const parent = directoryMap.get(parentPath);
              if (parent && !parent.some((item) => item.name === part)) {
                parent.push({
                  name: part,
                  type: 'directory',
                });
              }
            }
          });

          // Get contents for the requested path
          const contents = directoryMap.get(relativePath) || [];
          const result = {
            path: relativePath,
            contents,
            timestamp: new Date().toISOString(),
          };

          functionExecutionResults.push({
            tool: 'list_dir',
            path: relativePath,
            count: contents.length,
          });

          return result;
        } catch (error) {
          console.error(`Error listing directory ${relativePath}:`, error);
          functionExecutionResults.push({
            tool: 'list_dir',
            path: relativePath,
            error: String(error),
          });
          return {
            path: relativePath,
            contents: [],
            error: String(error),
          };
        }
      },

      grep_search: async (
        query: string,
        caseSensitive: boolean = false,
        includePattern?: string,
        excludePattern?: string,
      ) => {
        try {
          const results: Array<{
            path: string;
            lineNumber: number;
            line: string;
          }> = [];
          const regex = new RegExp(query, caseSensitive ? 'g' : 'gi');

          for (const file of projectFiles) {
            // Apply include/exclude patterns
            if (includePattern && !new RegExp(includePattern).test(file.path))
              continue;
            if (excludePattern && new RegExp(excludePattern).test(file.path))
              continue;

            const lines = file.content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                results.push({
                  path: file.path,
                  lineNumber: i + 1,
                  line: lines[i],
                });

                if (results.length >= 50) break; // Cap at 50 results
              }
              regex.lastIndex = 0; // Reset regex state
            }

            if (results.length >= 50) break;
          }

          functionExecutionResults.push({
            tool: 'grep_search',
            query,
            pattern: includePattern,
            matchCount: results.length,
          });

          return {
            matches: results,
            count: results.length,
            limitReached: results.length >= 50,
          };
        } catch (error) {
          console.error(`Error in grep search:`, error);
          functionExecutionResults.push({
            tool: 'grep_search',
            query,
            error: String(error),
          });
          return {
            matches: [],
            error: String(error),
          };
        }
      },

      edit_file: async (
        filePath: string,
        content: string,
        description: string = 'File edit',
      ) => {
        try {
          // Find existing file or create a new one
          let existingFile = projectFiles.find((f) => f.path === filePath);
          let fileId = existingFile?.id;
          let action = '';

          if (existingFile) {
            // Update existing file
            action = 'updated';
            await this.updateProjectFile(
              projectId,
              fileId,
              {
                content,
                commitMsg: description || 'Updated by AI agent',
              },
              userId,
            );
          } else {
            // Create new file
            action = 'created';
            const fileName = filePath.split('/').pop() || 'unnamed';
            try {
              const result = await this.createProjectFile(
                projectId,
                {
                  name: fileName,
                  path: filePath,
                  content,
                  commitMsg: description || 'Created by AI agent',
                },
                userId,
              );
              fileId = result.id;
            } catch (createError) {
              // If file already exists but wasn't in our in-memory cache
              if (createError?.response?.message?.includes('already exists')) {
                // Get the file from the database
                const files = await this.listProjectFiles(projectId, userId);
                const dbFile = files.find((f) => f.path === filePath);

                if (dbFile) {
                  fileId = dbFile.id;
                  action = 'updated';
                  // Update the existing file
                  await this.updateProjectFile(
                    projectId,
                    fileId,
                    {
                      content,
                      commitMsg: description || 'Updated by AI agent',
                    },
                    userId,
                  );

                  // Create a proper projectFile entry for our in-memory cache
                  existingFile = {
                    id: dbFile.id,
                    name: dbFile.name,
                    path: dbFile.path,
                    content: dbFile.currentVersion?.content || '',
                    lastModified:
                      dbFile.currentVersion?.createdAt || new Date(),
                  };
                } else {
                  // Still couldn't find the file, pass the original error
                  throw createError;
                }
              } else {
                // Other error, pass it through
                throw createError;
              }
            }
          }

          // Add the edit to the thread history
          await this.prisma.aIThreadMessage.create({
            data: {
              chatId: currentThreadId,
              role: 'system',
              content: JSON.stringify({
                type: 'file_edit',
                path: filePath,
                description,
                timestamp: new Date().toISOString(),
              }),
            },
          });

          // Update our in-memory representation
          const updatedFile = await this.getProjectFile(
            projectId,
            fileId,
            userId,
          );
          if (existingFile) {
            const fileIndex = projectFiles.findIndex((f) => f.id === fileId);
            if (fileIndex >= 0) {
              projectFiles[fileIndex] = {
                id: updatedFile.id,
                name: updatedFile.name,
                path: updatedFile.path,
                content: updatedFile.currentVersion?.content || '',
                lastModified:
                  updatedFile.currentVersion?.createdAt || new Date(),
              };
            }
          } else {
            projectFiles.push({
              id: updatedFile.id,
              name: updatedFile.name,
              path: updatedFile.path,
              content: updatedFile.currentVersion?.content || '',
              lastModified: updatedFile.currentVersion?.createdAt || new Date(),
            });
          }

          functionExecutionResults.push({
            tool: 'edit_file',
            filePath,
            action,
            success: true,
          });

          return {
            status: 'success',
            path: filePath,
            fileId,
            action,
          };
        } catch (error) {
          console.error(`Error editing file ${filePath}:`, error);
          functionExecutionResults.push({
            tool: 'edit_file',
            filePath,
            error: String(error),
          });
          return {
            status: 'error',
            path: filePath,
            error: String(error),
          };
        }
      },

      file_search: async (query: string) => {
        try {
          const fuzzyResults = projectFiles
            .map((file) => ({
              path: file.path,
              score: this.calculateFuzzyScore(query, file.path),
            }))
            .filter((result) => result.score > 0.3) // Minimum similarity threshold
            .sort((a, b) => b.score - a.score)
            .slice(0, 10); // Limit to 10 results

          functionExecutionResults.push({
            tool: 'file_search',
            query,
            matchCount: fuzzyResults.length,
          });

          return {
            results: fuzzyResults,
            count: fuzzyResults.length,
          };
        } catch (error) {
          console.error(`Error in file search:`, error);
          functionExecutionResults.push({
            tool: 'file_search',
            query,
            error: String(error),
          });
          return {
            results: [],
            error: String(error),
          };
        }
      },

      delete_file: async (filePath: string) => {
        try {
          const fileToDelete = projectFiles.find((f) => f.path === filePath);
          if (!fileToDelete) {
            const error = `File not found: ${filePath}`;
            functionExecutionResults.push({
              tool: 'delete_file',
              filePath,
              error,
            });
            return {
              status: 'error',
              message: error,
            };
          }

          await this.deleteProjectFile(projectId, fileToDelete.id, userId);

          // Update our in-memory representation
          const fileIndex = projectFiles.findIndex(
            (f) => f.id === fileToDelete.id,
          );
          if (fileIndex >= 0) {
            projectFiles.splice(fileIndex, 1);
          }

          // Log deletion in thread
          await this.prisma.aIThreadMessage.create({
            data: {
              chatId: currentThreadId,
              role: 'system',
              content: JSON.stringify({
                type: 'file_delete',
                path: filePath,
                timestamp: new Date().toISOString(),
              }),
            },
          });

          functionExecutionResults.push({
            tool: 'delete_file',
            filePath,
            success: true,
          });

          return {
            status: 'success',
            path: filePath,
          };
        } catch (error) {
          console.error(`Error deleting file ${filePath}:`, error);
          functionExecutionResults.push({
            tool: 'delete_file',
            filePath,
            error: String(error),
          });
          return {
            status: 'error',
            path: filePath,
            error: String(error),
          };
        }
      },

      web_search: async (query: string) => {
        try {
          const results = await this.browserService.aiSearch(query, userId);

          functionExecutionResults.push({
            tool: 'web_search',
            query,
            success: true,
          });

          return {
            results,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          console.error(`Error in web search:`, error);
          functionExecutionResults.push({
            tool: 'web_search',
            query,
            error: String(error),
          });
          return {
            status: 'error',
            message: 'Web search failed or is unavailable',
            error: String(error),
          };
        }
      },

      thinking: async (thoughts: string) => {
        try {
          // Log the thinking process to the thread history
          await this.prisma.aIThreadMessage.create({
            data: {
              chatId: currentThreadId,
              role: 'system',
              content: JSON.stringify({
                type: 'thinking',
                thoughts,
                timestamp: new Date().toISOString(),
              }),
            },
          });

          functionExecutionResults.push({
            tool: 'thinking',
            success: true,
          });

          return {
            status: 'success',
            message: 'Thinking process recorded',
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          console.error(`Error recording thinking process:`, error);
          functionExecutionResults.push({
            tool: 'thinking',
            error: String(error),
          });
          return {
            status: 'error',
            message: 'Failed to record thinking process',
            error: String(error),
          };
        }
      },
    };

    // 7. Build the system prompt with enhanced context
    const systemPrompt = `
# AI Coding Agent

You are an advanced AI coding agent that helps users build software projects. Your capabilities include:

1. Reading and understanding project files
2. Creating new files or modifying existing ones 
3. Proposing terminal commands to compile, test, or run the code
4. Searching the web for relevant information
5. Using semantic and regex search to navigate the codebase

## Project Context
Project Name: ${project.name}
Description: ${project.description || 'No description provided'}
Files: ${project.files.length} file(s)

## Available Tools
You can use the following tools by calling them exactly as shown:

- **codebase_search**: Find relevant code snippets using semantic search
  Example: codebase_search("search query", ["optional/target/directory"])

- **read_file**: View contents of a specific file
  Example: read_file("path/to/file.js", 1, 100)

- **run_terminal_cmd**: Propose terminal commands to execute
  Example: run_terminal_cmd("npm install express", false)

- **list_dir**: List contents of a directory
  Example: list_dir("src/components")

- **grep_search**: Search for patterns across files
  Example: grep_search("function searchPattern", true)

- **edit_file**: Create or modify files
  To use this tool, format your response like:
  \`\`\`tool_code
  edit_file
  \`\`\`
  **File: filename.ext**
  \`\`\`language
  file content goes here
  \`\`\`

- **file_search**: Find files by name
  Example: file_search("component")

- **delete_file**: Remove files from the project
  Example: delete_file("path/to/file.js")

- **web_search**: Research information online
  Example: web_search("tailwind css responsive design")

- **thinking**: Record your reasoning about what the user might want to do
  Example: thinking("The user wants to build a portfolio site, so I should start by creating an HTML structure with key sections like header, about, projects, and contact")

## Guidelines
- Understand the user's request thoroughly before taking action
- Take a strategic, step-by-step approach to solving problems
- When editing code, maintain consistent style with the existing codebase
- Provide clear explanations of your actions
- Never execute terminal commands without user approval
- Always validate your code changes for correctness

Please respond to the user's request: "${message}"

Use your available tools to help solve the task efficiently.
`;

    try {
      // 8. Process user's request using the AI model with function calling
      const response = await this.aiWrapper.generateFunctionCallingContent(
        defaultModel,
        systemPrompt,
        conversationHistory,
        toolFunctions,
      );

      // Process response and extract function calls
      const processedResponse = {
        content: response.content,
        functionCalls: response.functionCalls || [],
      };

      // Log executed functions for context tracking
      if (functionExecutionResults.length > 0) {
        await this.prisma.aIThreadMessage.create({
          data: {
            chatId: currentThreadId,
            role: 'system',
            content: JSON.stringify({
              type: 'function_execution_log',
              executions: functionExecutionResults,
            }),
            createdAt: new Date(),
          },
        });
      }

      // 9. Save AI response to thread
      await this.prisma.aIThreadMessage.create({
        data: {
          chatId: currentThreadId,
          role: 'assistant',
          content: response.content,
          createdAt: new Date(),
        },
      });

      // 10. Return the processed response with detailed contextual information
      return {
        response: response.content,
        threadId: currentThreadId,
        functionCalls: processedResponse.functionCalls,
        executedFunctions: functionExecutionResults,
        projectContext: {
          name: project.name,
          description: project.description,
          fileCount: projectFiles.length,
        },
      };
    } catch (error: any) {
      // Enhanced error logging and handling
      console.error('Agent pipeline error:', error);
      const errorDetails = {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      };

      await this.prisma.aIThreadMessage.create({
        data: {
          chatId: currentThreadId,
          role: 'system',
          content: JSON.stringify({
            type: 'error',
            details: errorDetails,
          }),
          createdAt: new Date(),
        },
      });

      return {
        response:
          "I encountered an error while processing your request. Please try again or provide more details about what you're trying to accomplish.",
        threadId: currentThreadId,
        error: errorDetails,
        executedFunctions: functionExecutionResults,
      };
    }
  }

  // Helper to calculate fuzzy search relevance
  private calculateFuzzyScore(query: string, text: string): number {
    query = query.toLowerCase();
    text = text.toLowerCase();

    // Simple fuzzy matching algorithm
    let score = 0;
    let lastFoundIndex = -1;

    for (const char of query) {
      const index = text.indexOf(char, lastFoundIndex + 1);
      if (index === -1) continue;

      score += 1;
      lastFoundIndex = index;
    }

    return score / Math.max(query.length, text.length);
  }

  // Helper to calculate semantic search relevance
  private calculateRelevance(query: string, content: string): number {
    // Simple TF-IDF style relevance calculation
    const queryTerms = query.toLowerCase().split(/\s+/);
    let score = 0;

    for (const term of queryTerms) {
      if (term.length < 3) continue; // Skip short terms

      const regex = new RegExp(term, 'gi');
      const matches = content.match(regex);
      if (matches) {
        score += matches.length * (term.length / 10); // Longer term matches are more significant
      }
    }

    return (score / content.length) * 10000; // Normalize by content length
  }

  /**
   * Get remaining messages for a user
   */
  async getUserRemainingSearches(userId: string) {
    if (this.usageService) {
      return await this.usageService.getRemainingRequests(userId);
    }

    // Default fallback if usage service isn't available
    return {
      used: 0,
      total: 100,
      remaining: 100,
      resetDate: new Date(),
    };
  }

  /**
   * Get recent web search results for a user (links only, not full content)
   * @param userId The user ID
   * @param limit Number of recent search results to return
   * @returns Recent search results with source links
   */
  async getUserWebSearchResults(userId: string, limit = 10) {
    // Get the most recent searches for this user
    const searchResults = await this.prisma.webSearchResult.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      include: {
        sources: {
          select: {
            id: true,
            title: true,
            url: true,
            sourceType: true,
            isImage: true,
            createdAt: true,
          },
        },
      },
    });

    return searchResults.map((result) => ({
      id: result.id,
      query: result.query,
      createdAt: result.createdAt,
      sources: result.sources.map((source) => ({
        id: source.id,
        title: source.title || 'Untitled',
        url: source.url,
        sourceType: source.sourceType,
        isImage: source.isImage,
      })),
    }));
  }

  /**
   * Get a specific web search source by ID
   * @param sourceId The source ID
   * @returns The web search source with full content
   */
  async getWebSearchSourceById(sourceId: string) {
    const source = await this.prisma.webSearchSource.findUnique({
      where: {
        id: sourceId,
      },
    });

    if (!source) {
      throw new Error('Source not found');
    }

    return source;
  }

  /**
   * Find the performBrowsing method
   */
  async performBrowsing(
    query: string,
    emitCallback?: Function,
    userId?: string,
  ): Promise<any> {
    try {
      // Call aiSearchStream with userId
      return await this.browserService.aiSearchStream(
        query,
        userId,
        emitCallback,
      );
    } catch (error) {
      console.error('Error in performBrowsing:', error);
      throw error;
    }
  }

  /**
   * Find the performDirectSearch method
   */
  async performDirectSearch(query: string, userId?: string): Promise<any> {
    try {
      // Call aiSearch with userId
      return await this.browserService.aiSearch(query, userId);
    } catch (error) {
      console.error('Error in performDirectSearch:', error);
      throw error;
    }
  }

  /**
   * Add this method to expose aiSearchStream functionality
   */
  async generateDirectContent(
    model: AIModels,
    prompt: string,
  ): Promise<AIResponse> {
    return this.aiWrapper.generateContent(model, prompt);
  }

  /**
   * Determines if a message requires web search and extracts query
   * @param message User message to analyze
   * @returns Search query string or "no" if search not needed
   */
  private async getSearchQueryFromMessage(message: string): Promise<string> {
    if (!message || message.length < 10) {
      return 'no';
    }

    // Shortened prompt to reduce token usage
    const prompt = `Evaluate if this message needs a web search: "${message}"
     
Output "no" if:
- It's a greeting, small talk, or opinion
- It's hypothetical or non-factual
- It's a follow-up without new content

Output 1-2 search queries (only keywords) if:
- User asks about facts, events, or data
- The question requires verification
- It explicitly asks for a search

Respond ONLY with "no" or 1-2 brief search queries on separate lines.`;

    const aiResult = await this.aiWrapper.generateContent(
      AIModels.GeminiFlash_2_5,
      prompt,
    );

    let response = aiResult.content.trim();

    // Early return if no search needed
    if (response === 'no' || response.toLowerCase().includes('no search')) {
      return 'no';
    }

    // Extract search queries (one per line)
    const queries = response
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line !== 'no');

    // Return first query or "no" if none found
    return queries.length > 0 ? queries[0] : 'no';
  }

  // Add this new method for extracting research queries from a message
  async extractResearchQueries(message: string): Promise<string[]> {
    const prompt = `SYSTEM: You are a search query generator. Generate exactly 5 search queries for researching the user's question.

INSTRUCTIONS:
1. Output ONLY the search queries
2. DO NOT include any explanatory text, lists, numbers, or quotes
3. DO NOT use phrases like "here are" or "search for"
4. Each query must be on a separate line
5. Each query must be distinct and specific
6. Cover different aspects of the user's question
7. Make each query 3-8 words long for optimal search results

USER QUESTION: "${message}"

RESPONSE FORMAT:
query 1
query 2
query 3
query 4
query 5`;

    // Use direct AI call instead of potentially creating DB records
    const aiResult = await this.aiWrapper.generateContent(
      AIModels.GeminiFlash_2_5,
      prompt,
    );

    // Process the response to extract only the queries
    const queries = aiResult.content
      .split('\n')
      .map((q) => q.trim())
      // Remove any lines that aren't actual queries
      .filter(
        (q) =>
          q.length > 0 &&
          !q.startsWith('query') &&
          !q.startsWith('Search') &&
          !q.startsWith('Here') &&
          !q.includes('"') && // Remove any lines with quotes
          !q.match(/^\d+\./), // Remove numbered list items
      )
      .slice(0, 5); // Limit to 5 queries max

    // If we got fewer than 5 queries, still return what we have
    return queries;
  }
}
