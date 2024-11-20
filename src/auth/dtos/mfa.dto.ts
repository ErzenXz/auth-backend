import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Data Transfer Object (DTO) for multi-factor authentication (MFA) verification.
 *
 * This class defines the structure of the data required for a user to complete the
 * multi-factor authentication process, ensuring that the user's email, password,
 * and MFA code are provided and validated. It utilizes class-validator decorators
 * for validation and Swagger decorators for API documentation.
 *
 * @param {string} email - The email address of the user, which must be a valid email format.
 * @param {string} password - The password associated with the user's account.
 * @param {string} code - The multi-factor authentication code provided to the user.
 * @validation @IsEmail() - Ensures the value is a valid email address.
 * @validation @IsString() - Ensures the value is a string.
 * @validation @IsNotEmpty() - Ensures the string is not empty.
 * @swagger @ApiProperty({ description: 'User email address' }) - Describes the email property in the API documentation.
 * @swagger @ApiProperty({ description: 'User password' }) - Describes the password property in the API documentation.
 * @swagger @ApiProperty({ description: 'MFA code' }) - Describes the MFA code property in the API documentation.
 */
export class MfaDto {
  @ApiProperty({ description: 'User email address' })
  @IsEmail()
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'User password' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ description: 'MFA code' })
  @IsString()
  @IsNotEmpty()
  code: string;
}
