import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateInstructionDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
