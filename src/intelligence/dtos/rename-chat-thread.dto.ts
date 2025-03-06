import {
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RenameChatThreadDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @MinLength(5)
  name: string;
}
