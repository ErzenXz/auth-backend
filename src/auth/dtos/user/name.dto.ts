import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class NameDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  name: string;
}
