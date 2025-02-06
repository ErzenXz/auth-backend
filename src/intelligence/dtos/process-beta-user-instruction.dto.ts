import { IsNotEmpty, IsString } from 'class-validator';

export class ProcessBetaUserInstructionDto {
  @IsString()
  @IsNotEmpty()
  prompt?: string;

  @IsString()
  @IsNotEmpty()
  apiKey?: string;
}
