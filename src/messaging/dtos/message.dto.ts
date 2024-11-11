import { IsInt, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class MessageDto {
  @IsString()
  @MinLength(1)
  content: string;
}
