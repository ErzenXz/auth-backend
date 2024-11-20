import { IsArray, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Data Transfer Object (DTO) for retrieving photos from multiple albums.
 *
 * This class defines the structure of the data required to specify which albums
 * to retrieve photos from, ensuring that an array of album IDs is provided.
 * It utilizes class-validator decorators for validation and Swagger decorators
 * for API documentation.
 */
export class GetMultipleAlbumPhotoDto {
  /**
   * Array of album IDs to get the photos from.
   *
   * This property must be a non-empty array of numbers representing the IDs of the
   * albums from which photos are to be retrieved. It is required for the retrieval process.
   *
   * @type {number[]}
   * @example [1, 2, 3]
   * @validation @IsArray() - Ensures the value is an array.
   * @validation @IsNotEmpty() - Ensures the array is not empty.
   * @swagger @ApiProperty - Describes the property in the API documentation.
   */
  @ApiProperty({
    type: [Number],
    description: 'Array of album IDs to get the photos from',
  })
  @IsArray()
  @IsNotEmpty()
  albumIds: number[];
}
