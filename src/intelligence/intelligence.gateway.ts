import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { IntelligenceService } from './intelligence.service';
import { CreateChatDto } from './dtos/create-chat.dto';
import { JwtService } from '@nestjs/jwt';
import { AIModels } from './enums/models.enum';

@WebSocketGateway({
  namespace: '/ai',
})
export class IntelligenceGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly intelligenceService: IntelligenceService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.query.token as string;

    try {
      const payload = this.jwtService.verify(token);
      client.join(`user_${payload.sub}`);
      client.data.userId = payload.sub;
    } catch (err) {
      console.info('Invalid token:', err.message);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {}

  private async handleStreamOutput(client: Socket, stream: any) {
    try {
      let thinkingContents = []; // Create an array to collect thinking content
      let messageContent = []; // Create an array to collect message content

      for await (const chunk of stream) {
        if (typeof chunk === 'string') {
          if (chunk.startsWith('__ERROR__')) {
            try {
              const errorContent = JSON.parse(chunk.replace('__ERROR__', ''));
              client.emit('chatError', errorContent);
              break; // Stop processing after error
            } catch (e) {
              console.error('Error parsing error data:', e);
              client.emit('chatError', { error: chunk });
              break;
            }
          } else if (chunk.startsWith('__THINKING__')) {
            try {
              const thinkingContent = JSON.parse(
                chunk.replace('__THINKING__', ''),
              );
              // Store the thinking content for later
              thinkingContents.push(thinkingContent.content);
              // Still emit the thinking event for real-time display
              client.emit('chatThinking', {
                content: thinkingContent.content,
              });
            } catch (e) {
              console.error('Error parsing thinking data:', e);
            }
          } else if (
            chunk.includes('__STEP_COMPLETE__') ||
            chunk.includes('__COMPLEXITY__')
          ) {
            // Skip emitting these special messages
          } else {
            // Add to the message content array
            messageContent.push(chunk);
            // Emit the chunk as normal
            client.emit('chatChunk', { content: chunk });
          }
        } else {
          // Handle non-string chunks
          messageContent.push(chunk);
          client.emit('chatChunk', { content: chunk });
        }
      }

      // If we've collected thinking content, prepend it to the final message when complete
      if (thinkingContents.length > 0) {
        const completeThinking = thinkingContents.join('\n');
        const formattedThinking = `<think>\n${completeThinking}\n</think>\n\n`;

        // Emit the complete message with thinking prepended
        client.emit('chatComplete', {
          status: 'done',
          thinking: completeThinking,
          completeMessage: formattedThinking + messageContent.join(''),
        });
      } else {
        client.emit('chatComplete', { status: 'done' });
      }

      return true;
    } catch (error) {
      console.error('Stream processing error:', error);
      client.emit('chatError', {
        error: `Stream processing failed: ${error.message}`,
      });
      return false;
    }
  }

  @SubscribeMessage('chatStreaming')
  async handleChatStreaming(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      message: string;
      chatId?: string;
      model?: string;
      systemPrompt?: string;
      tools?: {
        browsing?: boolean;
        reasoning?: boolean;
        research?: boolean;
        // Add future tools here
      };
    },
  ) {
    try {
      // Get userId from client data or use a default for non-auth operations
      const userId = client.data.userId;

      // If no user ID is available, we can't proceed with operations that require DB user association
      if (!userId) {
        client.emit('chatError', {
          error: 'User not authenticated. Please log in to use this feature.',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      client.emit('chatStarted', { status: 'processing' });

      try {
        // Convert model string to AIModels type
        const selectedModel = data.model as AIModels;

        // If research tool is enabled, perform detailed research
        if (data.tools?.research) {
          // Start research process
          client.emit('chatResearching', {
            status: 'started',
            message: 'Starting deep research...',
            timestamp: new Date().toISOString(),
          });

          try {
            // Generate search queries
            client.emit('chatResearching', {
              status: 'generating_queries',
              message: 'Generating research queries...',
              timestamp: new Date().toISOString(),
            });

            const searchQueries = await this.generateSearchQueries(
              data.message,
            );

            client.emit('chatResearching', {
              status: 'queries_generated',
              message: `Generated ${searchQueries.length} search queries`,
              queries: searchQueries,
              timestamp: new Date().toISOString(),
            });

            // Perform detailed research using multiple sources
            let researchResults = [];
            for (const query of searchQueries) {
              client.emit('chatResearching', {
                status: 'searching',
                message: `Searching for: "${query}"`,
                currentQuery: query,
                timestamp: new Date().toISOString(),
              });

              try {
                const queryResults = await this.performSearchForSingleQuery(
                  query,
                  userId,
                );

                client.emit('chatResearching', {
                  status: 'search_complete',
                  message: `Found ${queryResults.length} results for "${query}"`,
                  count: queryResults.length,
                  sources: queryResults.map((s) => ({
                    title: s.title || 'Untitled',
                    url: s.url,
                    source: s.source || 'web',
                  })),
                  timestamp: new Date().toISOString(),
                });

                researchResults = [...researchResults, ...queryResults];
              } catch (searchError) {
                client.emit('chatResearching', {
                  status: 'search_error',
                  message: `Error searching for "${query}": ${searchError.message}`,
                  error: searchError.message,
                  timestamp: new Date().toISOString(),
                });
              }
            }

            // Tell client we're processing the research
            client.emit('chatResearching', {
              status: 'processing',
              message: `Processing ${researchResults.length} research sources...`,
              count: researchResults.length,
              timestamp: new Date().toISOString(),
            });

            // Add research results to systemPrompt
            const enhancedSystemPrompt = this.createResearchPrompt(
              data.systemPrompt || '',
              researchResults,
              data.message,
            );

            client.emit('chatResearching', {
              status: 'complete',
              message: 'Research completed, generating response...',
              timestamp: new Date().toISOString(),
            });

            // Process with the enhanced system prompt
            const stream = await this.intelligenceService.processChatStream(
              data.message,
              userId,
              data.chatId,
              selectedModel,
              data.tools.reasoning,
              enhancedSystemPrompt,
            );

            await this.handleStreamOutput(client, stream);
          } catch (researchError) {
            console.error('Research error:', researchError);
            client.emit('chatResearching', {
              status: 'error',
              message: 'Research failed, continuing with standard processing',
              error: researchError.message,
              timestamp: new Date().toISOString(),
            });

            // Fall back to standard processing
            const stream =
              data.tools.browsing || data.tools.reasoning
                ? await this.intelligenceService.processChatStream(
                    data.message,
                    userId,
                    data.chatId,
                    selectedModel,
                    data.tools.reasoning,
                  )
                : await this.intelligenceService.processChatPlainStream(
                    data.message,
                    userId,
                    data.chatId,
                    selectedModel,
                  );

            await this.handleStreamOutput(client, stream);
          }
        }
        // Process with standard browsing if enabled
        else if (data.tools?.browsing) {
          let browsingSuccessful = false;

          // Start the browsing process, with or without reasoning
          try {
            // First emit we're starting the browsing process
            client.emit('chatBrowsing', {
              status: 'started',
              message: 'Starting web browsing...',
              timestamp: new Date().toISOString(),
            });

            // Use our message to determine search queries
            client.emit('chatBrowsing', {
              status: 'analyzing',
              message: 'Analyzing your question...',
              timestamp: new Date().toISOString(),
            });

            // Get search queries from the message
            const searchQuery = await this.getSearchQueryFromMessage(
              data.message,
            );
            if (!searchQuery || searchQuery === 'no') {
              client.emit('chatBrowsing', {
                status: 'skipped',
                message: 'No search needed for this question',
                timestamp: new Date().toISOString(),
              });
            } else {
              try {
                // Check for user's remaining usage before starting the search
                const usageInfo =
                  await this.intelligenceService.getUserRemainingSearches(
                    userId,
                  );

                // Inform the user about their remaining searches
                client.emit('chatBrowsing', {
                  status: 'usage_info',
                  message: `You have ${usageInfo.remaining} of ${usageInfo.total} searches remaining this month.`,
                  usageInfo,
                  timestamp: new Date().toISOString(),
                });

                // Track the browsing results for the search
                client.emit('chatBrowsing', {
                  status: 'searching',
                  message: `Searching for: "${searchQuery}"`,
                  query: searchQuery,
                  timestamp: new Date().toISOString(),
                });

                // Set up the emit callback for aiSearchStream
                const emitBrowsingUpdates = (updateData: any) => {
                  // Add tavily data if available
                  if (updateData.rawTavilyData) {
                    // Don't send the entire raw data to client, just summary
                    client.emit('chatBrowsing', {
                      status: 'tavily_results',
                      message: `Found ${updateData.rawTavilyData.results?.length || 0} Tavily text results and ${updateData.rawTavilyData.images?.length || 0} images`,
                      tavilySummary: {
                        textCount:
                          updateData.rawTavilyData.results?.length || 0,
                        imageCount:
                          updateData.rawTavilyData.images?.length || 0,
                      },
                      timestamp: new Date().toISOString(),
                    });
                  } else {
                    client.emit('chatBrowsing', {
                      ...updateData,
                      timestamp: new Date().toISOString(),
                    });
                  }
                };

                // Use the aiSearchStream method via the intelligence service's performBrowsing method
                await this.intelligenceService.performBrowsing(
                  searchQuery,
                  emitBrowsingUpdates,
                  userId,
                );

                browsingSuccessful = true;
              } catch (browsingError) {
                console.error('Browsing error:', browsingError);
                client.emit('chatBrowsing', {
                  status: 'error',
                  message:
                    'Browsing failed, continuing with standard processing',
                  error: browsingError.message,
                  timestamp: new Date().toISOString(),
                });
              }
            }
          } catch (browsingSetupError) {
            console.error('Browsing setup error:', browsingSetupError);
            client.emit('chatBrowsing', {
              status: 'error',
              message:
                'Browsing setup failed, continuing with standard processing',
              error: browsingSetupError.message,
              timestamp: new Date().toISOString(),
            });
          }

          // After browsing completes (successful or not), process with the enhanced chat stream
          const stream = await this.intelligenceService.processChatStream(
            data.message,
            userId,
            data.chatId,
            selectedModel,
            data.tools.reasoning,
          );

          await this.handleStreamOutput(client, stream);
        }
        // If only reasoning is enabled (no browsing or research)
        else if (data.tools?.reasoning) {
          const stream = await this.intelligenceService.processChatStream(
            data.message,
            userId,
            data.chatId,
            selectedModel,
            true,
          );

          await this.handleStreamOutput(client, stream);
        } else {
          // Use plain chat stream if no tools are enabled
          const stream = await this.intelligenceService.processChatPlainStream(
            data.message,
            userId,
            data.chatId,
            selectedModel,
          );

          await this.handleStreamOutput(client, stream);
        }
      } catch (innerError) {
        console.error('Stream processing error:', innerError);
        client.emit('chatError', {
          error: `Stream processing failed: ${innerError.message}`,
        });
      }
    } catch (error) {
      console.error('Chat handler error:', error);
      client.emit('chatError', { error: error.message });
    }
  }

  // Helper methods for research and browsing tools
  private async getSearchQueryFromMessage(message: string): Promise<string> {
    const prompt = `You are an expert in evaluating whether a user's message needs web search.
    
    If the message needs search, output a single concise search query.
    If not, just output "no".
    
    User message: "${message}"`;

    // Use direct AI call instead of chat processing to avoid creating threads
    const result = await this.intelligenceService.generateDirectContent(
      AIModels.Llama_4_Scout,
      prompt,
    );

    return result.content.trim();
  }

  private async performSearchForSingleQuery(
    query: string,
    userId?: string,
  ): Promise<any[]> {
    try {
      // Create a collector array for search results
      const resultSources = [];
      let searchCompleted = false;
      let tavilyResults = null;

      // Use the browser service via the public method instead of chat processing
      await this.intelligenceService.performBrowsing(
        query,
        (data) => {
          // Save Tavily raw data if available
          if (data.status === 'tavily_complete' && data.rawTavilyData) {
            tavilyResults = data.rawTavilyData;
          }

          // Process the search data as it comes in
          if (data.status === 'completed' && data.result?.sources) {
            resultSources.push(...data.result.sources);
            searchCompleted = true;
          }
          // Also add any fetched content that comes through during the stream
          else if (data.status === 'fetched' && data.content) {
            // Add source information
            if (data.source) {
              data.content.source = data.source;
            }
            resultSources.push(data.content);
          }
        },
        userId,
      );

      // If we received sources, return them
      if (resultSources.length > 0) {
        // If we have Tavily image results but they weren't added properly in the stream
        if (
          tavilyResults &&
          tavilyResults.images &&
          Array.isArray(tavilyResults.images)
        ) {
          // Check if we already have these images
          const existingImageUrls = new Set(
            resultSources
              .filter((source) => source.source === 'tavily_image')
              .map((source) => source.url),
          );

          // Add any missing Tavily images
          for (const imgUrl of tavilyResults.images) {
            if (!existingImageUrls.has(imgUrl)) {
              resultSources.push({
                url: imgUrl,
                title: 'Image from Tavily',
                content: `![Image](${imgUrl})`,
                source: 'tavily_image',
              });
            }
          }
        }

        return resultSources;
      }

      // If search completed but no sources, return empty
      if (searchCompleted) {
        return [];
      }

      // Fallback to a simpler search if streaming didn't work
      const directSearch =
        await this.intelligenceService.performDirectSearch(query);

      if (directSearch && directSearch.sources) {
        // Add source information to each result
        return directSearch.sources.map((source) => ({
          ...source,
          source: source.title?.includes('Image')
            ? 'tavily_image'
            : source.url?.includes('wikipedia')
              ? 'wikipedia'
              : 'web',
        }));
      }

      return [];
    } catch (error) {
      console.error('Error performing search:', error);
      return [];
    }
  }

  // Replace the entire performDetailedResearch method with a simpler version
  private async performDetailedResearch(queries: string[]): Promise<any[]> {
    const allResults = [];

    for (const query of queries) {
      const queryResults = await this.performSearchForSingleQuery(query);
      allResults.push(...queryResults);
    }

    return allResults;
  }

  // Helper methods for research tool
  private async generateSearchQueries(message: string): Promise<string[]> {
    return this.intelligenceService.extractResearchQueries(message);
  }

  // Indirect way to perform search without directly accessing browserService
  private async performSearchViaIntelligenceService(
    query: string,
    userId?: string,
  ): Promise<any> {
    try {
      // Create a collector array for search results
      const resultSources = [];
      let searchCompleted = false;

      // Use the browser service via the public method instead of chat processing
      await this.intelligenceService.performBrowsing(
        query,
        (data) => {
          // Process the search data as it comes in
          if (data.status === 'completed' && data.result?.sources) {
            resultSources.push(...data.result.sources);
            searchCompleted = true;
          }
          // Also add any fetched content that comes through during the stream
          else if (data.status === 'fetched' && data.content) {
            resultSources.push(data.content);
          }
        },
        userId,
      );

      // If we received sources, return them
      if (resultSources.length > 0) {
        return { sources: resultSources };
      }

      // If search completed but no sources, return empty
      if (searchCompleted) {
        return { sources: [] };
      }

      // Fallback to a simpler search if streaming didn't work
      const directSearch =
        await this.intelligenceService.performDirectSearch(query);
      if (directSearch && directSearch.sources) {
        return directSearch;
      }

      return { sources: [] };
    } catch (error) {
      console.error('Error performing search:', error);
      return { sources: [] };
    }
  }

  private createResearchPrompt(
    existingPrompt: string,
    researchResults: any[],
    userQuestion: string,
  ): string {
    // Extract and format the research results
    const formattedResults = researchResults
      .map((result, index) => {
        const sourceType = result.source ? ` (${result.source})` : '';
        let resultContent = result.content || '';

        // Special handling for image results
        if (result.source === 'tavily_image') {
          return `[${index + 1}] Image${sourceType}: ${result.url}\n${resultContent}\n`;
        }

        return `[${index + 1}] ${result.title || 'Source'} - ${result.url}${sourceType}:\n${resultContent}\n`;
      })
      .join('\n');

    // Base research prompt with improved instructions
    const researchPrompt = `
RESEARCH RESULTS
---------------
The following information has been gathered from reliable sources to answer your question. ALL sources are valuable and should be used equally - do not prioritize any source type (like Wikipedia) over others:

${formattedResults}

Use this comprehensive research to provide a detailed, factual answer with proper citations to the sources above.
`;

    // If there's an existing prompt, append the research to it
    if (existingPrompt && existingPrompt.trim().length > 0) {
      return `${existingPrompt}\n\n${researchPrompt}`;
    }

    // Otherwise, create a complete new system prompt with enhanced capabilities
    return `
You are an exceptional personal assistant with both high IQ and EQ. You excel at helping with writing, coding, mathematics, research, and emotional intelligence. Your responses are thoughtful, accurate, and tailored to the user's needs.

${researchPrompt}

When answering:
1. Synthesize information from ALL sources equally - do not prioritize Wikipedia or any specific source type
2. Present a balanced view of any conflicting information
3. Use clear, precise language and organize your response logically
4. ALWAYS cite your sources using proper markdown format like this: [Source Title](URL) - corresponding to source [X]
5. Include a "References" section at the end listing the numbered sources in markdown format
6. If images are provided (marked with 'tavily_image'), describe them if relevant to the answer and cite them
7. When accessing user-specific information from memory, use the format [Memory-User name] so it can be properly displayed

For coding questions: Provide clean, efficient, well-commented code with explanations
For mathematical problems: Show your work step-by-step with clear reasoning
For writing assistance: Consider tone, audience, and purpose while maintaining the user's voice
For emotional or personal topics: Respond with empathy and understanding

The user's question is: "${userQuestion}"
`;
  }

  // Keep existing endpoints for backward compatibility
  @SubscribeMessage('chatPlainStream')
  async handleChatStreamPlain(
    @ConnectedSocket() client: Socket,
    @MessageBody() createChatDto: CreateChatDto,
  ) {
    try {
      // Get userId directly from client data (set during handleConnection)
      const { userId } = client.data;
      if (!userId) {
        client.emit('chatError', { error: 'User not authenticated' });
        return;
      }

      client.emit('chatStarted', { status: 'processing' });

      try {
        const stream = await this.intelligenceService.processChatPlainStream(
          createChatDto.message,
          userId,
          createChatDto.chatId,
          createChatDto.model,
        );

        await this.handleStreamOutput(client, stream);
      } catch (innerError) {
        console.error('Stream processing error:', innerError);
        client.emit('chatError', {
          error: `Stream processing failed: ${innerError.message}`,
        });
      }
    } catch (error) {
      console.error('Chat handler error:', error);
      client.emit('chatError', { error: error.message });
    }
  }

  @SubscribeMessage('chatStream')
  async handleChatStream(
    @ConnectedSocket() client: Socket,
    @MessageBody() createChatDto: CreateChatDto,
  ) {
    try {
      // Get userId directly from client data (set during handleConnection)
      const userId = client.data.userId;
      if (!userId) {
        client.emit('chatError', { error: 'User not authenticated' });
        return;
      }

      client.emit('chatStarted', { status: 'processing' });

      try {
        const stream = await this.intelligenceService.processChatStream(
          createChatDto.message,
          userId,
          createChatDto.chatId,
          createChatDto.model,
          createChatDto.reasoning,
        );

        await this.handleStreamOutput(client, stream);
      } catch (innerError) {
        console.error('Stream processing error:', innerError);
        client.emit('chatError', {
          error: `Stream processing failed: ${innerError.message}`,
        });
      }
    } catch (error) {
      console.error('Chat handler error:', error);
      client.emit('chatError', { error: error.message });
    }
  }
}
