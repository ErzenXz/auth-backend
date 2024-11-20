import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Data Transfer Object (DTO) for creating a new album.
 *
 * This class defines the structure of the data required to create an album,
 * ensuring that the title is a non-empty string. It utilizes class-validator
 * decorators for validation and Swagger decorators for API documentation.
 */
export class CreateAlbumDto {
  /**
   * The title of the album.
   *
   * This property must be a non-empty string, which represents the name of the album
   * being created. It is marked as required for the album creation process.
   *
   * @type {string}
   * @example 'My Favorite Songs'
   * @validation @IsString() - Ensures the value is a string.
   * @validation @IsNotEmpty() - Ensures the string is not empty.
   * @swagger @ApiProperty({ description: 'The title of the album' }) - Describes the property in the API documentation.
   */
  @ApiProperty({ description: 'The title of the album' })
  @IsString()
  @IsNotEmpty()
  title: string;
}
