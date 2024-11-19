import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RevokeAccessTokenDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  token: string;
}
