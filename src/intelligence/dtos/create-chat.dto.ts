// CreateChatDto.ts
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
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
}
