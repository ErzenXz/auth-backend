import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIResponse } from './models/intelligence.types';
import { ChatMessageDto } from './dtos/create-chat.dto';
import { IHttpContext } from 'src/auth/models';
import { BrowserService } from './browser/browser.service';

@Injectable()
export class IntelligenceService {
  private readonly genAI: GoogleGenerativeAI;
  private readonly defaultModel;
  private readonly advancedModel;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly browserService: BrowserService,
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
    chatHistory: string,
    userMemories: string,
    generalInfo: string,
    externalContent: string,
    context: IHttpContext,
  ): Promise<AIResponse> {
    try {
      const userInstructions = await this.prisma.userInstruction.findMany({
        where: { userId: context.user.id },
      });

      let model = this.genAI.getGenerativeModel({
        model: this.defaultModel,
      });

      const workerPrompt = `
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
        - User Instructions: \n ${userInstructions.map((ui) => ui.job).join(', ')}
        - Format all responses in Markdown
        - When returning code snippets, use proper syntax highlighting with triple backticks
        - Use proper Markdown syntax for links, images, and videos
        - Input: \${prompt}

        External Content Integration:
        - Incorporate relevant search results from: \n ${externalContent || 'No external content available'} only if it adds value to the conversation and enhances user experience; otherwise, ignore it.
        - Only use external links/media if they add value
        - Always convert external content to proper Markdown format
        - Cite sources when using external information

        Output Format Rules:
        - Return structure: {"content": "markdown_formatted_response"}

        Strict Requirements:
        - Generate valid JSON with "content" field
        - Ensure proper character escaping
        - Use complete Markdown syntax (no placeholders)
        - Balance original response with external content
        - Maintain natural, conversational tone
        - Be friendly and act like an actual AI assistant
        - Use user memory appropriately; do not overuse or force references
        - Prioritize recent and important user information

        Input Structure:
        General Info:
        \n ${generalInfo}

        User Saved Memories (Use only what is relevant to the user prompt; older memories are less relevant except for names and important user info):
        \n ${userMemories}

        Previous chat history:
        \n ${chatHistory}

        User:
        \n ${prompt}

        AI:`;

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

  private async determineIfBrowsingNeeded(
    message: string,
    chatHistory: string,
  ): Promise<string> {
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

  **Context:**

  \`\`\`
  ${chatHistory}
  \`\`\`

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

    const model = this.genAI.getGenerativeModel({
      model: this.defaultModel,
    });

    const aiResult = await model.generateContent(prompt);
    let response = aiResult.response.text().trim();
    response = response.replace(/```json\s?|\s?```/g, '').trim();

    // Validate response
    if (response !== 'no' || response.length > 0) {
      return response;
    }
    return 'no';
  }

  async executeChatPrompt(
    prompt: string,
    chatHistory: string,
    userMemories: string,
    generalInfo: string,
    context: IHttpContext,
  ): Promise<AIResponse> {
    try {
      let externalContent = '';

      let searchQuery = await this.determineIfBrowsingNeeded(
        prompt,
        chatHistory,
      );
      if (searchQuery !== 'no') {
        externalContent = (
          await this.browserService.searchAndProcess(searchQuery)
        ).result.content;
      }

      return await this.generatePersonalizedResponse(
        prompt,
        chatHistory,
        userMemories,
        generalInfo,
        externalContent,
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

  async processChat(
    message: string,
    context: IHttpContext,
    history?: ChatMessageDto[],
  ): Promise<AIResponse> {
    // Fetch user memories
    const memory = await this.retrieveRelevantMemories(
      message,
      context.user.id,
    );

    const chatHistory = this.formatChatHistory(history, message);

    const generalInfo = `
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
      
      Device Information:
      - Platform: ${process.platform}
      - Node Version: ${process.version}
      - Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
      
      System Status:
      - Process Uptime: ${Math.floor(process.uptime())} seconds
      - System Load: ${require('os')
        .loadavg()
        .map((load) => load.toFixed(2))
        .join(', ')}
      - Free Memory: ${Math.round(require('os').freemem() / 1024 / 1024)}MB
    `;

    // Extract and save user memories asynchronously
    this.extractAndSaveMemory(message, context.user.id).catch((error) => {
      // Optionally log the error
      console.error('Failed to save user memory:', error);
    });

    return await this.executeChatPrompt(
      message,
      chatHistory,
      memory,
      generalInfo,
      context,
    );
  }

  private async retrieveRelevantMemories(message: string, userId: number) {
    const memories = await this.prisma.userMemory.findMany({
      where: { userId },
    });
    // Implement logic to filter memories based on relevance to the message
    // For now, return all memories

    return this.formatMemoryContext(memories);
  }

  private formatChatHistory(
    history: ChatMessageDto[] | undefined,
    message: string,
  ): string {
    if (history && history.length > 50) {
      // Summarize the history if it's too long
      history = history.slice(-50);
    }
    const formattedHistory = history
      ? history.map((h) => `${h.sender}: ${h.message}`).join('\n')
      : '';
    return `${formattedHistory}\nUser: ${message}\nAI:`;
  }

  private getTimeAgo(date: Date): string {
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    let interval = Math.floor(seconds / 31536000);
    if (interval >= 1) {
      return interval === 1 ? '1 year ago' : `${interval} years ago`;
    }
    interval = Math.floor(seconds / 2592000);
    if (interval >= 1) {
      return interval === 1 ? '1 month ago' : `${interval} months ago`;
    }
    interval = Math.floor(seconds / 86400);
    if (interval >= 1) {
      return interval === 1 ? '1 day ago' : `${interval} days ago`;
    }
    interval = Math.floor(seconds / 3600);
    if (interval >= 1) {
      return interval === 1 ? '1 hour ago' : `${interval} hours ago`;
    }
    interval = Math.floor(seconds / 60);
    if (interval >= 1) {
      return interval === 1 ? '1 minute ago' : `${interval} minutes ago`;
    }
    return 'Just now';
  }

  private formatMemoryContext(memories: any[]): string {
    if (!memories.length) return '';
    return `User Memories:\n${memories
      .map((m) => `- ${m.key}: ${m.value} ${this.getTimeAgo(m.createdAt)}`)
      .join('\n')}\n`;
  }

  private async extractAndSaveMemory(
    message: string,
    userId: number,
  ): Promise<void> {
    const memories = await this.retrieveRelevantMemories(message, userId);
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

    const model = this.genAI.getGenerativeModel({
      model: this.defaultModel,
    });

    try {
      const aiResponse = await model.generateContent(extractionPrompt);
      let aiText = aiResponse.response.text().trim();
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
