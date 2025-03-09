import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsNotEmpty,
  IsArray,
  ArrayNotEmpty,
} from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ description: 'Name of the project' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Description of the project', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateProjectDto {
  @ApiProperty({ description: 'Name of the project', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ description: 'Description of the project', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateProjectFileDto {
  @ApiProperty({ description: 'Name of the file' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Path of the file' })
  @IsString()
  @IsNotEmpty()
  path: string;

  @ApiProperty({ description: 'Content of the file' })
  @IsString()
  content: string;

  @ApiProperty({ description: 'Optional commit message', required: false })
  @IsString()
  @IsOptional()
  commitMsg?: string;
}

export class UpdateProjectFileDto {
  @ApiProperty({ description: 'Content of the file' })
  @IsString()
  content: string;

  @ApiProperty({ description: 'Optional commit message', required: false })
  @IsString()
  @IsOptional()
  commitMsg?: string;
}

export class RevertFileVersionDto {
  @ApiProperty({ description: 'Version number to revert to' })
  @IsNotEmpty()
  version: number;

  @ApiProperty({
    description: 'Optional commit message for the revert',
    required: false,
  })
  @IsString()
  @IsOptional()
  commitMsg?: string;
}

export class AddProjectCollaboratorDto {
  @ApiProperty({ description: 'User ID to add as collaborator' })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'Role of the collaborator (e.g., "editor", "viewer")',
  })
  @IsString()
  @IsNotEmpty()
  role: string;
}

export class InitializeProjectFilesDto {
  @ApiProperty({ description: 'List of files to initialize' })
  @IsArray()
  @ArrayNotEmpty()
  files: CreateProjectFileDto[];
}

export class DevInstructionDto {
  @ApiProperty({ description: 'Instruction for the AI agent' })
  @IsString()
  @IsNotEmpty()
  instruction: string;

  @ApiProperty({ description: 'Project ID to apply the instruction to' })
  @IsUUID()
  @IsNotEmpty()
  projectId: string;

  @ApiProperty({
    description: 'Thread ID for the conversation context',
    required: false,
  })
  @IsUUID()
  @IsOptional()
  threadId?: string;
}
