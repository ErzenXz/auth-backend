import {
  Controller,
  Post,
  Body,
  Delete,
  Get,
  Param,
  Put,
  Header,
  Res,
  Query,
  Sse,
} from '@nestjs/common';
import { Response } from 'express';
import { IntelligenceService } from './intelligence.service';
import { CreateInstructionDto } from './dtos/create-instruction.dto';
import { CreateChatDto } from './dtos/create-chat.dto';
import { Auth, HttpContext } from 'src/auth/decorators';
import { IHttpContext } from 'src/auth/models';
import { Role } from 'src/auth/enums';
import { ApiTags } from '@nestjs/swagger';
import { CreateUserInstructionDto } from './dtos/create-user-instruction.dto';
import { UpdateUserInstructionDto } from './dtos/update-user-instruction.dto';
import { AIResponse } from './models/ai-wrapper.types';
import { ProcessUserInstructionDto } from './dtos/process-user-instruction.dto';
import { ProcessBetaUserInstructionDto } from './dtos/process-beta-user-instruction.dto';
import { CreateApplicationDto } from './dtos/create-application.dto';
import { Observable } from 'rxjs';

/**
 * IntelligenceController handles operations related to intelligence instructions and user memory.
 * It provides endpoints for listing, creating, updating, and deleting instructions, as well as processing prompts and managing user-specific instructions and memory.
 */
@ApiTags('Intelligence')
@Controller('intelligence')
export class IntelligenceController {
  constructor(private readonly intelligenceService: IntelligenceService) {}

  /**
   * Lists all available instructions.
   * @returns {Promise<Instruction[]>} A promise that resolves to an array of instructions.
   */
  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  @Get('dev/instructions')
  async listInstructions() {
    return await this.intelligenceService.listInstructions();
  }

  /**
   * Deletes a specific instruction by its ID.
   * @param {number} id - The ID of the instruction to delete.
   * @returns {Promise<void>} A promise that resolves when the instruction is deleted.
   */
  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  @Delete('dev/instruction/:id')
  async deleteInstruction(@Param('id') id: string) {
    return await this.intelligenceService.deleteDevInstruction(id);
  }

  /**
   * Retrieves all instructions created by the user.
   * @param {number} IHttpContext - The HTTP context containing user information.
   * @returns {Promise<Instruction>} A promise that resolves to the instruction.
   */
  @Auth()
  @Get('dev/instructions/user')
  async listUserInstructions(@HttpContext() context: IHttpContext) {
    return await this.intelligenceService.listDevInstructions(context.user.id);
  }

  @Auth()
  @Post('dev/applications')
  async createApplication(
    @Body() bodyRequest: CreateApplicationDto,
    @HttpContext() context: IHttpContext,
  ) {
    return await this.intelligenceService.createApplication(
      bodyRequest,
      context.user.id,
    );
  }

  @Auth()
  @Get('dev/applications')
  async listApplications(@HttpContext() context: IHttpContext) {
    return await this.intelligenceService.listApplications(context.user.id);
  }

  @Auth()
  @Get('dev/application/:id')
  async getApplication(
    @Param('id') id: string,
    @HttpContext() context: IHttpContext,
  ) {
    return await this.intelligenceService.getApplication(id, context.user.id);
  }

  @Auth()
  @Put('dev/application/:id')
  async updateApplication(
    @Param('id') id: string,
    @Body() bodyRequest: any,
    @HttpContext() context: IHttpContext,
  ) {
    return await this.intelligenceService.updateApplication(
      id,
      bodyRequest,
      context.user.id,
    );
  }

  @Auth()
  @Delete('dev/application/:id')
  async deleteApplication(
    @Param('id') id: string,
    @HttpContext() context: IHttpContext,
  ) {
    return await this.intelligenceService.deleteApplication(
      id,
      context.user.id,
    );
  }

  @Auth()
  @Get('dev/applications/billing')
  async getBillingInfo(@HttpContext() context: IHttpContext) {
    return await this.intelligenceService.getBillingInfo(context.user.id);
  }

  @Get('dev/intelligence/models')
  async listModels() {
    return await this.intelligenceService.listModels();
  }

  @Get('dev/intelligence/models/:id')
  async getModel(@Param('id') id: string) {
    return await this.intelligenceService.getModel(id);
  }

  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  @Post('dev/intelligence/models')
  async createModel(@Body() bodyRequest: any) {
    return await this.intelligenceService.createModel(bodyRequest);
  }

  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  @Post('dev/intelligence/models/bulk-add')
  async bulkAddModels() {
    return await this.intelligenceService.bulkAddModels();
  }

  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  @Put('dev/intelligence/models/:id')
  async updateModel(@Param('id') id: string, @Body() bodyRequest: any) {
    return await this.intelligenceService.updateModel(id, bodyRequest);
  }

  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  @Delete('dev/intelligence/models/:id')
  async deleteModel(@Param('id') id: string) {
    return await this.intelligenceService.deleteModel(id);
  }

