import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Data Transfer Object (DTO) for creating a new photo.
 *
 * This class defines the structure of the data required to create a photo,
 * ensuring that the URL is a valid, non-empty string, and optionally allowing
 * for a caption and associated album IDs. It utilizes class-validator decorators
 * for validation and Swagger decorators for API documentation.
 */
export class CreatePhotoDto {
  /**
   * The URL of the photo.
   *
   * This property must be a valid URL string that points to the location of the photo.
   * It is required for the photo creation process.
   *
   * @type {string}
   * @example 'http://example.com/photo.jpg'
   * @validation @IsUrl() - Ensures the value is a valid URL.
   * @validation @IsNotEmpty() - Ensures the string is not empty.
   * @validation @IsString() - Ensures the value is a string.
   * @swagger @ApiProperty - Describes the property in the API documentation.
   */
  @ApiProperty({
    description: 'The URL of the photo',
    example: 'http://example.com/photo.jpg',
  })
  @IsUrl()
  @IsNotEmpty()
  @IsString()
  url: string;

  /**
   * The caption for the photo.
   *
   * This optional property allows for a descriptive caption to be associated with the photo.
   * It must be a string if provided.
   *
   * @type {string}
   * @example 'A beautiful sunset'
   * @validation @IsOptional() - Indicates that this property is optional.
   * @validation @IsString() - Ensures the value is a string if provided.
   * @swagger @ApiPropertyOptional - Describes the optional property in the API documentation.
   */
  @ApiPropertyOptional({
    description: 'The caption for the photo',
    example: 'A beautiful sunset',
  })
  @IsOptional()
  @IsString()
  caption?: string;

  /**
   * The IDs of the albums this photo belongs to.
   *
   * This optional property allows for specifying multiple album IDs that the photo is associated with.
   * It must be an array of numbers if provided.
   *
   * @type {number[]}
   * @example [1, 2, 3]
   * @validation @IsArray() - Ensures the value is an array.
   * @validation @IsOptional() - Indicates that this property is optional.
   * @swagger @ApiPropertyOptional - Describes the optional property in the API documentation.
   */
  @ApiPropertyOptional({
    description: 'The IDs of the albums this photo belongs to',
    example: [1, 2, 3],
  })
  @IsArray()
  @IsOptional()
  albumIds?: string[];
}
