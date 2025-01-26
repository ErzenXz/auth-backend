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
  @Auth()
  @Post('dev/instruction/process')
  async processPrompt(
    @Body('instructionId') instructionId: string,
    @Body('prompt') prompt: string,
    @HttpContext() context: IHttpContext,
  ): Promise<AIResponse> {
    return await this.intelligenceService.processDevInstruction(
      instructionId,
      prompt,
      context,
    );
  }

  /**
   * Processes a prompt in beta mode.
   * @param {string} prompt - The prompt to process.
   * @param {IHttpContext} context - The HTTP context containing user information.
   * @returns {Promise<AIResponse>} A promise that resolves to the AI response.
   */
  @Auth()
  @Post('dev/instruction/process/beta')
  async processPromptBeta(
    @Body('prompt') prompt: string,
    @HttpContext() context: IHttpContext,
  ): Promise<AIResponse> {
    return await this.intelligenceService.processDevInstructionBeta(
      prompt,
      context,
    );
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
  async chatStream(
    @Body() createChatDto: CreateChatDto,
    @HttpContext() context: IHttpContext,
    @Res() res: Response,
  ) {
    try {
      const stream = await this.intelligenceService.processChatStream(
        createChatDto.message,
        context.user.id,
        createChatDto.chatId,
        createChatDto.model,
      );

      // Write each chunk to the response
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
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

  /**
   * Get all user chat threads.
   * @param {IHttpContext} context - The HTTP context containing user information.
   */
  @Get('chat/threads')
  @Auth()
  async listChatThreads(@HttpContext() context: IHttpContext) {
    return await this.intelligenceService.getChatThreads(context.user.id);
  }

  /**
   * Get all user chat thread messages.
   * @param {IHttpContext} context - The HTTP context containing user information.
   */
  @Get('chat/thread/:id')
  @Auth()
  async listChatThreadMessages(
    @Param('id') id: string,
    @HttpContext() context: IHttpContext,
  ) {
    return await this.intelligenceService.getChatThreadMessages(
      context.user.id,
      id,
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
}