  /**
   * Creates a new instruction.
   * @param {CreateInstructionDto} createInstructionDto - The data transfer object containing instruction details.
   * @returns {Promise<Instruction>} A promise that resolves to the created instruction.
   */
  @Auth()
  @Post('dev/instruction')
  async createInstruction(
    @HttpContext() context: IHttpContext,
    @Body() createInstructionDto: CreateInstructionDto,
  ) {
    return await this.intelligenceService.createDevInstruction(
      createInstructionDto.name,
      context.user.id,
      createInstructionDto.description,
      createInstructionDto.schema,
      createInstructionDto.model,
    );
  }

  /**
   * Processes a prompt using a specified instruction ID.
   * @param {number} instructionId - The ID of the instruction to use.
   * @param {string} prompt - The prompt to process.
   * @param {IHttpContext} context - The HTTP context containing user information.
   * @returns {Promise<AIResponse>} A promise that resolves to the AI response.
   */
  @Post('dev/instruction/process')
  async processPrompt(
    @Body() bodyRequest: ProcessUserInstructionDto,
  ): Promise<AIResponse> {
    const { instructionId, prompt, apiKey } = bodyRequest;
    return await this.intelligenceService.processDevInstruction(
      instructionId,
      prompt,
      apiKey,
    );
  }

  /**
   * Processes a prompt in beta mode.
   * @param {string} prompt - The prompt to process.
   * @param {IHttpContext} context - The HTTP context containing user information.
   * @returns {Promise<AIResponse>} A promise that resolves to the AI response.
   */
  @Post('dev/instruction/process/beta')
  async processPromptBeta(
    @Body() bodyReq: ProcessBetaUserInstructionDto,
  ): Promise<AIResponse> {
    const { prompt, apiKey } = bodyReq;
    return await this.intelligenceService.processDevInstructionBeta(
      prompt,
      apiKey,
    );
  }

  /**
   * Processes a chat message.
   * @param {CreateChatDto} createChatDto - The data transfer object containing chat message details.
   * @param {IHttpContext} context - The HTTP context containing user information.
   * @returns {Promise<AIResponse>} A promise that resolves to the AI response.
   * @deprecated Use /chat endpoint instead (not recommended).
   * @see /chat
   */
  @Post('chat/plain')
  @Auth()
  async chatPlain(
    @Body() createChatDto: CreateChatDto,
    @HttpContext() context: IHttpContext,
  ): Promise<any> {
    return await this.intelligenceService.processChatPlain(
      createChatDto.message,
      context.user.id,
      createChatDto.chatId,
      createChatDto.model,
    );
  }

  /**
   * Processes a chat message with streaming response.
   * @param {CreateChatDto} createChatDto - The chat message details.
   * @param {IHttpContext} context - HTTP context with user info.
   * @param {Response} res - Express response object.
   * @deprecated Use /chat/stream endpoint instead (not recommended).
   * @returns {Promise<void>}
   */
  @Post('chat/plain/stream')
  @Auth()
  async chatStreamPlain(
    @Body() createChatDto: CreateChatDto,
    @HttpContext() context: IHttpContext,
    @Res() res: Response,
  ) {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Connection', 'keep-alive'); // Keep connections alive
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const stream = await this.intelligenceService.processChatPlainStream(
        createChatDto.message,
        context.user.id,
        createChatDto.chatId,
        createChatDto.model,
      );

      // Use a timer to ensure chunks are flushed regularly
      let chunkCount = 0;

      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        chunkCount++;

        // Force flush every few chunks to prevent buffering
        if (chunkCount % 3 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      }

      // Send a final event to indicate completion
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      res
        .status(500)
        .write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }

  /**
   * Processes a chat message.
   * @param {CreateChatDto} createChatDto - The data transfer object containing chat message details.
   * @param {IHttpContext} context - The HTTP context containing user information.
   * @returns {Promise<AIResponse>} A promise that resolves to the AI response.
   */
  @Post('chat')
  @Auth()
  async chat(
    @Body() createChatDto: CreateChatDto,
    @HttpContext() context: IHttpContext,
  ): Promise<any> {
    // Process the chat message
    return await this.intelligenceService.processChat(
      createChatDto.message,
      context.user.id,
      createChatDto.chatId,
      createChatDto.model,
      createChatDto.reasoning,
    );
  }

