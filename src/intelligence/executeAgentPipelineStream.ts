import { NotFoundException } from "@nestjs/common";
import { AIModels } from "./enums/models.enum";

/**
 * Stream version of executeAgentPipeline that emits results via callback
 * This method provides a complete implementation for streaming agent execution
 * @param message User's message/instruction 
 * @param projectId Project ID
 * @param threadId Optional thread ID for conversation context
 * @param userId User ID for authorization and context
 * @param emitCallback Callback function to emit events during processing
 */
export async function executeAgentPipelineStream(
  message: string,
  projectId: string,
  threadId: string | undefined,
  userId: string,
  emitCallback: (data: any) => void,
): Promise<void> {
  try {
    // 1. Emit initial status
    emitCallback({
      type: 'status',
      message: 'Starting agent pipeline...',
      timestamp: new Date().toISOString(),
    });

    // 2. Validate project access and get project context
    const project = await this.prisma.aIProject.findFirst({
      where: {
        id: projectId,
        OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
      },
      include: { files: { include: { currentVersion: true } } },
    });

    if (!project) {
      emitCallback({
        type: 'error',
        message: 'Project not found or you do not have access',
        timestamp: new Date().toISOString(),
      });
      throw new NotFoundException('Project not found or you do not have access');
    }

    emitCallback({
      type: 'status',
      message: `Project "${project.name}" loaded with ${project.files.length} files`,
      timestamp: new Date().toISOString(),
    });

    // 3. Get or create a thread for conversation context
    let currentThreadId = threadId;
    try {
      if (!currentThreadId) {
        const newThread = await this.prisma.aIThread.create({
          data: {
            title: `${message.split('\n')[0].slice(0, 50)}...`,
            userId,
            projectId,
          },
        });
        currentThreadId = newThread.id;
        
        emitCallback({
          type: 'thread',
          threadId: currentThreadId,
          message: 'Created new conversation thread',
          timestamp: new Date().toISOString(),
        });
      } else {
        const thread = await this.prisma.aIThread.findFirst({
          where: { id: currentThreadId, projectId },
        });
        if (!thread) {
          emitCallback({
            type: 'error',
            message: 'Thread not found or does not belong to this project',
            timestamp: new Date().toISOString(),
          });
          throw new NotFoundException(
            'Thread not found or does not belong to this project',
          );
        }
        
        emitCallback({
          type: 'thread',
          threadId: currentThreadId,
          message: 'Using existing conversation thread',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      emitCallback({
        type: 'error',
        message: `Error managing thread: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }

    // 4. Retrieve conversation history for context
    let conversationHistory = [];
    try {
      const previousMessages = await this.prisma.aIThreadMessage.findMany({
        where: { chatId: currentThreadId },
        orderBy: { createdAt: 'asc' },
        take: 100, // Limit history to recent messages
      });

      conversationHistory = previousMessages.map((msg) => ({
        role: msg.role,
        message: msg.content,
      }));

      emitCallback({
        type: 'context',
        messageCount: previousMessages.length,
        message: 'Loaded conversation history',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      emitCallback({
        type: 'warning',
        message: `Error loading conversation history: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
      // Continue without history if there's an error
    }

    const startTime = new Date().getTime();

    // 5. Add the user's message to the conversation history
    try {
      await this.prisma.aIThreadMessage.create({
        data: {
          chatId: currentThreadId,
          role: 'user',
          content: message,
          createdAt: new Date(startTime),
        },
      });
      
      emitCallback({
        type: 'message',
        role: 'user',
        content: message,
        timestamp: new Date(startTime).toISOString(),
      });
    } catch (error) {
      emitCallback({
        type: 'warning',
        message: `Error saving user message: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
      // Continue even if saving the message fails
    }

    // 6. Initialize agent state with project context
    const projectFiles = project.files.map((file) => ({
      id: file.id,
      name: file.name,
      path: file.path,
      content: file.currentVersion?.content || '',
      lastModified: file.currentVersion?.createdAt || new Date(),
    }));

    emitCallback({
      type: 'status',
      message: 'Initializing AI agent...',
      timestamp: new Date().toISOString(),
    });

    // 7. Model selection based on task complexity
    const defaultModel = AIModels.GeminiFlash_2_5; // Default to Gemini Flash 2.5

    // 8. Track function execution results
    const functionExecutionResults = [];
    
    // 9. Define tool functions with streaming support
    const toolFunctions = {
      codebase_search: async (query: string, targetDirs: string[] = []) => {
        try {
          emitCallback({
            type: 'function_start',
            tool: 'codebase_search',
            params: { query, targetDirs },
            timestamp: new Date().toISOString(),
          });
          
          const results = await this.executeAgentPipeline_codebase_search(query, targetDirs);
          
          emitCallback({
            type: 'function_result',
            tool: 'codebase_search',
            result: results,
            timestamp: new Date().toISOString(),
          });
          
          return results;
        } catch (error) {
          emitCallback({
            type: 'function_error',
            tool: 'codebase_search',
            error: error.message,
            timestamp: new Date().toISOString(),
          });
          return { error: error.message };
        }
      },
      
      read_file: async (filePath: string, startLine: number = 1, endLine?: number) => {
        try {
          emitCallback({
            type: 'function_start',
            tool: 'read_file',
            params: { filePath, startLine, endLine },
            timestamp: new Date().toISOString(),
          });
          
          const result = await this.executeAgentPipeline_read_file(filePath, startLine, endLine);
          
          emitCallback({
            type: 'function_result',
            tool: 'read_file',
            result,
            timestamp: new Date().toISOString(),
          });
          
          return result;
        } catch (error) {
          emitCallback({
            type: 'function_error',
            tool: 'read_file',
            error: error.message,
            timestamp: new Date().toISOString(),
          });
          return { error: error.message };
        }
      },
      
      run_terminal_cmd: async (command: string, isBackground: boolean = false) => {
        try {
          emitCallback({
            type: 'function_start',
            tool: 'run_terminal_cmd',
            params: { command, isBackground },
            timestamp: new Date().toISOString(),
          });
          
          const result = await this.executeAgentPipeline_run_terminal_cmd(command, isBackground);
          
          emitCallback({
            type: 'function_result',
            tool: 'run_terminal_cmd',
            result,
            timestamp: new Date().toISOString(),
          });
          
          return result;
        } catch (error) {
          emitCallback({
            type: 'function_error',
            tool: 'run_terminal_cmd',
            error: error.message,
            timestamp: new Date().toISOString(),
          });
          return { error: error.message };
        }
      },
      
      list_dir: async (relativePath: string = '') => {
        try {
          emitCallback({
            type: 'function_start',
            tool: 'list_dir',
            params: { relativePath },
            timestamp: new Date().toISOString(),
          });
          
          const result = await this.executeAgentPipeline_list_dir(relativePath);
          
          emitCallback({
            type: 'function_result',
            tool: 'list_dir',
            result,
            timestamp: new Date().toISOString(),
          });
          
          return result;
        } catch (error) {
          emitCallback({
            type: 'function_error',
            tool: 'list_dir',
            error: error.message,
            timestamp: new Date().toISOString(),
          });
          return { error: error.message };
        }
      },
      
      edit_file: async (filePath: string, content: string, description: string = 'File edit') => {
        try {
          emitCallback({
            type: 'function_start',
            tool: 'edit_file',
            params: { filePath, description },
            timestamp: new Date().toISOString(),
          });
          
          const result = await this.executeAgentPipeline_edit_file(filePath, content, description);
          
          emitCallback({
            type: 'function_result',
            tool: 'edit_file',
            result,
            timestamp: new Date().toISOString(),
          });
          
          return result;
        } catch (error) {
          emitCallback({
            type: 'function_error',
            tool: 'edit_file',
            error: error.message,
            timestamp: new Date().toISOString(),
          });
          return { error: error.message };
        }
      },
      
      thinking: async (thoughts: string) => {
        try {
          emitCallback({
            type: 'thinking',
            content: thoughts,
            timestamp: new Date().toISOString(),
          });
          
          return { success: true };
        } catch (error) {
          return { error: error.message };
        }
      }
    };

    // 10. Execute the AI agent with the prepared context and tool functions
    try {
      emitCallback({
        type: 'status',
        message: 'Processing your request with AI agent...',
        timestamp: new Date().toISOString(),
      });
      
      // Create a system prompt for the AI agent
      const systemPrompt = this.createAgentSystemPrompt(projectFiles);
      
      // Track execution statistics
      const executionStart = new Date().getTime();
      
      // Create the AI request message with user's message and conversation history
      const userMessage = this.createAgentUserMessage(
        message,
        conversationHistory,
      );
      
      // Call the AI with the system prompt, user message, and tool functions
      const response = await this.aiWrapper.callAIWithTools(
        systemPrompt,
        userMessage,
        defaultModel,
        toolFunctions,
        (toolCall) => {
          // Function call listener - emit function calls as they happen
          emitCallback({
            type: 'function_call',
            tool: toolCall.name,
            params: toolCall.arguments,
            timestamp: new Date().toISOString(),
          });
          
          functionExecutionResults.push({
            tool: toolCall.name,
            params: toolCall.arguments,
            timestamp: new Date().toISOString(),
          });
        },
      );
      
      // Get final response
      const finalContent = response.content || 'No response from AI agent';
      const functionCalls = response.function_calls || [];
      const executedFunctions = functionExecutionResults;
      const executionEnd = new Date().getTime();
      const executionTime = (executionEnd - executionStart) / 1000;
      
      // Save the AI response message to the thread
      try {
        await this.prisma.aIThreadMessage.create({
          data: {
            chatId: currentThreadId,
            role: 'assistant',
            content: finalContent,
            executionDetails: JSON.stringify({
              function_calls: functionCalls,
              executed_functions: executedFunctions,
              execution_time: executionTime,
            }),
            createdAt: new Date(),
          },
        });
      } catch (error) {
        emitCallback({
          type: 'warning',
          message: `Error saving AI response: ${error.message}`,
          timestamp: new Date().toISOString(),
        });
      }
      
      // Emit the final response
      emitCallback({
        type: 'response',
        content: finalContent,
        functionCalls: functionCalls,
        executedFunctions: executedFunctions,
        executionTime: `${executionTime.toFixed(2)}s`,
        timestamp: new Date().toISOString(),
      });
      
      // Return success
      emitCallback({
        type: 'complete',
        message: 'Agent pipeline execution completed successfully',
        timestamp: new Date().toISOString(),
      });
      
    } catch (error) {
      // Handle AI execution errors
      emitCallback({
        type: 'error',
        message: `Error executing AI agent: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
      
      throw error;
    }
    
  } catch (error) {
    // Handle any outer errors
    emitCallback({
      type: 'error',
      message: `Error in agent pipeline: ${error.message}`,
      details: error.stack,
      timestamp: new Date().toISOString(),
    });
    
    throw error;
  }
}
