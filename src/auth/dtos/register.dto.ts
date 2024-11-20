import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsString,
  IsStrongPassword,
} from 'class-validator';

/**
 * Data Transfer Object (DTO) for user registration.
 *
 * This class defines the structure of the data required for a user to register,
 * ensuring that all necessary fields such as email, password, name, username,
 * birthdate, language, and timezone are provided and validated. It utilizes
 * class-validator decorators for validation and Swagger decorators for API documentation.
 *
 * @param {string} email - The email address of the user, which must be a valid email format.
 * @param {string} password - The password for the user's account, which must meet strong password criteria.
 * @param {string} name - The full name of the user being registered.
 * @param {string} username - The desired username for the user's account.
 * @param {Date} birthdate - The birthdate of the user, formatted as a date string.
 * @param {string} language - The preferred language of the user for communication.
 * @param {string} timezone - The timezone of the user, used for scheduling and notifications.
 */
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
  @IsDateString()
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
