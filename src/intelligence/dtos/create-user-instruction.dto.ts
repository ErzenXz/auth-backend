import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUserInstructionDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(30)
  @MaxLength(200)
  job: string;
}
