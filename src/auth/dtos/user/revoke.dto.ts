import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RevokeDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  token: string;
}