  /**
   * Processes a chat message with streaming response.
   * @param {CreateChatDto} createChatDto - The chat message details.
   * @param {IHttpContext} context - HTTP context with user info.
   * @param {Response} res - Express response object.
   * @returns {Promise<void>}
   */
  @Post('chat/stream')
  @Auth()
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  @Header('Transfer-Encoding', 'chunked')
  async chatStream(
    @Body() createChatDto: CreateChatDto,
    @HttpContext() context: IHttpContext,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.flushHeaders();
    try {
      const stream = await this.intelligenceService.processChatStream(
        createChatDto.message,
        context.user.id,
        createChatDto.chatId,
        createChatDto.model,
        createChatDto.reasoning,
      );

      // Write each chunk to the response
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        res.flush();
      }

      // End the response
      res.end();
    } catch (error) {
      res
        .status(500)
        .write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }

  @Post('chat/reasoning')
  @Auth()
  async reasoning(
    @Body() createChatDto: CreateChatDto,
    @HttpContext() context: IHttpContext,
  ): Promise<any> {
    return await this.intelligenceService.processChainOfThought(
      createChatDto.message,
      context.user.id,
      createChatDto.model,
    );
  }

  @Post('chat/reasoning/draft')
  @Auth()
  async reasoningDraft(
    @Body() createChatDto: CreateChatDto,
    @HttpContext() context: IHttpContext,
  ): Promise<any> {
    return await this.intelligenceService.processChainOfDrafts(
      createChatDto.message,
      context.user.id,
      createChatDto.model,
    );
  }

  @Sse('chat/reasoning/stream')
  @Auth()
  async streamReasoning(
    @Body() createChatDto: CreateChatDto,
    @HttpContext() context: IHttpContext,
  ) {
    const stream = this.intelligenceService.streamChainOfThought(
      createChatDto.message,
      context.user.id,
      createChatDto.model,
    );

    return new Observable((subscriber) => {
      (async () => {
        try {
          for await (const event of stream) {
            subscriber.next({ data: JSON.stringify(event) });
          }
          subscriber.complete();
        } catch (error) {
          subscriber.error({ error: error.message });
        }
      })();
    });
  }

  /**
   * Get all user chat threads with pagination.
   * @param {IHttpContext} context - The HTTP context containing user information.
   * @param {number} page - Page number (default: 1)
   * @param {number} limit - Items per page (default: 10)
   */
  @Get('chat/threads')
  @Auth()
  async listChatThreads(
    @HttpContext() context: IHttpContext,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return await this.intelligenceService.getChatThreads(
      context.user.id,
      +page,
      +limit,
    );
  }
  /**
   * Get all user chat thread messages with pagination.
   * @param {string} id - Thread ID
   * @param {IHttpContext} context - The HTTP context containing user information.
   * @param {number} page - Page number (default: 1)
   * @param {number} limit - Items per page (default: 10)
   */
  @Get('chat/thread/:id')
  @Auth()
  async listChatThreadMessages(
    @Param('id') id: string,
    @HttpContext() context: IHttpContext,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return await this.intelligenceService.getChatThreadMessages(
      context.user.id,
      id,
      +page,
      +limit,
    );
  }

  /**
   * Delete a chat thread
   * @param {string} id - Thread ID
   * @param {IHttpContext} context - The HTTP context containing user information.
   */
  @Delete('chat/thread/:id')
  @Auth()
  async deleteChatThread(
    @Param('id') id: string,
    @HttpContext() context: IHttpContext,
  ) {
    return await this.intelligenceService.deleteChatThread(context.user.id, id);
  }

  /**
   * Duplicate a chat thread
   * @param {string} id - Thread ID
   * @param {IHttpContext} context - The HTTP context containing user information.
   */
  @Post('chat/thread/:id/duplicate')
  @Auth()
  async duplicateChatThread(
    @Param('id') id: string,
    @HttpContext() context: IHttpContext,
  ) {
    return await this.intelligenceService.duplicateChatThread(
      context.user.id,
      id,
    );
  }

  /**
   * Rename a chat thread
   * @param {string} id - Thread ID
   * @param {IHttpContext} context - The HTTP context containing user information.
   * @param {Object} body - Request body containing new name
   */
  @Put('chat/thread/:id/rename')
  @Auth()
  async renameChatThread(
    @Param('id') id: string,
    @Body() body: { name: string },
    @HttpContext() context: IHttpContext,
  ) {
    return await this.intelligenceService.renameChatThread(
      context.user.id,
      id,
      body.name,
    );
  }

