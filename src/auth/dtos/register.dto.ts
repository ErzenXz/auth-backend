import { ApiProperty } from '@nestjs/swagger';
import {
  IsDate,
  IsEmail,
  IsNotEmpty,
  IsString,
  IsStrongPassword,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ description: 'User email address' })
  @IsEmail()
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'User password' })
  @IsStrongPassword()
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ description: 'User full name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'User username' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ description: 'User birthdate' })
  @IsString()
  @IsNotEmpty()
  @IsDate()
  birthdate: Date;

  @ApiProperty({ description: 'User preferred language' })
  @IsString()
  @IsNotEmpty()
  language: string;

  @ApiProperty({ description: 'User timezone' })
  @IsString()
  @IsNotEmpty()
  timezone: string;
}
