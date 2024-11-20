import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Data Transfer Object (DTO) for resetting a forgotten password.
 *
 * This class defines the structure of the data required to reset a user's password,
 * ensuring that both the reset token and the new password are provided as non-empty strings.
 * It utilizes class-validator decorators for validation and Swagger decorators for API documentation.
 *
 * @param {string} token - The reset token sent to the user for verifying the password reset request.
 * @param {string} password - The new password to be set for the user's account.
 * @validation @IsString() - Ensures the value is a string.
 * @validation @IsNotEmpty() - Ensures the string is not empty.
 * @swagger @ApiProperty() - Describes the properties in the API documentation.
 */
export class ForgotPasswordDtoReset {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  token: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  password: string;
}
