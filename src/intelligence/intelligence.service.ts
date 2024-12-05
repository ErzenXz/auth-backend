import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIResponse } from './models/intelligence.types';
import { ChatMessageDto } from './dtos/create-chat.dto';
import { IHttpContext } from 'src/auth/models';

@Injectable()
export class IntelligenceService {
  private readonly genAI: GoogleGenerativeAI;
  private readonly defaultModel;
  private readonly advancedModel;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('GOOGLE_API_KEY');
    this.genAI = new GoogleGenerativeAI(apiKey);

    this.defaultModel = this.configService.get<string>('GOOGLE_AI_MODEL_NAME');
    this.advancedModel = this.configService.get<string>(
      'GOOGLE_AI_MODEL_NAME_ADVANCED',
    );
  }
  async createInstruction(name: string, description?: string, schema?: string) {
    // If schema exists and appears to be JSON, try to parse and unescape it
    if (schema) {
      try {
        JSON.parse(schema);
        schema = JSON.parse(JSON.stringify(schema));
      } catch (e) {}
    }

    return await this.prisma.instruction.create({
      data: { name, description, schema },
    });
  }

  async processInstruction(
    instructionId: number,
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

      let model = this.genAI.getGenerativeModel({
        model: this.defaultModel,
      });

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

      const rewrittenPromptResult =
        await model.generateContent(firstAgentPrompt);
      const cleanedPrompt = rewrittenPromptResult.response.text().trim();

      // Agent 2: Generate content with type-specific formatting
      const workerPrompt = `
        Primary Task:
        - Process "${instruction.name}"
        - Context: ${instruction.description}
        - Input: ${cleanedPrompt}
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

      const workerResult = await model.generateContent(workerPrompt);
      let workerOutput = workerResult.response.text().trim();

      // Remove any markdown code block indicators
      workerOutput = workerOutput.replace(/```json\n?|\n?```/g, '');

      // Agent 3: Validate and ensure format compliance
      const reviewerPrompt = `
        Primary Task:
        - Process "${instruction.name}"
        - Context: ${instruction.description}
        - Input: ${cleanedPrompt}
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

      const reviewerResult = await model.generateContent(reviewerPrompt);
      const finalOutput = reviewerResult.response
        .text()
        .trim()
        .replace(/```json\n?|\n?```/g, '');

      try {
        const parsedJson = JSON.parse(finalOutput);
        return { result: parsedJson };
      } catch (e) {
        // Attempt to salvage content by wrapping in proper JSON structure
        try {
          const sanitizedContent = finalOutput
            .replace(/^["']|["']$/g, '') // Remove outer quotes
            .replace(/\\n/g, '\n'); // Convert \n to actual newlines

          return {
            result: {
              content: sanitizedContent,
            },
          };
        } catch {
          return {
            result: {
              error: 'Failed to generate valid JSON response',
            },
          };
        }
      }
    } catch (error) {
      return {
        result: {
          error: error.message || 'Failed to process prompt',
        },
      };
    }
  }

  async generatePersonalizedResponse(
    prompt: string,
    context: IHttpContext,
  ): Promise<AIResponse> {
    try {
      const userInstructions = await this.prisma.userInstruction.findMany({
        where: { userId: context.user.id },
      });

      let model = this.genAI.getGenerativeModel({
        model: this.advancedModel,
      });

      const workerPrompt = `
        Primary Task:
        - Process "Master_Conversation"
        - Context: Given a user’s input, create a highly personalized, empathetic, and emotionally aware responses that exhibit deep understanding, active listening, and adapt to the user’s mood or context. The response should not only be contextually relevant but also show genuine interest in the user’s thoughts, feelings, or situation. Additionally, responses should include follow-up questions or suggestions that encourage meaningful dialogue, reinforce trust, and foster a deeper connection. Each response should feel natural, warm, and thoughtful, ranging in tone from friendly and comforting to inspiring and motivational, based on the emotional context of the conversation.
        - User Guidelines: ${userInstructions.map((ui) => ui.job).join(', ')}
        - Input: ${prompt}

        Output Format Rules:     
        1. If no format specified:
           Return: {"content": "your response here"}

        Strict Requirements:
        - ALWAYS output valid JSON with a "content" field
        - Escape special characters properly
        - Follow user guidelines exactly
        
        Process the input and format according to these rules.
        `;

      const workerResult = await model.generateContent(workerPrompt);

      // const reviewerResult = await model.generateContent(reviewerPrompt);
      const finalOutput = workerResult.response
        .text()
        .trim()
        .replace(/```json\n?|\n?```/g, '');

      try {
        const parsedJson = JSON.parse(finalOutput);
        return { result: parsedJson };
      } catch (e) {
        try {
          const sanitizedContent = finalOutput
            .replace(/^["']|["']$/g, '') // Remove outer quotes
            .replace(/\\n/g, '\n'); // Convert \n to actual newlines

          return {
            result: {
              content: sanitizedContent,
            },
          };
        } catch {
          return {
            result: {
              error: 'Failed to generate valid JSON response',
            },
          };
        }
      }
    } catch (error) {
      return {
        result: {
          error: error.message || 'Failed to process prompt',
        },
      };
    }
  }

  async processInstructionBeta(
    prompt: string,
    context: IHttpContext,
  ): Promise<AIResponse> {
    try {
      const instructions = await this.prisma.instruction.findMany();
      if (instructions.length === 0) {
        throw new BadRequestException('No instructions available');
      }

      const model = this.genAI.getGenerativeModel({
        model: this.advancedModel,
      });

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

      const instructionSelectionResult = await model.generateContent(
        instructionSelectionPrompt,
      );
      const selectedInstructionName = instructionSelectionResult.response
        .text()
        .trim();

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
      return await this.processInstruction(
        selectedInstruction.id,
        prompt,
        context,
      );
    } catch (error) {
      return {
        result: {
          error: error.message || 'Failed to process beta prompt',
        },
      };
    }
  }

  async executeChatPrompt(
    prompt: string,
    context: IHttpContext,
  ): Promise<AIResponse> {
    try {
      return await this.generatePersonalizedResponse(prompt, context);
    } catch (error) {
      return {
        result: {
          error: error.message || 'Failed to process beta prompt',
        },
      };
    }
  }

  async processChat(
    message: string,
    context: IHttpContext,
    history?: ChatMessageDto[],
  ): Promise<AIResponse> {
    // Fetch user memories
    const memories = await this.prisma.userMemory.findMany({
      where: { userId: context.user.id },
    });

    // Format memories for context with conditional relevance instruction
    const memoryContext =
      memories.length > 0
        ? `Current Date: ${new Date().toLocaleString('en-US', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: true,
          })}       \nPrevious context about the user:\n${memories.map((m) => `- ${m.key}: ${m.value}`).join('\n')}\n\n` +
          `Instructions for using context:
          1. Only reference these details if directly relevant to the current question or topic
          2. Don't mention these details if the question is general or unrelated
          3. Prioritize answering the immediate question first
          4. Use context only to enhance or personalize relevant responses\n\n`
        : '';

    // Combine history with the new message
    const chatHistory = history
      ? history.map((h) => `${h.sender}: ${h.message}`).join('\n')
      : '';

    const fullPrompt = `${memoryContext}\n Previous chat history: ${chatHistory}\nUser: ${message}\nAI:`;

    // Extract and save user memories asynchronously
    this.extractAndSaveMemory(message, context.user.id).catch((error) => {
      // Optionally log the error
      console.error('Failed to save user memory:', error);
    });

    // Process the fullPrompt as needed
    const result = await this.executeChatPrompt(fullPrompt, context);

    return result;
  }

  private async extractAndSaveMemory(
    message: string,
    userId: number,
  ): Promise<void> {
    const extractionPrompt = `
      You are an expert at understanding human behavior and information extraction.
      Analyze this message to extract meaningful personal information about the user.
      Be precise and only extract explicitly stated information, focusing on:

      1. INTERESTS:
       - Direct likes ("I love/enjoy/like...")
       - Hobbies and activities
       - Entertainment preferences

      2. PERSONAL DETAILS:
       - Demographics (age, location, etc.)
       - Professional info (job, education)
       - Family/relationships

      3. BEHAVIOR PATTERNS:
       - Daily routines
       - Habits
       - Schedule patterns

      4. EXPERTISE & SKILLS:
       - Technical knowledge
       - Professional skills
       - Areas of experience

      5. SENTIMENTS:
       - Current mood/feelings
       - Opinions
       - Attitudes

      6. ASPIRATIONS:
       - Future plans
       - Goals
       - Desires

      Message to analyze: "${message}"

      Rules:
      1. Only extract EXPLICITLY stated information
      2. Do not make assumptions or inferences
      3. Keep values under 50 characters
      4. Use clear, specific keys
      5. Avoid duplicates
      6. Maintain factual accuracy

      Return as JSON array of {key, value} pairs only:
      [
      {"key": "Likes_Gaming", "value": "Plays Minecraft daily"},
      {"key": "Work_Status", "value": "Software Engineer at Tech Corp"},
      {"key": "Goal_2024", "value": "Learn AI Development"}
      ]
    `;

    const model = this.genAI.getGenerativeModel({
      model: this.defaultModel,
    });

    try {
      const aiResponse = await model.generateContent(extractionPrompt);
      let aiText = aiResponse.response.text().trim();

      // Remove markdown code block indicators and any surrounding whitespace
      aiText = aiText.replace(/```json\s?|\s?```/g, '').trim();

      // Ensure the response starts with [ and ends with ]
      if (!aiText.startsWith('[')) {
        aiText = aiText.substring(aiText.indexOf('['));
      }
      if (!aiText.endsWith(']')) {
        aiText = aiText.substring(0, aiText.lastIndexOf(']') + 1);
      }

      const extractedData: Array<{ key: string; value: string }> =
        JSON.parse(aiText);

      for (const item of extractedData) {
        await this.prisma.userMemory.upsert({
          where: {
            userId_key_value: {
              userId,
              key: item.key,
              value: item.value,
            },
          },
          update: {},
          create: {
            userId,
            key: item.key,
            value: item.value,
          },
        });
      }
    } catch (error) {
      console.error('AI Memory Extraction Failed:', error);
    }
  }

  async listInstructions() {
    return await this.prisma.instruction.findMany();
  }

  async deleteInstruction(id: number) {
    return await this.prisma.instruction.delete({
      where: { id },
    });
  }

  async listUserMemory(userId: number) {
    return await this.prisma.userMemory.findMany({
      where: { userId },
    });
  }

  async deleteMemory(userId: number) {
    return await this.prisma.userMemory.deleteMany({
      where: { userId },
    });
  }

  async createUserInstruction(userId: number, job: string) {
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

  async getUserInstructions(userId: number) {
    return this.prisma.userInstruction.findMany({
      where: { userId },
    });
  }

  async updateUserInstruction(
    userId: number,
    instructionId: number,
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

  async deleteUserInstruction(userId: number, instructionId: number) {
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
}
