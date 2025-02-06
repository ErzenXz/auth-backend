import { IsNotEmpty, IsString } from 'class-validator';

export class ProcessUserInstructionDto {
  @IsNotEmpty()
  @IsString()
  instructionId: string;

  @IsString()
  @IsNotEmpty()
  prompt?: string;

  @IsString()
  @IsNotEmpty()
  apiKey?: string;
}
