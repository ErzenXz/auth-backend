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
      ${thread.messages.map((m) => `${m.role}: ${m.content.substring(0, 50)}${m.content.length > 50 ? '...' : ''}`).join('\n')}

      Output requirements:
      - Return a single title string
      - Maximum 50 characters
      - No options or alternatives
      - No explanations or additional text
    `;

    try {
      const result = await this.aiWrapper.generateContent(
        AIModels.Llama_3_2_11B,
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

    await this.chatGetThreadTitle(chatId);

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
        this.chatGetThreadTitle(chatId),
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

    this.chatGetThreadTitle(chatId);
    return combinedGenerator;
  }

  async getChatThreads(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    return await this.prisma.aIThread.findMany({
      where: {
        userId,
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

    const prompt = `You are an expert in evaluating whether a user's message calls for a web search. Your sole task is to decide—based on the user's intent and the conversation context—if you should output "no" or generate a single, concise search query using only relevant keywords.

When to respond with "no":

The message consists of casual greetings, small talk, or pleasantries.
It shares personal opinions, emotions, or subjective experiences.
It discusses hypothetical scenarios or general topics that do not require real-time or verified information.
It is a follow-up message that does not introduce new, search-relevant content.
When to generate a search query:

The user asks about current events, news, or real-world data.
The message requests factual, technical, or tutorial information.
It includes specific names, places, or events that warrant verification.
The query explicitly asks for a search or implies that up-to-date information is needed.
The conversation lacks sufficient context or data, making a web search necessary.
The user affirms a previous prompt to search (e.g., “Yes, please”).
Guidelines:

Output ONLY either "no" or a single, focused search query—nothing else.
Ensure the search query is concise and strictly composed of keywords relevant to the user's request.
Omit any personal or sensitive details from the query.
Always consider the full conversation context and chat history to accurately capture the user's intent.
Your output must clearly reflect whether a search is needed and, if so, what specific query to use.
User Message: "${message}"`;

    const aiResult = await this.aiWrapper.generateContent(
      AIModels.Llama_3_3_70B_vers,
      prompt,
    );

    let response = aiResult.content.trim();
    // Validate response
    if (response !== 'no' && response.length > 0) {
      const searchResult = await this.browserService.aiSearch(response);

      // Ensure response is JSON formatted
      try {
        if (typeof searchResult === 'string') {
          return JSON.parse(searchResult);
        }
        return searchResult;
      } catch (e) {
        return JSON.stringify({ searchResults: [] });
      }
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

2. **External Content Integration:**
   - Content Source: ${external || 'No external content available'}

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
    model: AIModels = AIModels.Llama_3_3_70B_vers,
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
      - Generate 3-8 distinct reasoning steps
      - Each step must be ≤25 words
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
      m[1].trim().split(/\s+/).slice(0, 10).join(' '),
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
}
