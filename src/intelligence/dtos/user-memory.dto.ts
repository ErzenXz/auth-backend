import { IsNotEmpty, IsString } from 'class-validator';

export class CreateUserMemoryDto {
  @IsNotEmpty()
  @IsString()
  key: string;

  @IsNotEmpty()
  @IsString()
  value: string;
}
