import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsDateString } from 'class-validator';

export class BirthdateDto {
  @IsDateString()
  @IsNotEmpty()
  @ApiProperty({ description: 'User new birthdate' })
  birthdate: string;
}
