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
    CURRENT MESSAGE TO THINK ABOUT:
    ____________________________________
    ${message}
    ____________________________________
    `;

    if (reasoning) {
      const response = await this.processChainOfThought(
        thinkingMessagePrompt,
        userId,
        model,
      );
      thinkingContent = response.reasoning + '\n' + response.answer;
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
      : AIModels.GeminiFast;

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
      : AIModels.GeminiFast;

    // Create combined generator
    const combinedGenerator = async function* () {
      let thinkingContent = '';

      if (reasoning) {
        // Build thinking prompt with chat history
        const thinkingMessagePrompt = `
          Previous Messages:
          ${formattedHistory.map((msg) => `${msg.role}: ${msg.message}`).join('\n')}
  
          ____________________________________
          CURRENT MESSAGE TO THINK ABOUT:
          ____________________________________
          ${message}
          ____________________________________
        `;

        // Stream reasoning steps
        const reasoningStream = this.streamChainOfThought(
          thinkingMessagePrompt,
          selectedModel,
        );
        let fullReasoning = '';
        let finalAnswer = '';

        for await (const chunk of reasoningStream) {
          switch (chunk.type) {
            case 'thinking':
              fullReasoning += chunk.content;
              yield `__THINKING__${JSON.stringify(chunk)}`;
              await new Promise((r) => setImmediate(r));
              break;
            case 'answer':
              finalAnswer = chunk.content;
              yield `__ANSWER__${JSON.stringify(chunk)}`;
              await new Promise((r) => setImmediate(r));
              break;
            case 'complete':
              thinkingContent = `${fullReasoning}\n${finalAnswer}`;
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
      : AIModels.GeminiFast;

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
      : AIModels.GeminiFast;

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
 You are an expert at determining when a user's message requires a web search. Your job is to decide whether to respond with "no" or a concise search query based on the user's intent and conversation context.

**When to return "no":**
- The message is a casual greeting or small talk.
- It expresses personal opinions, emotions, or preferences.
- It discusses hypothetical scenarios or general knowledge that doesn't require up-to-date verification.
- It is a follow-up message that doesn’t add new search-related information.

**When to return a search query:**
- The user asks about current events, news, or real-world data.
- The user requests factual, technical, or tutorial information.
- The message includes specific names, places, or events.
- The query needs verification or is explicitly asking for a search.
- There is insufficient context or available data in the database.
- The user confirms a previous offer to search (e.g., “Yes, please” after "Do you want me to search for that?").

**Guidelines:**
1. **Output ONLY** "no" or a single, focused search query.
2. Keep the search query concise and composed of relevant keywords.
3. Remove any personal or sensitive details from the query.
4. Always consider the conversation context and chat history.
5. Ensure the query accurately reflects the user’s intent.

**Examples:**
- User: "Tell me the latest news in Kosovo."  
  → Response: "latest news Kosovo"
- User: "How does quantum computing work?"  
  → Response: "quantum computing basics"
- User: "Good morning!"  
  → Response: "no"

**User Message:** "${message}"
      `;

    const aiResult = await this.aiWrapper.generateContent(
      AIModels.GeminiFast,
      prompt,
    );

    let response = aiResult.content.trim();

    // Validate response
    if (response !== 'no' && response.length > 0) {
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
    thinking?: string,
  ): string {
    //     return `Master Conversation Processing Framework 🤖💬

    // Objective:
    // Deliver direct, complete answers that fully address the user's request with a friendly and concise tone.

    // Core Principles:
    // - **Emotional Intelligence:** Recognize the user's preferences and keep the response personable.
    // - **Contextual Awareness:** Provide direct answers without unnecessary commentary.
    // - **Adaptive Communication:** Use a personalized greeting if possible, then present the complete solution.

    // Response Generation Guidelines:
    // - **Direct & Concise:** Start with a friendly greeting and then provide the solution.
    // - **Content Integration:** Include complete code examples or explanations as required by the request.
    // - **Markdown Formatting:**
    //   - *Italics* for emphasis
    //   - **Bold** for key points
    //   - Use code blocks for code
    //   - Lists when helpful
    // - **Avoid Extra Commentary:** Do not include lengthy follow-up questions or meta commentary.

    // Workflow:
    // 1. **Input Analysis:** Identify and focus solely on the explicit request.
    // 2. **Response Crafting:**
    //    - If the request is for a code solution (e.g., "Build a snake game in Python that plays itself!"), start with a personalized greeting (e.g., "Hey Erzen, here is the code:") followed by the complete solution.
    //    - Do not add extra commentary beyond what is necessary.
    // 3. **Final Output:** Ensure the response is actionable and concise.

    // Strict Guidelines:
    // - Always provide a complete solution directly.
    // - Include a brief, friendly greeting when appropriate.
    // - Avoid extra commentary, multiple follow-up questions, or meta references to the process.

    // User Given Instructions:
    // ${instructions.map((ui) => ui.job).join(', ')}

    // External Content:
    // ${external || 'No external content available'}

    // General Info:
    // ${info}

    // User Saved Memories:
    // ${memories}

    // THINKING CONTEXT:
    // <think>
    // I have analyzed the user's request. I will generate a concise, personalized response starting with a greeting, followed by the complete solution (e.g., code), without extra commentary.
    // ${thinking || "Processing the user's message for a direct and friendly answer."}
    // </think>

    // -------------------
    // User:
    // ${message}

    // -------------------
    // Your Response:`;

    return `
    SYSTEM PROMPT:
-----------------------------------------------------------
You are ErzenAI, a large language model designed to provide helpful, accurate, and engaging responses.

[GENERAL GUIDELINES]
- Use the "User Given Instructions" to understand the overall job and context.
- When incorporating external content, do so only if it adds clear value and enhances the conversation.
  - Use only the provided external links or media if they contribute meaningfully.
  - Always format any external content as proper Markdown.
  - Cite all sources appropriately when including external information.
- Integrate general information such as the current date or other pertinent details from the "General Info" section.
- Reference user saved memories only if they are directly relevant to the current prompt. Prioritize important names or key user details.
- Leverage the "THINKING CONTEXT" enclosed within '<think> ... </think>' to guide your internal reasoning, but ensure that your final response remains clear, direct, and user-friendly.
- Maintain a direct, friendly, and professional tone in your responses.

[DATA FIELDS]
1. **User Given Instructions:**
   ${instructions.map((ui) => ui.job).join(', ')}

2. **External Content Integration:**
   - Content Source: ${external || 'No external content available'}
   - Note: Integrate external content only if it clearly enhances the conversation. Otherwise, ignore this section.
   - Formatting: Convert any external links or media to Markdown and include citations.

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
    model: AIModels = AIModels.GeminiFast,
  ) {
    let MAX_STEPS = 20; // Default maximum steps
    let currentStep = 0;
    let fullReasoning = '';
    let finalAnswer = '';
    let complexity: 'low' | 'medium' | 'high' = 'low';

    // Initial system message with complexity assessment
    let prompt = this.createReasoningPrompt(
      message,
      'PROBLEM_DECOMPOSITION',
      '',
      'auto',
    );

    while (currentStep < MAX_STEPS) {
      const response = await this.aiWrapper.generateContentHistory(
        model,
        prompt,
        [],
      );

      const { reasoning, answer, nextStepType, detectedComplexity } =
        this.parseReasoningStep(response.content, currentStep);

      fullReasoning += `[Step ${currentStep + 1} - ${nextStepType}]\n${reasoning}\n\n`;

      // Set complexity after first step analysis
      if (currentStep === 0 && detectedComplexity) {
        complexity = detectedComplexity;
        MAX_STEPS = this.getMaxSteps(complexity);
      }

      if (answer && !finalAnswer) {
        finalAnswer = answer;
        break;
      }

      // Early exit check for low complexity
      if (complexity === 'low' && currentStep >= 1) {
        break;
      }

      prompt = this.createReasoningPrompt(
        message,
        nextStepType,
        fullReasoning,
        complexity,
      );

      currentStep++;
    }

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
      complexity,
    };
  }

  async *streamChainOfThought(
    message: string,
    userId: string,
    model: AIModels = AIModels.GeminiFast,
  ): AsyncGenerator<any> {
    let MAX_STEPS = 20;
    let currentStep = 0;
    let fullReasoning = '';
    let finalAnswer = '';
    let complexity: 'low' | 'medium' | 'high' = 'low';

    let prompt = this.createReasoningPrompt(
      message,
      'PROBLEM_DECOMPOSITION',
      '',
      'auto',
    );

    while (currentStep < MAX_STEPS) {
      const response = await this.aiWrapper.generateContentHistory(
        model,
        prompt,
        [],
      );

      const { reasoning, answer, nextStepType, detectedComplexity } =
        this.parseReasoningStep(response.content, currentStep);

      // Stream individual tokens if your AI wrapper supports it
      // Otherwise stream whole reasoning steps
      for await (const token of this.tokenizeResponse(reasoning)) {
        yield { type: 'thinking', content: token };
      }

      fullReasoning += `[Step ${currentStep + 1} - ${nextStepType}]\n${reasoning}\n\n`;

      if (currentStep === 0 && detectedComplexity) {
        complexity = detectedComplexity;
        MAX_STEPS = this.getMaxSteps(complexity);
        yield { type: 'complexity', content: complexity };
      }

      if (answer && !finalAnswer) {
        finalAnswer = answer;
        yield { type: 'answer', content: answer };
        break;
      }

      yield { type: 'step-complete', content: currentStep + 1 };

      if (complexity === 'low' && currentStep >= 1) {
        break;
      }

      prompt = this.createReasoningPrompt(
        message,
        nextStepType,
        fullReasoning,
        complexity,
      );
      currentStep++;
    }

    if (!finalAnswer) {
      finalAnswer = await this.generateFinalAnswer(
        message,
        fullReasoning,
        model,
      );
      yield { type: 'answer', content: finalAnswer };
    }

    yield {
      type: 'complete',
      content: { reasoning: fullReasoning.trim(), steps: currentStep + 1 },
    };
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

  private parseReasoningStep(
    response: string,
    currentStep: number,
  ): {
    reasoning: string;
    answer?: string;
    nextStepType: ReasoningStepType;
    detectedComplexity?: 'low' | 'medium' | 'high';
  } {
    // First, clean the response
    const cleanResponse = response
      .replace(/```/g, '')
      .replace(/\n+/g, '\n')
      .trim();

    // Extract complexity from first step
    let complexity: 'low' | 'medium' | 'high' | undefined;
    if (currentStep === 0) {
      const complexityMatch = cleanResponse.match(
        /COMPLEXITY:\s*(low|medium|high)/i,
      );
      complexity = complexityMatch?.[1]?.toLowerCase() as
        | 'low'
        | 'medium'
        | 'high';
    }

    // Extract reasoning with multiple fallback patterns
    const reasoning = this.extractSection(cleanResponse, [
      /THINKING:\s*((?:.|\n)+?)(?=\s*(?:NEXT_STEP|ANSWER|COMPLEXITY|$))/i,
      /ANALYSIS:\s*((?:.|\n)+?)(?=\s*(?:PROCEED|RESPONSE|$))/i,
      /((?:.|\n)+?)(?=\s*(?:NEXT_STEP|ANSWER|COMPLEXITY|$))/i,
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
      detectedComplexity: complexity,
    };
  }

  private createReasoningPrompt(
    message: string,
    stepType: ReasoningStepType,
    previousReasoning: string,
    complexity: 'auto' | 'low' | 'medium' | 'high' = 'auto',
  ): string {
    const complexityInstruction =
      complexity === 'auto' && stepType === 'PROBLEM_DECOMPOSITION'
        ? `First determine problem complexity (low/medium/high) considering:\n` +
          `- Technical depth required\n- Number of system components\n- Potential edge cases\n` +
          `Include COMPLEXITY: [your assessment] in your response\n\n`
        : '';

    const basePrompt = `
      You are a senior engineer solving: "${message}"
      ${complexityInstruction}
      Current phase: ${STEP_ORDER.indexOf(stepType) + 1}/${STEP_ORDER.length} - ${stepType.replace(/_/g, ' ')}
      ${this.getAdaptiveStepInstructions(stepType, complexity)}
  
      Previous analysis:
      ${previousReasoning || 'No previous analysis yet'}
  
      Format exactly:
      THINKING: [your analysis]
      ${stepType === 'PROBLEM_DECOMPOSITION' ? 'COMPLEXITY: [low|medium|high]' : ''}
      NEXT_STEP: [${STEP_ORDER.join('|')}]
      ${stepType === 'FINAL_SYNTHESIS' ? 'ANSWER: [final solution]' : ''}
  
      Rules:
      1. Match technical depth to problem complexity
      2. Be concise for low complexity issues
      3. Detailed analysis for complex problems
      4. Acknowledge solution uncertainties
    `;

    return basePrompt.replace(/^ {4}/gm, '').trim();
  }

  private getAdaptiveStepInstructions(
    step: ReasoningStepType,
    complexity: 'auto' | 'low' | 'medium' | 'high',
  ): string {
    const depthModifier =
      complexity === 'low'
        ? ' (brief analysis)'
        : complexity === 'high'
          ? ' (detailed analysis)'
          : '';

    return {
      PROBLEM_DECOMPOSITION:
        `Break down the problem${depthModifier}:` +
        `\n1. Core requirements\n2. Technical challenges\n3. Success criteria`,
      // ... other steps with complexity-aware instructions
      FINAL_SYNTHESIS:
        `Synthesize solution${depthModifier}:\n` +
        `1. Validate requirements\n2. Confirm architecture\n3. Final implementation`,
    }[step];
  }

  private getMaxSteps(complexity: string): number {
    return (
      {
        low: 3,
        medium: 6,
        high: 10,
      }[complexity] || 6
    ); // Default to medium
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
}
