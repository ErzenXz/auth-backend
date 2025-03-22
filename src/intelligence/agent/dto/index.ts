import { StepType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsJSON,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateAgentDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateAgentStepDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(StepType)
  type: StepType;

  @IsObject()
  config: any;

  @IsNumber()
  order: number;

  @IsString()
  @IsOptional()
  nextOnSuccess?: string;

  @IsString()
  @IsOptional()
  nextOnFailure?: string;
}

export class UpdateAgentStepDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(StepType)
  @IsOptional()
  type?: StepType;

  @IsObject()
  @IsOptional()
  config?: any;

  @IsNumber()
  @IsOptional()
  order?: number;

  @IsString()
  @IsOptional()
  nextOnSuccess?: string;

  @IsString()
  @IsOptional()
  nextOnFailure?: string;
}

export class CreateAgentCredentialDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  value: string;
}

export class UpdateAgentCredentialDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  value?: string;
}

export class CreateAgentVariableDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  defaultValue?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateAgentVariableDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  defaultValue?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class ExecuteAgentDto {
  @IsObject()
  input: Record<string, any>;
}

export class AgentExecutionResponseDto {
  @IsUUID()
  id: string;

  @IsString()
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';

  @IsObject()
  @IsOptional()
  output?: any;

  @IsString()
  @IsOptional()
  error?: string;

  @IsArray()
  executionPath: string[];

  @IsString()
  startTime: string;

  @IsString()
  @IsOptional()
  endTime?: string;

  @IsNumber()
  @IsOptional()
  tokenUsage?: number;
}
