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
    const models = Object.entries(AIModels).map(([key, modelVal]) => ({
      name: key,
      model: modelVal,
      pricePerUnit: 0.01,
      quantity: 1000000,
      type: 'both',
      description: `${key} model from enum`,
      active: true,
    }));

    const newModelsToCreate = [];
    for (const modelItem of models) {
      // Find existing models with the same 'name'
      const existing = await this.prisma.aIModelPricing.findMany({
        where: { name: modelItem.name },
      });

      // If a record with the same name and identical model already exists, skip creating a new one.
      if (existing.some((rec) => rec.model === modelItem.model)) {
        continue;
      }

      // If there are records with the same name but with a different model value,
      // update them to set active to false.
      if (existing.length > 0) {
        await this.prisma.aIModelPricing.updateMany({
          where: {
            name: modelItem.name,
            model: { not: modelItem.model },
          },
          data: { active: false },
        });
      }

      // Queue the new model for creation.
      newModelsToCreate.push(modelItem);
    }

    if (newModelsToCreate.length > 0) {
      await this.prisma.aIModelPricing.createMany({
        data: newModelsToCreate,
        skipDuplicates: true,
      });
    }

    return { message: 'Bulk update models executed successfully.' };
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

    let thinkingContent = '';
    const thinkingMessagePrompt = `
    Previous Messages:
    ${userChatHistory.map((msg) => `${msg.role}: ${msg.message}`).join('\n')}

    ____________________________________
    CURRENT MESSAGE:
    ____________________________________
    ${message}
    ____________________________________
    `;

    if (reasoning) {
      const response = await this.processChainOfThoughts(
        thinkingMessagePrompt,
        userId,
        model,
      );
      thinkingContent = response.reasoning;
    }

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
      thinkingContent,
    );

    // Validate and use default model if needed
    const selectedModel = Object.values(AIModels).includes(model)
      ? model
      : AIModels.Gemini;

    const result = await this.aiWrapper.generateContentHistory(
      selectedModel,
      generatedPrompt,
      userChatHistory,
    );

    result.thinking = thinkingContent;

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

    await this.chatGetThreadTitle(chatId, message);

    return { result, chatId };
  }

  async processChatStream(
    message: string,
    userId: string,
    chatId?: string,
    model?: AIModels,
    reasoning?: boolean,
  ): Promise<AsyncIterable<string>> {
    // Existing setup code

    if (!chatId) {
      const newThread = await this.prisma.aIThread.create({
        data: {
          userId,
        },
      });
      chatId = newThread.id;
    }

    const [userChatHistory, userMemories, searchData, userInstructions] =
      await Promise.all([
        this.prisma.aIThreadMessage.findMany({
          where: { chatId },
          orderBy: { createdAt: 'asc' },
        }),
        this.chatGetUserMemories(message, userId),
        this.chatGetSearchData(message),
        this.chatGetUserInstructions(userId),
      ]);

    const formattedHistory: ChatHistory[] = userChatHistory.map((msg) => ({
      role: msg.role,
      message: msg.content,
    }));

    const generalInfo = this.chatGetGeneralInfo();
    this.extractAndSaveMemory(message, userId, userMemories).catch(
      console.error,
    );

    const selectedModel = Object.values(AIModels).includes(model)
      ? model
      : AIModels.Gemini;

    // Create combined generator
    const combinedGenerator = async function* () {
      let thinkingContent = '';

      if (reasoning) {
        // Build thinking prompt with chat history
        const thinkingMessagePrompt = `
          Previous Messages:
          ${formattedHistory.map((msg) => `${msg.role}: ${msg.message}`).join('\n')}
      
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

      // Generate final prompt with thinking content
      const generatedPrompt = this.createUserChattingPrompt(
        message,
        userMemories,
        generalInfo,
        searchData,
        userInstructions,
        thinkingContent,
      );

      // Generate and stream final answer
      const [streamResponse] = await Promise.all([
        this.aiWrapper.generateContentStreamHistory(
          selectedModel,
          generatedPrompt,
          formattedHistory,
        ),
        this.prisma.aIThreadMessage.create({
          data: { chatId, content: message, role: 'user' },
        }),
      ]);

      // Yield chatId and response chunks
      yield `__CHATID__${chatId}__`;
      let fullResponse = '';
      for await (const chunk of streamResponse.content) {
        fullResponse += chunk;
        yield chunk;
        await new Promise((r) => setImmediate(r));
      }

      // Save final response
      await Promise.all([
        this.prisma.aIThreadMessage.create({
          data: { chatId, content: fullResponse, role: 'model' },
        }),
        this.chatGetThreadTitle(chatId, message),
      ]);
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
  ): Promise<AsyncIterable<string>> {
    // Create chat thread if not provided
    if (!chatId) {
      const threadData = await this.prisma.aIThread.create({
        data: { userId },
      });
      chatId = threadData.id;
    }

    // Get chat history after chatId is guaranteed to exist
    const userChatHistory = await this.prisma.aIThreadMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
    });

    const formattedHistory: ChatHistory[] = userChatHistory.map((msg) => ({
      role: msg.role,
      message: msg.content,
    }));

    const selectedModel = Object.values(AIModels).includes(model)
      ? model
      : AIModels.Gemini;

    this.chatGetThreadTitle(chatId, message);

    // Create combined generator without buffering the entire response
    const combinedGenerator = async function* () {
      // Start generating and streaming final answer right away
      const streamResponse = this.aiWrapper.generateContentStreamHistory(
        selectedModel,
        message,
        formattedHistory,
      );

      // First yield the chatId
      yield `__CHATID__${chatId}__`;

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

    return await this.prisma.aIThreadMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: skip,
    });
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
      include: { messages: true },
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
          createdAt: new Date(),
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

  private async chatGetSearchData(message: string): Promise<string> {
    if (!message || message.length < 10) {
      return 'no';
    }

    const prompt = `You are an expert in evaluating whether a user's message calls for a web search. Your task is to decide—based on the user's intent and the conversation context—if you should output "no" or generate up to 3 concise search queries using only relevant keywords.

When to respond with "no":

The message consists of casual greetings, small talk, or pleasantries.
It shares personal opinions, emotions, or subjective experiences.
It discusses hypothetical scenarios or general topics that do not require real-time or verified information.
It is a follow-up message that does not introduce new, search-relevant content.

When to generate search queries:

The user asks about current events, news, or real-world data.
The message requests factual, technical, or tutorial information.
It includes specific names, places, or events that warrant verification.
The query explicitly asks for a search or implies that up-to-date information is needed.
The conversation lacks sufficient context or data, making a web search necessary.
The user affirms a previous prompt to search (e.g., "Yes, please").

Guidelines:

Output ONLY either "no" or up to 3 search queries separated by newlines—nothing else.
For complex questions, generate multiple queries (maximum 3) that cover different aspects.
Ensure each search query is concise and strictly composed of keywords relevant to the user's request.
Omit any personal or sensitive details from the queries.
Always consider the full conversation context and chat history to accurately capture the user's intent.

    User Message: "${message}"`;

    const aiResult = await this.aiWrapper.generateContent(
      AIModels.Llama_4_Scout,
      prompt,
    );

    let response = aiResult.content.trim();

    // Validate response
    if (response !== 'no' && response.length > 0) {
      // Split into multiple queries (max 3)
      const queries = response
        .split('\n')
        .filter((q) => q.trim().length > 0)
        .slice(0, 3);

      // Execute each search query and combine results
      const allSearchResults: any[] = [];

      for (const query of queries) {
        const searchResult = await this.browserService.aiSearch(query);

        try {
          let parsedResults;
          if (typeof searchResult === 'string') {
            parsedResults = JSON.parse(searchResult);
          } else {
            parsedResults = searchResult;
          }

          if (
            parsedResults.searchResults &&
            Array.isArray(parsedResults.searchResults)
          ) {
            allSearchResults.push(...parsedResults.searchResults);
          }
        } catch (e) {
          console.error('Failed to parse search results:', e);
        }
      }

      return JSON.stringify({ searchResults: allSearchResults });
    }

    return JSON.stringify({ searchResults: [] });
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
    thinking?: string,
  ): string {
    return `
    SYSTEM PROMPT:
-----------------------------------------------------------
[GENERAL GUIDELINES]
- Use the "User Given Instructions" to understand the overall job and context.
- When incorporating external content, do so only if it adds clear value and enhances the conversation.
  - Use only the provided external links or media if they contribute meaningfully.
- Reference user saved memories only if they are directly relevant to the current prompt.
- Leverage the "THINKING CONTEXT" enclosed within '<think> ... </think>' to guide your internal reasoning, but ensure that your final response remains clear, direct, and user-friendly.

[DATA FIELDS]
1. **User Given Instructions:**
   ${instructions.map((ui) => ui.job).join(', ')}

2. **External Raw Content Integration:**
   ${typeof external === 'object' ? JSON.stringify(external) : external || 'No external content available'}

3. **General Info:**
   ${info}
   (e.g., current date, relevant events, etc.)

4. **User Saved Memories:**
   ${memories}
   (Use only the memories that are relevant to the current conversation. Older or less relevant details should be disregarded unless they pertain to important user information like names.)

5. **THINKING CONTEXT:**
   <think>
   ${thinking || "Processing the user's message for a direct and friendly answer."}
   </think>

6. **User Prompt:**
   ${message}

-----------------------------------------------------------
INSTRUCTIONS:
- Review all sections above before generating your response.
- If any section (such as external content) is missing or does not add value, proceed without it.
- Your final output should be clear, concise, and directly address the user's prompt while incorporating any relevant instructions or context from the fields.
- Always ensure that any external information is properly formatted and cited.
-----------------------------------------------------------

`;
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
        AIModels.Gemini,
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
    model: AIModels = AIModels.Llama_3_3_70B_speed,
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
      Generate 3-8 distinct approaches for: "${message}"
      
      Requirements:
      - Each response must be ≤15 words
      - Number each response (1., 2., 3. etc.)
      - Variety in responses/approaches/perspectives/methods
      ${complexity === 'high' ? '- Include unconventional solutions' : '- Maintain practical answers'}
      
      ${previousDrafts ? `Previous answers:\n${previousDrafts}` : ''}
  
      Format exactly:
      DRAFT_BATCH: ${previousDrafts.split('\n').length + 1}
      1. [First concise solution]
      2. [Second contrasting answer]
      3. [Third innovative solution]
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
    model: AIModels = AIModels.Llama_3_3_70B_speed,
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
      Provide a chain-of-thought for: "${message}"

      Requirements:
      - Generate 3-20 distinct reasoning steps
      - Each step must be ≤100 words
      - Number each step (1., 2., 3., etc.)
      - Ensure each step builds upon the previous insights
      ${complexity === 'high' ? '- Include unconventional insights' : '- Maintain practical reasoning'}

      ${previousThoughts ? `Previous reasoning steps:\n${previousThoughts}` : ''}

      Format exactly:
      THOUGHT_BATCH: ${previousThoughts.split('\n').length + 1}
      1. [First concise thought]
      2. [Second contrasting insight]
      3. [Third innovative step]
      ${step === 'INITIAL_THOUGHT' ? 'COMPLEXITY: [low|medium|high]' : 'IMPROVE_NEEDED: [yes/no]'}
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
      m[1].trim().split(/\s+/).slice(0, 56).join(' '),
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
    return { low: 2, medium: 4, high: 8, 'very-high': 20 }[complexity] || 3;
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
    if (!threadId) {
      const newThread = await this.prisma.aIThread.create({
        data: {
          title: `${message.split('\n')[0].slice(0, 50)}...`,
          userId,
          projectId,
        },
      });
      threadId = newThread.id;
    } else {
      const thread = await this.prisma.aIThread.findFirst({
        where: { id: threadId, projectId },
      });
      if (!thread) {
        throw new NotFoundException(
          'Thread not found or does not belong to this project',
        );
      }
    }

    // 3. Retrieve conversation history to maintain context
    const previousMessages = await this.prisma.aIThreadMessage.findMany({
      where: { chatId: threadId },
      orderBy: { createdAt: 'asc' },
    });
    const conversationHistory: ChatHistory[] = previousMessages.map((msg) => ({
      role: msg.role,
      message: msg.content,
    }));

    const startTime = new Date().getTime();

    // 4. Build project context from existing project data
    const projectContext = {
      projectName: project.name,
      projectDescription: project.description,
      files: project.files.map((file) => ({
        name: file.name,
        path: file.path,
        content: file.currentVersion?.content,
      })),
    };

    // 5. Initialize the state that will be updated at each agent step
    let currentState: any = {
      requirements: message,
      projectContext,
      plan: {},
      generatedFiles: [],
      validationErrors: [],
      executionPlan: [],
    };

    // 6. Register the agent pipeline in strict order:
    // Project Architecture -> File Generator -> File Validator -> Improvements -> Execution
    const agentPipeline: Array<{
      name: string;
      execute: (
        state: any,
        history: ChatHistory[],
        errorContext?: string,
      ) => Promise<any>;
    }> = [
      {
        name: 'project-architect',
        execute: this.executeProjectArchitect.bind(this),
      },
      { name: 'file-generator', execute: this.executeFileGenerator.bind(this) },
      { name: 'code-validator', execute: this.executeCodeValidator.bind(this) },
      {
        name: 'file-improvement',
        execute: this.executeFileImprovement.bind(this),
      },
      {
        name: 'execution-agent',
        execute: this.executeExecutionAgent.bind(this),
      },
      // Optionally, add an image-generator agent here
    ];

    // 7. Process each agent in the pipeline sequentially
    for (const agent of agentPipeline) {
      let retries = 3;
      let agentResponse: any;
      let errorContext = '';

      while (retries > 0) {
        try {
          agentResponse = await agent.execute(
            currentState,
            conversationHistory,
            errorContext,
          );
          break;
        } catch (e: any) {
          retries--;
          errorContext = e.message;
          if (retries === 0) {
            throw new Error(`Agent ${agent.name} failed: ${e.message}`);
          }
          await this.delay(1000);
        }
      }

      // Update state based on agent response and log the step
      currentState = this.processAgentResponse(
        agent.name,
        agentResponse,
        currentState,
      );
      await this.saveAgentStep(threadId, agent.name, agentResponse);
    }

    // 8. Execute the final validated/improved plan
    if (currentState.executionPlan && currentState.executionPlan.length > 0) {
      await this.executeDevelopmentPlan(
        projectId,
        currentState.executionPlan,
        userId,
      );
    }

    // Add the user's message to the conversation history
    await this.prisma.aIThreadMessage.create({
      data: {
        chatId: threadId,
        role: 'user',
        content: message,
        createdAt: new Date(startTime),
      },
    });

    return {
      response: this.formatFinalResponse(currentState),
      threadId,
      actions: currentState.executionPlan,
    };
  }

  // Helper to create delays
  private async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ---------- Agent Execution Functions ----------
  private async executeProjectArchitect(
    state: any,
    history: ChatHistory[],
    errorContext: string = '',
    model?: AIModels,
  ): Promise<any> {
    const agentType = 'project-architect';
    const agentPrompt = this.buildAgentPrompt(agentType, state, errorContext);
    const result = await this.executeAgentWithRetry(
      agentType,
      agentPrompt,
      history,
      3,
      model,
    );
    return this.parseStructuredResponse(result.content, agentType);
  }

  private async executeFileGenerator(
    state: any,
    history: ChatHistory[],
    errorContext: string = '',
    model?: AIModels,
  ): Promise<any> {
    const agentType = 'file-generator';
    const agentPrompt = this.buildAgentPrompt(agentType, state, errorContext);
    const result = await this.executeAgentWithRetry(
      agentType,
      agentPrompt,
      history,
      3,
      model,
    );
    return this.parseStructuredResponse(result.content, agentType);
  }

  private async executeCodeValidator(
    state: any,
    history: ChatHistory[],
    errorContext: string = '',
    model?: AIModels,
  ): Promise<any> {
    const agentType = 'code-validator';
    const agentPrompt = this.buildAgentPrompt(agentType, state, errorContext);
    const result = await this.executeAgentWithRetry(
      agentType,
      agentPrompt,
      history,
      3,
      model,
    );
    return this.parseStructuredResponse(result.content, agentType);
  }

  private async executeFileImprovement(
    state: any,
    history: ChatHistory[],
    errorContext: string = '',
    model?: AIModels,
  ): Promise<any> {
    const agentType = 'file-improvement';
    // Only run file improvement if there are validation errors;
    // otherwise, simply pass through the current generated files.
    const agentPrompt = this.buildAgentPrompt(agentType, state, errorContext);
    const result = await this.executeAgentWithRetry(
      agentType,
      agentPrompt,
      history,
      3,
      model,
    );
    return this.parseStructuredResponse(result.content, agentType);
  }

  private async executeExecutionAgent(
    state: any,
    history: ChatHistory[],
    errorContext: string = '',
    model?: AIModels,
  ): Promise<any> {
    const agentType = 'execution-agent';
    const agentPrompt = this.buildAgentPrompt(agentType, state, errorContext);
    const result = await this.executeAgentWithRetry(
      agentType,
      agentPrompt,
      history,
      3,
      model,
    );
    return this.parseStructuredResponse(result.content, agentType);
  }

  // ---------- Agent Communication & Validation ----------

  /**
   * Executes an agent call with retries. Uses your AI wrapper to generate content.
   */
  private async executeAgentWithRetry(
    agent: string,
    prompt: string,
    history: ChatHistory[],
    retriesLeft: number,
    model?: AIModels,
  ): Promise<AgentResponse> {
    let attempt = 1;
    const maxAttempts = 3;
    // Use the provided model or fall back to Gemini
    const selectedModel = model || AIModels.OptimusAlpha;

    while (attempt <= maxAttempts) {
      try {
        const result = await this.aiWrapper.generateContentHistory(
          selectedModel,
          `${prompt}\n\nAttempt ${attempt}/${maxAttempts}:`,
          history,
        );
        // Validate response structure before returning
        this.validateAgentResponse(agent, result.content);
        return result;
      } catch (error: any) {
        if (attempt === maxAttempts) {
          throw new Error(`Final attempt failed: ${error.message}`);
        }
        // Provide corrective context for the next attempt
        history.push({
          role: 'system',
          message: `Format correction needed: ${error.message}`,
        });
        attempt++;
        await this.delay(500 * attempt);
      }
    }
    throw new Error('Max retries exceeded');
  }

  // Validate agent response based on its type
  private validateAgentResponse(agent: string, response: string) {
    const parsed = this.parseStructuredResponse(response, agent);
    switch (agent) {
      case 'project-architect':
        if (!parsed.plan || !parsed.plan.structure) {
          throw new Error('Missing project structure in response');
        }
        break;
      case 'file-generator':
        if (!parsed.files || parsed.files.length === 0) {
          throw new Error('No files generated in response');
        }
        break;
      case 'code-validator':
        if (!parsed.validation) {
          throw new Error('Missing validation results');
        }
        break;
      case 'file-improvement':
        if (!parsed.files || parsed.files.length === 0) {
          throw new Error('No file improvements provided');
        }
        break;
      case 'execution-agent':
        if (!parsed.actions || parsed.actions.length === 0) {
          throw new Error('No execution actions provided');
        }
        break;
      default:
        throw new Error(`Unknown agent type: ${agent}`);
    }
  }

  /**
   * Builds an agent prompt based on the agent type and current state.
   */
  private buildAgentPrompt(
    agentType: string,
    state: any,
    errorContext: string = '',
  ): string {
    // For file-improvement, use validation errors to guide corrections.
    if (
      agentType === 'file-improvement' &&
      state.validationErrors &&
      state.validationErrors.length > 0
    ) {
      return `
        CORRECT THESE FILES:
        ${state.validationErrors
          .map(
            (v: any) => `
          File: ${v.filePath}
          Issues:
          ${v.issues.map((i: any) => `- [${i.type}] ${i.message}`).join('\n')}
        `,
          )
          .join('\n')}
  
        INSTRUCTIONS:
        1. Fix all reported errors while preserving the existing structure.
        2. Enhance code readability and maintain style consistency.
  
        RESPONSE FORMAT:
        {
          "files": [{
            "path": "string",
            "content": "string",
            "changesMade": ["string"]
          }]
        }
      `;
    }

    // For file-generator, instruct the agent to generate the full file content update
    // whether creating new files or updating existing ones.
    if (agentType === 'file-generator') {
      return `
        For each file defined in the project architecture:
        - If the file does NOT exist in the Existing Files list, generate the full file content.
        - If the file already exists, generate the full updated file content (do NOT output a diff).
  
        Respond with JSON in the following format:
        {
          "files": [{
            "path": "string",
            "content": "string", // Full file content update.
            "action": "create|update", // "create" if file is new, "update" if file exists.
            "dependencies": ["string"],
            "validationChecks": ["html5", "css3", "responsive"]
          }]
        }
      `;
    }

    // For project-architect, instruct the agent to produce a detailed project plan.
    // In particular, for documentation files like readme.md, include detailed instructions.
    if (agentType === 'project-architect') {
      return `
        You are an experienced project architect with a deep understanding of software engineering best practices. Your job is to analyze project requirements and provide a comprehensive, actionable development plan tailored to the request. Follow these instructions carefully:

1. **Project Requirement Analysis:**  
   - **Current Requirement:** "${state.requirements}"  
   - **Example Context:** For instance, if the requirement is to build a notes app using React, identify key features (e.g., note creation, editing, deletion, tagging, and search), relevant UI/UX considerations, important dependencies (such as React libraries, state management tools, or routing frameworks), and any anticipated implementation challenges.

2. **Context and File Handling:**  
   - **Project Context Assessment:**  
     $$
     state.projectContext.files.length > 0 
       ? '- Existing files are present: modify or update them as required.' 
       : '- No existing files: propose a full project structure from scratch.'
     $$
   - **File Deletion or Modification Requests:**  
     • For deletion or updates, first verify that the target files exist before planning file removal or changes.

3. **Detailed Development Plan:**  
   - **Structure:** Outline a file and folder structure plan where each entry includes:  
     • A file or folder path  
     • The type (file/folder)  
     • The intended action (create/modify/delete)  
     • A short description justifying the decision  
   - **Dependencies:** List any libraries, frameworks, or external modules required.  
   - **Challenges:** Identify any potential issues or challenges that might arise during development.

4. **Handling Updates:**  
   - For update requests, clearly define what requires updating. Analyze the current setup and explain what modifications will be made, including rationale.
   
5. **Response Format:**  
   Your output must be in the following JSON format:
   
   $$
   {
     "plan": {
       "structure": [
         {
           "path": "string",
           "type": "file/folder",
           "action": "create/modify/delete",
           "description": "string"
         }
       ],
       "dependencies": ["string"],
       "challenges": ["string"]
     }
   }
   $$
   
   Ensure that you strictly adhere to this JSON structure in your response.

Remember, your goal is to offer clear and detailed guidance as if instructing another engineer, ensuring that each step of your plan is actionable and well-justified. Whether this is a new project or an update to an existing one, provide insight into exactly what needs to be done and why.

      `;
    }

    const filePaths =
      state.plan?.structure
        ?.filter((f: any) => f?.type === 'file')
        ?.map((f: any) => f.path) || [];

    const baseContext = `
      ${errorContext ? `ERROR CONTEXT: ${errorContext}` : ''}
      Project: ${state.projectContext.projectName}
      Existing Files: ${state.projectContext.files.map((f: any) => f.path).join(', ')}
      Requirements: ${state.requirements}
    `;

    const agentPrompts: Record<string, string> = {
      'code-validator': `
        Validate all files using industry-standard best practices and conventions:
          1. For HTML files:
             - Ensure valid structure and semantic usage.
             - Check for accessibility compliance.
             - Verify responsive design principles.
          2. For CSS files:
             - Validate against latest CSS standards.
             - Check for efficient and maintainable styling.
             - Ensure cross-browser compatibility.
          3. For JavaScript/TypeScript and any other code files:
             - Verify adherence to modern standards.
             - Check for proper error handling and code organization.
             - Ensure performance optimization techniques are applied.
          4. For documentation files (e.g., README.md):
             - Verify completeness of project information.
             - Check for clear and concise explanations.
          5. For all other files not covered above:
             - Ensure consistent code style and formatting.
             - Check for potential security vulnerabilities.
             - Verify proper commenting and documentation.
  
        Respond with:
        {
          "validation": [{
            "filePath": "string",
            "issues": [{
              "type": "error/warning",
              "line": "number",
              "column": "number",
              "rule": "string",
              "message": "string",
              "suggestion": "string"
            }]
          }]
        }
      `,
      'execution-agent': `
        Create an execution plan based on the improved files and validation results.
        Format:
        {
          "actions": [{
            "type": "create|update|revert|delete",
            "filePath": "string",
            "content": "string",
            "commitMsg": "string"
          }]
        }
      `,
    };

    return `${baseContext}
    
STRICT FORMATTING RULES:
- Respond ONLY with valid JSON.
- No additional text outside JSON.
- Use exactly the specified structure.
- Escape special characters properly.

${agentPrompts[agentType] || ''}
    
STRICT FORMATTING RULES:
- Respond ONLY with valid JSON.
- No additional text outside JSON.
- Use exactly the specified structure.
- Escape special characters properly.
`;
  }

  // ---------- Execution Plan & File Operations ----------

  /**
   * Executes the development plan by iterating through file actions.
   * In a production system, these operations should be wrapped in a transaction.
   */
  private async executeDevelopmentPlan(
    projectId: string,
    actions: any[],
    userId: string,
  ) {
    try {
      for (const action of actions) {
        switch (action.type) {
          case 'create':
            await this.createProjectFile(
              projectId,
              {
                name: action.filePath.split('/').pop(),
                path: action.filePath,
                content: action.content,
                commitMsg: action.commitMsg,
              },
              userId,
            );
            break;
          case 'update':
            const fileToUpdate = await this.getFileByPath(
              projectId,
              action.filePath,
            );
            await this.updateProjectFile(
              projectId,
              fileToUpdate.id,
              {
                content: action.content,
                commitMsg: action.commitMsg,
              },
              userId,
            );
            break;
          case 'revert':
            const fileToRevert = await this.getFileByPath(
              projectId,
              action.filePath,
            );
            await this.revertProjectFile(
              projectId,
              fileToRevert.id,
              action.version,
              action.commitMsg,
              userId,
            );
            break;
          case 'delete':
            const fileToDelete = await this.getFileByPath(
              projectId,
              action.filePath,
            );
            await this.deleteProjectFile(projectId, fileToDelete.id, userId);
            break;
          default:
            throw new Error(`Unknown action type: ${action.type}`);
        }
      }
    } catch (e: any) {
      // In production, consider rolling back the transaction here.
      throw new Error(`Execution plan failed: ${e.message}`);
    }
  }

  // ---------- Response Parsing and Validation ----------

  /**
   * Parses and validates the JSON response returned by agents.
   */
  private parseStructuredResponse(response: string, agent: string): any {
    try {
      const cleaned = response
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      const parsed = JSON.parse(cleaned);
      this.validateResponseStructure(agent, parsed);
      return parsed;
    } catch (e: any) {
      throw new Error(`Invalid response format: ${e.message}`);
    }
  }

  /**
   * Validates that the JSON response adheres to the expected structure for each agent.
   */
  private validateResponseStructure(agent: string, response: any) {
    const validators: Record<string, (res: any) => void> = {
      'project-architect': (res) => {
        if (!res.plan || !Array.isArray(res.plan.structure)) {
          throw new Error('Invalid project structure format');
        }
      },
      'file-generator': (res) => {
        if (!Array.isArray(res.files) || res.files.some((f: any) => !f?.path)) {
          throw new Error('Files array missing or invalid file paths');
        }
      },
      'code-validator': (res) => {
        if (!Array.isArray(res.validation)) {
          throw new Error('Validation results must be an array');
        }
      },
      'file-improvement': (res) => {
        if (!Array.isArray(res.files) || res.files.some((f: any) => !f?.path)) {
          throw new Error(
            'Files array missing or invalid file paths in improvement response',
          );
        }
      },
      'execution-agent': (res) => {
        if (!Array.isArray(res.actions)) {
          throw new Error('Actions must be an array');
        }
      },
    };

    if (validators[agent]) {
      validators[agent](response);
    }
  }

  /**
   * Updates the system state based on an agent's response.
   */
  private processAgentResponse(
    agent: string,
    agentResponse: any,
    currentState: any,
  ): any {
    const newState = { ...currentState };
    switch (agent) {
      case 'project-architect':
        newState.plan = agentResponse.plan || { structure: [] };
        break;
      case 'file-generator':
        newState.generatedFiles = agentResponse.files || [];
        break;
      case 'code-validator':
        newState.validationErrors = Array.isArray(agentResponse.validation)
          ? agentResponse.validation.filter(
              (v: any) => v.issues && v.issues.length > 0,
            )
          : [];
        break;
      case 'file-improvement':
        newState.generatedFiles =
          agentResponse.files || newState.generatedFiles;
        break;
      case 'execution-agent':
        newState.executionPlan = agentResponse.actions || [];
        break;
    }
    return newState;
  }

  // ---------- Logging & Storage Helpers ----------

  /**
   * Saves the agent's response to the thread for auditing purposes.
   */
  private async saveAgentStep(
    threadId: string,
    agent: string,
    response: any,
  ): Promise<void> {
    await this.prisma.aIThreadMessage.create({
      data: {
        chatId: threadId,
        content: JSON.stringify({
          agent,
          response: this.sanitizeForStorage(response),
        }),
        role: 'system',
        createdAt: new Date(),
      },
    });
  }

  /**
   * Sanitizes the response before storing to avoid saving sensitive data.
   */
  private sanitizeForStorage(response: any): any {
    const clone = { ...response };
    if (clone.files) {
      clone.files = clone.files.map((f: any) => ({
        ...f,
        content: f.content ? `<content length=${f.content.length}>` : null,
      }));
    }
    return clone;
  }

  /**
   * Formats a final response message summarizing the execution outcome.
   */
  private formatFinalResponse(currentState: any): string {
    const allIssues = currentState.validationErrors.flatMap(
      (v: any) => v.issues?.map((i: any) => i.message) || [],
    );

    return `✅ Successfully executed ${currentState.executionPlan.length} actions:\n${currentState.executionPlan
      .map((a: any) => `• ${a.type} ${a.filePath}`)
      .join('\n')}`;
  }

  // ---------- Project File Operation Helpers ----------

  private async getFileByPath(
    projectId: string,
    filePath: string,
  ): Promise<any> {
    const file = await this.prisma.aIProjectFile.findFirst({
      where: { projectId, path: filePath },
    });
    if (!file) {
      throw new NotFoundException(`File not found at path: ${filePath}`);
    }
    return file;
  }
}
