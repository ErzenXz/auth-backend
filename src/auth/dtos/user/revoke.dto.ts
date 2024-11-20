import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Data Transfer Object (DTO) for revoking an access token.
 *
 * This class defines the structure of the data required to revoke a user's access token,
 * ensuring that the token is provided as a non-empty string. It utilizes
 * class-validator decorators for validation and Swagger decorators for API documentation.
 *
 * @param {string} token - The access token to be revoked.
 * @validation @IsString() - Ensures the value is a string.
 * @validation @IsNotEmpty() - Ensures the string is not empty.
 * @swagger @ApiProperty() - Describes the property in the API documentation.
 */
export class RevokeAccessTokenDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  token: string;
}
