import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ description: 'User email address' })
  @IsEmail()
  @IsString()
  @IsNotEmpty()
  email: string;
}
