import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Data Transfer Object (DTO) for user login.
 *
 * This class defines the structure of the data required for a user to log in,
 * ensuring that both the email and password are provided as non-empty strings.
 * It utilizes class-validator decorators for validation and Swagger decorators for API documentation.
 *
 * @param {string} email - The email address of the user attempting to log in, which must be a valid email format.
 * @param {string} password - The password associated with the user's account.
 * @validation @IsEmail() - Ensures the value is a valid email address.
 * @validation @IsString() - Ensures the value is a string.
 * @validation @IsNotEmpty() - Ensures the string is not empty.
 * @swagger @ApiProperty({ description: 'User email address' }) - Describes the email property in the API documentation.
 * @swagger @ApiProperty({ description: 'User password' }) - Describes the password property in the API documentation.
 */
export class LoginDto {
  @ApiProperty({ description: 'User email address' })
  @IsEmail()
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'User password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
