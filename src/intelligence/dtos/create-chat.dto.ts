// CreateChatDto.ts
import { IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';
import { AIModels } from '../enums/models.enum';

export class ChatMessageDto {
  @IsString()
  sender: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  timestamp?: string;
}

export class CreateChatDto {
  @IsNotEmpty()
  @IsString()
  message: string;

  @IsString()
  @IsOptional()
  chatId?: string;

  @IsNotEmpty()
  model: AIModels;

  @IsOptional()
  @IsBoolean()
  reasoning?: boolean = false;
}
