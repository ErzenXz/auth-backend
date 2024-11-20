import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsDateString } from 'class-validator';

/**
 * Data Transfer Object (DTO) for changing a user's birthdate.
 *
 * This class defines the structure of the data required to update a user's birthdate,
 * ensuring that the new birthdate is provided as a valid date string. It utilizes
 * class-validator decorators for validation and Swagger decorators for API documentation.
 *
 * @param {string} birthdate - The new birthdate to be assigned to the user, formatted as a date string.
 * @validation @IsDateString() - Ensures the value is a valid date string.
 * @validation @IsNotEmpty() - Ensures the string is not empty.
 * @swagger @ApiProperty - Describes the property in the API documentation.
 */
export class ChangeBirthdateDto {
  @IsDateString()
  @IsNotEmpty()
  @ApiProperty({ description: 'User new birthdate' })
  birthdate: string;
}
