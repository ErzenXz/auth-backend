import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Data Transfer Object (DTO) for changing a user's password.
 *
 * This class defines the structure of the data required to change a user's password,
 * ensuring that both the old and new passwords are provided as non-empty strings.
 * It utilizes class-validator decorators for validation and Swagger decorators for API documentation.
 *
 * @param {string} oldPassword - The current password of the user, which must be provided for verification.
 * @param {string} newPassword - The new password to be set for the user's account.
 * @validation @IsString() - Ensures the value is a string.
 * @validation @IsNotEmpty() - Ensures the string is not empty.
 * @swagger @ApiProperty() - Describes the properties in the API documentation.
 */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  oldPassword: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  newPassword: string;
}
