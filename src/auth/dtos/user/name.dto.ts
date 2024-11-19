import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ChangeNameDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  name: string;
}
