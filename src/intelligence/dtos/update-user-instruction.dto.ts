import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateUserInstructionDto {
  @IsOptional()
  @IsString()
  @MinLength(30)
  @MaxLength(200)
  job?: string;
}
