import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

/**
 * Data Transfer Object (DTO) for changing a user's photo.
 *
 * This class defines the structure of the data required to update a user's photo,
 * ensuring that the new photo is provided and is not empty. It utilizes class-validator
 * decorators for validation and Swagger decorators for API documentation.
 *
 * @param {any} photo - The new photo to be assigned to the user, expected to be in binary format.
 * @validation @IsNotEmpty() - Ensures that the photo field is not empty.
 * @swagger @ApiProperty - Describes the property in the API documentation, specifying
 * the type as 'string' and format as 'binary'.
 */
export class ChangePhotoDto {
  @IsNotEmpty()
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'User new photo',
  })
  photo: any;
}
