import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Data Transfer Object (DTO) for changing a user's name.
 *
 * This class defines the structure of the data required to update a user's name,
 * ensuring that the new name is provided as a non-empty string. It utilizes
 * class-validator decorators for validation and Swagger decorators for API documentation.
 *
 * @param {string} name - The new name to be assigned to the user.
 * @validation @IsString() - Ensures the value is a string.
 * @validation @IsNotEmpty() - Ensures the string is not empty.
 * @swagger @ApiProperty() - Describes the property in the API documentation.
 */
export class ChangeNameDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  name: string;
}
