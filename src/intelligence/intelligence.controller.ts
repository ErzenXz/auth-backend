import {
  Controller,
  Post,
  Body,
  Delete,
  Get,
  Param,
  Put,
  Res,
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
import { Response } from 'express';

@ApiTags('Intelligence')
@Controller('intelligence')
export class IntelligenceController {
  constructor(private readonly intelligenceService: IntelligenceService) {}

  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  @Get('instructions')
  async listInstructions() {
    return await this.intelligenceService.listInstructions();
  }

  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  @Delete('instruction/:id')
  async deleteInstruction(@Param('id') id: number) {
    return await this.intelligenceService.deleteInstruction(id);
  }

  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  @Post('instruction')
  async createInstruction(@Body() createInstructionDto: CreateInstructionDto) {
    return await this.intelligenceService.createInstruction(
      createInstructionDto.name,
      createInstructionDto.description,
      createInstructionDto.schema,
    );
  }

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

  @Get('userMemory')
  @Auth()
  async listUserMemory(@HttpContext() context: IHttpContext) {
    return await this.intelligenceService.listUserMemory(context.user.id);
  }

  @Delete('userMemory')
  @Auth()
  async deleteUserMemory(@HttpContext() context: IHttpContext) {
    return await this.intelligenceService.deleteMemory(context.user.id);
  }

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

  @Auth()
  @Get('user-instruction')
  async getUserInstructions(@HttpContext() context: IHttpContext) {
    return this.intelligenceService.getUserInstructions(context.user.id);
  }

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

  @Auth()
  @Delete('user-instruction/:id')
  async deleteUserInstruction(
    @Param('id') id: number,
    @HttpContext() context: IHttpContext,
  ) {
    return this.intelligenceService.deleteUserInstruction(context.user.id, id);
  }
}
