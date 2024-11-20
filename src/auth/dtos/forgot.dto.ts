import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Data Transfer Object (DTO) for the forgot password request.
 *
 * This class defines the structure of the data required to initiate a password reset process,
 * ensuring that the user's email address is provided in a valid format and is not empty.
 * It utilizes class-validator decorators for validation and Swagger decorators for API documentation.
 *
 * @param {string} email - The email address of the user requesting a password reset, which must be a valid email format.
 * @validation @IsEmail() - Ensures the value is a valid email address.
 * @validation @IsString() - Ensures the value is a string.
 * @validation @IsNotEmpty() - Ensures the string is not empty.
 * @swagger @ApiProperty({ description: 'User email address' }) - Describes the property in the API documentation.
 */
export class ForgotPasswordDto {
  @ApiProperty({ description: 'User email address' })
  @IsEmail()
  @IsString()
  @IsNotEmpty()
  email: string;
}
