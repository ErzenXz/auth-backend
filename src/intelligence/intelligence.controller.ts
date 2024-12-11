import {
  Controller,
  Post,
  Body,
  Delete,
  Get,
  Param,
  Put,
} from '@nestjs/common';
import { IntelligenceService } from './intelligence.service';
import { CreateInstructionDto } from './dtos/create-instruction.dto';
import { AIResponse } from './models/intelligence.types';
import { CreateChatDto } from './dtos/create-chat.dto';
import { Auth, HttpContext } from 'src/auth/decorators';
import { IHttpContext } from 'src/auth/models';
import { Role } from 'src/auth/enums';
import { ApiTags } from '@nestjs/swagger';
import { CreateUserInstructionDto } from './dtos/create-user-instruction.dto';
import { UpdateUserInstructionDto } from './dtos/update-user-instruction.dto';

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
  @Get('instructions')
  async listInstructions() {
    return await this.intelligenceService.listInstructions();
  }

  /**
   * Deletes a specific instruction by its ID.
   * @param {number} id - The ID of the instruction to delete.
   * @returns {Promise<void>} A promise that resolves when the instruction is deleted.
   */
  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  @Delete('instruction/:id')
  async deleteInstruction(@Param('id') id: number) {
    return await this.intelligenceService.deleteInstruction(id);
  }

  /**
   * Creates a new instruction.
   * @param {CreateInstructionDto} createInstructionDto - The data transfer object containing instruction details.
   * @returns {Promise<Instruction>} A promise that resolves to the created instruction.
   */
  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  @Post('instruction')
  async createInstruction(@Body() createInstructionDto: CreateInstructionDto) {
    return await this.intelligenceService.createInstruction(
      createInstructionDto.name,
      createInstructionDto.description,
      createInstructionDto.schema,
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
  @Post('process')
  async processPrompt(
    @Body('instructionId') instructionId: number,
    @Body('prompt') prompt: string,
    @HttpContext() context: IHttpContext,
  ): Promise<AIResponse> {
    return await this.intelligenceService.processInstruction(
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
  @Post('process/beta')
  async processPromptBeta(
    @Body('prompt') prompt: string,
    @HttpContext() context: IHttpContext,
  ): Promise<AIResponse> {
    return await this.intelligenceService.processInstructionBeta(
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
  ): Promise<AIResponse> {
    // Process the chat message
    return await this.intelligenceService.processChat(
      createChatDto.message,
      context,
      createChatDto.history,
    );
  }

  /**
   * Lists the user's memory.
   * @param {IHttpContext} context - The HTTP context containing user information.
   * @returns {Promise<UserMemory[]>} A promise that resolves to an array of user memory items.
   */
  @Get('userMemory')
  @Auth()
  async listUserMemory(@HttpContext() context: IHttpContext) {
    return await this.intelligenceService.listUserMemory(context.user.id);
  }

  /**
   * Deletes the user's memory.
   * @param {IHttpContext} context - The HTTP context containing user information.
   * @returns {Promise<void>} A promise that resolves when the user's memory is deleted.
   */
  @Delete('userMemory')
  @Auth()
  async deleteUserMemory(@HttpContext() context: IHttpContext) {
    return await this.intelligenceService.deleteMemory(context.user.id);
  }

  /**
   * Creates a user-specific instruction.
   * @param {CreateUserInstructionDto} createUserInstructionDto - The data transfer object containing user instruction details.
   * @param {IHttpContext} context - The HTTP context containing user information.
   * @returns {Promise<UserInstruction>} A promise that resolves to the created user instruction.
   */
  @Auth()
  @Post('user-instruction')
  async createUserInstruction(
    @Body() createUserInstructionDto: CreateUserInstructionDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.intelligenceService.createUserInstruction(
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
  @Get('user-instruction')
  async getUserInstructions(@HttpContext() context: IHttpContext) {
    return this.intelligenceService.getUserInstructions(context.user.id);
  }

  /**
   * Updates a user-specific instruction by its ID.
   * @param {number} id - The ID of the instruction to update.
   * @param {UpdateUserInstructionDto} updateUserInstructionDto - The data transfer object containing updated instruction details.
   * @param {IHttpContext} context - The HTTP context containing user information.
   * @returns {Promise<UserInstruction>} A promise that resolves to the updated user instruction.
   */
  @Auth()
  @Put('user-instruction/:id')
  async updateUserInstruction(
    @Param('id') id: number,
    @Body() updateUserInstructionDto: UpdateUserInstructionDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.intelligenceService.updateUserInstruction(
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
  @Delete('user-instruction/:id')
  async deleteUserInstruction(
    @Param('id') id: number,
    @HttpContext() context: IHttpContext,
  ) {
    return this.intelligenceService.deleteUserInstruction(context.user.id, id);
  }
}