  /**
   * Lists the user's memory.
   * @param {IHttpContext} context - The HTTP context containing user information.
   * @returns {Promise<UserMemory[]>} A promise that resolves to an array of user memory items.
   */
  @Get('chat/memory')
  @Auth()
  async listUserMemory(@HttpContext() context: IHttpContext) {
    return await this.intelligenceService.getChatMemory(context.user.id);
  }

  /**
   * Deletes the user's memory.
   * @param {IHttpContext} context - The HTTP context containing user information.
   * @returns {Promise<void>} A promise that resolves when the user's memory is deleted.
   */
  @Delete('chat/memory')
  @Auth()
  async deleteUserMemory(@HttpContext() context: IHttpContext) {
    return await this.intelligenceService.deleteChatMemory(context.user.id);
  }

  /**
   * Creates a user-specific instruction.
   * @param {CreateUserInstructionDto} createUserInstructionDto - The data transfer object containing user instruction details.
   * @param {IHttpContext} context - The HTTP context containing user information.
   * @returns {Promise<UserInstruction>} A promise that resolves to the created user instruction.
   */
  @Auth()
  @Post('chat/instruction')
  async createUserInstruction(
    @Body() createUserInstructionDto: CreateUserInstructionDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.intelligenceService.createChatUserInstruction(
      context.user.id,
      createUserInstructionDto.job,
    );
  }

  /**
   * Retrieves all user-specific instructions.
   * @param {IHttpContext} context - The HTTP context containing user information.
   * @returns {Promise<UserInstruction[]>} A promise that resolves to an array of user instructions.
   */
  @Auth()
  @Get('chat/instruction')
  async getUserInstructions(@HttpContext() context: IHttpContext) {
    return this.intelligenceService.getChatUserInstructions(context.user.id);
  }

  /**
   * Updates a user-specific instruction by its ID.
   * @param {number} id - The ID of the instruction to update.
   * @param {UpdateUserInstructionDto} updateUserInstructionDto - The data transfer object containing updated instruction details.
   * @param {IHttpContext} context - The HTTP context containing user information.
   * @returns {Promise<UserInstruction>} A promise that resolves to the updated user instruction.
   */
  @Auth()
  @Put('chat/instruction/:id')
  async updateUserInstruction(
    @Param('id') id: string,
    @Body() updateUserInstructionDto: UpdateUserInstructionDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.intelligenceService.updateChatUserInstruction(
      context.user.id,
      id,
      updateUserInstructionDto.job,
    );
  }

  /**
   * Deletes a user-specific instruction by its ID.
   * @param {number} id - The ID of the instruction to delete.
   * @param {IHttpContext} context - The HTTP context containing user information.
   * @returns {Promise<void>} A promise that resolves when the user instruction is deleted.
   */
  @Auth()
  @Delete('chat/instruction/:id')
  async deleteUserInstruction(
    @Param('id') id: string,
    @HttpContext() context: IHttpContext,
  ) {
    return this.intelligenceService.deleteChatUserInstruction(
      context.user.id,
      id,
    );
  }

  /**
   * Get all chat threads with their messages
   * @param {IHttpContext} context - The HTTP context containing user information.
   */
  @Get('chat/threads/sync')
  @Auth()
  async syncChatThreads(@HttpContext() context: IHttpContext) {
    return await this.intelligenceService.getAllChatThreadsWithMessages(
      context.user.id,
    );
  }

  /**
   * Export a specific chat thread
   * @param {string} id - Thread ID to export
   * @param {IHttpContext} context - The HTTP context containing user information
   * @param {Response} res - Express response object
   */
  @Get('chat/thread/:id/export')
  @Auth()
  @Header('Content-Type', 'application/json')
  async exportChatThread(
    @Param('id') id: string,
    @HttpContext() context: IHttpContext,
    @Res() res: Response,
  ) {
    const thread = await this.intelligenceService.getChatThreadForExport(
      context.user.id,
      id,
    );

    const filename = `chat-thread-${id}-${new Date().toISOString()}.json`;
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    return res.send(thread);
  }

  /**
   * Export all chat threads for the user
   * @param {IHttpContext} context - The HTTP context containing user information
   * @param {Response} res - Express response object
   */
  @Get('chat/threads/export')
  @Auth()
  @Header('Content-Type', 'application/json')
  async exportAllChatThreads(
    @HttpContext() context: IHttpContext,
    @Res() res: Response,
  ) {
    const threads = await this.intelligenceService.getAllChatThreadsForExport(
      context.user.id,
    );

    const filename = `all-chat-threads-${new Date().toISOString()}.json`;
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    return res.send(threads);
  }
}
