import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { AIModels } from '../enums/models.enum';

export class CreateInstructionDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  schema?: string;

  @IsNotEmpty()
  @IsString()
  model: AIModels;
}
